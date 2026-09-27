import assert from "node:assert/strict";
import { selectU3Workspace } from "./pre-z8-u3-workspace.mjs";
import {
  assertU3Idle,
  captureU3,
  instantiateU3Draft,
  openU3Details,
  readGraphRecord,
  saveU3Draft,
  selectNode,
  selectValue,
  u3DefinitionContent,
} from "./pre-z8-u3-common.mjs";

export async function verifyU3LosslessTask(isolation, window, summary) {
  await selectNode(window, "analyze");
  const record = await readGraphRecord(isolation);
  const node = record.definition.nodes.find((item) => item.id === "analyze");
  await window.getByTestId("graph-editor-guided").click();
  await window.getByTestId("graph-editor-advanced").click();
  assert.equal(await window.getByTestId("graph-instructions").inputValue(), node.instructions);
  assert.deepEqual(await readGraphRecord(isolation), record);
  const instructions = window.getByTestId("graph-instructions");
  await instructions.focus();
  await instructions.press("Control+Home");
  await instructions.press("Delete");
  assert.equal(await instructions.inputValue(), node.instructions.slice(1));
  assert.equal(await window.getByTestId("graph-delete-impact").isVisible(), false);
  assert.equal(
    await window.locator('[data-testid^="graph-select-node-"]').count(),
    record.definition.nodes.length,
  );
  await instructions.fill(node.instructions);
  const custom = `${node.instructions}\nCustom repeated binding preserved exactly: {{inputs.${node.inputs[0].alias}}}\n`;
  await instructions.fill(custom);
  const unsupported = await saveU3Draft(isolation, window);
  await window.getByTestId("graph-editor-guided").click();
  await window
    .getByTestId("graph-node-inspector")
    .getByTestId("graph-guided-unsupported")
    .waitFor();
  assert.ok(
    (
      await window
        .getByTestId("graph-node-inspector")
        .getByTestId("graph-guided-unsupported")
        .innerText()
    ).includes(custom.trimEnd()),
  );
  await captureU3(isolation, window, summary, "pre-z8-u3-advanced-only-lossless-text");
  await window.getByTestId("graph-editor-advanced").click();
  assert.equal(await instructions.inputValue(), custom);
  assert.deepEqual(await readGraphRecord(isolation), unsupported);
  await instructions.fill(node.instructions);
  const restored = await saveU3Draft(isolation, window);
  assert.deepEqual(
    u3DefinitionContent(restored.definition),
    u3DefinitionContent(record.definition),
  );
  for (const id of ["start", "end"]) {
    await selectNode(window, id);
    assert.equal(await window.getByTestId("graph-delete-node").count(), 0);
    await window.getByTestId(`graph-select-node-${id}`).focus();
    await window.keyboard.press("Delete");
    assert.equal(await window.getByTestId(`graph-select-node-${id}`).count(), 1);
  }
  await assertU3Idle(isolation, "lossless task modes and keyboard Delete", restored);
  summary.assertions.push(
    "Guided/Advanced toggles preserve the whole canonical definition. Repeated custom binding text stays explicitly Advanced-only and byte-exact; Delete inside instructions edits only text, and Start/End expose no deletion action.",
  );
}

export async function instantiateU3Repair(isolation, window, summary) {
  await window.getByTestId("graph-view-workflows").click();
  await selectValue(window, "graph-library-entry", "bugfix");
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  await window
    .getByTestId("graph-template-parameter-request")
    .fill(
      "Synthetic editor acceptance only. Inspect finite repair declarations; do not execute this design.",
    );
  await selectValue(window, "graph-template-recipe-build", "u3-build");
  await selectValue(window, "graph-template-recipe-test", "u3-test-1");
  await selectValue(window, "graph-template-build-test", "build");
  await openU3Details(window.getByTestId("graph-template-tests-test"));
  await window.getByTestId("graph-template-test-test-u3-test-2").setChecked(true);
  await window.getByTestId("graph-template-source-paths").fill("fixture.mjs");
  const record = await instantiateU3Draft(isolation, window, "bugfix");
  const tests = record.definition.nodes.filter(
    (node) => node.type === "tool" && node.verification?.kind === "test",
  );
  assert.equal(tests.length, 2);
  assert.deepEqual(
    tests.map((node) => node.recipeId),
    ["u3-test-1", "u3-test-2"],
  );
  assert.ok(tests.every((node) => node.verification.buildNodeId === "build"));
  const decision = record.definition.nodes.find((node) => node.id === "decision");
  assert.deepEqual(
    decision.verification.testNodeIds,
    tests.map((node) => node.id),
  );
  summary.editorRepairDefinition = record.definition;
  await assertU3Idle(isolation, "two-Test bounded repair instantiation");
  return record;
}

export async function verifyU3InvalidBuffers(isolation, window, summary, secondary) {
  const original = await readGraphRecord(isolation);
  const malformed = {
    schema: '{"type":"object", BROKEN U3',
    inputs: '[{"alias": BROKEN U3',
    branches: '[{"exit": BROKEN U3',
    verification: '{"testNodeIds": BROKEN U3',
  };
  await window.getByTestId("graph-editor-advanced").click();
  await selectNode(window, "reviewer");
  await window.getByTestId("graph-output-schema").fill(malformed.schema);
  await window.getByTestId("graph-apply-schema").click();
  await window.getByTestId("graph-node-inspector").getByRole("alert").waitFor();
  await window.getByTestId("graph-editor-guided").click();
  const reviewer = original.definition.nodes.find((node) => node.id === "reviewer");
  assert.deepEqual(
    JSON.parse(await window.getByTestId("graph-guided-output-schema").textContent()),
    reviewer.output.schema,
  );
  await window.getByTestId("graph-editor-advanced").click();
  await selectNode(window, "decision");
  for (const key of ["inputs", "branches", "verification"])
    await window.getByTestId(`graph-condition-${key}`).fill(malformed[key]);
  await window.getByTestId("graph-condition-apply").click();
  await window.getByTestId("graph-node-inspector").getByRole("alert").waitFor();
  await window.getByTestId("graph-editor-guided").click();
  await window
    .getByTestId("graph-node-inspector")
    .getByTestId("graph-guided-unsupported")
    .waitFor();
  await selectU3Workspace(window, secondary);
  await window.getByTestId("graph-view-design").click();
  assert.equal(
    await window.getByTestId("graph-name").inputValue(),
    "PRE_Z8_U3_SECONDARY_UNSAVED_DRAFT",
  );
  await selectU3Workspace(window, isolation.workspace);
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-editor-advanced").click();
  await selectNode(window, "reviewer");
  assert.equal(await window.getByTestId("graph-output-schema").count(), 1);
  assert.equal(await window.getByTestId("graph-output-schema").inputValue(), malformed.schema);
  await selectNode(window, "decision");
  for (const key of ["inputs", "branches", "verification"]) {
    assert.equal(await window.getByTestId(`graph-condition-${key}`).count(), 1);
    assert.equal(await window.getByTestId(`graph-condition-${key}`).inputValue(), malformed[key]);
  }
  assert.equal(await window.getByTestId("graph-save").isDisabled(), true);
  assert.deepEqual(await readGraphRecord(isolation), original);
  await captureU3(isolation, window, summary, "pre-z8-u3-invalid-buffers-retained");
  const decision = original.definition.nodes.find((node) => node.id === "decision");
  for (const key of ["inputs", "branches", "verification"])
    await window.getByTestId(`graph-condition-${key}`).fill(JSON.stringify(decision[key], null, 2));
  await window.getByTestId("graph-condition-apply").click();
  await selectNode(window, "reviewer");
  await window
    .getByTestId("graph-output-schema")
    .fill(JSON.stringify(reviewer.output.schema, null, 2));
  await window.getByTestId("graph-apply-schema").click();
  await assertU3Idle(isolation, "invalid raw buffers and workspace/node/mode recovery", original);
  summary.invalidBuffers = malformed;
  summary.assertions.push(
    "Malformed schema and all Condition JSON buffers survive Guided/Advanced, node and public workspace switches. Failed Apply never changes canonical definitions or enables Save; explicit restoration retains both Test scopes and all settings.",
  );
}

export async function verifyU3RepairPolicy(isolation, window, summary) {
  const original = await readGraphRecord(isolation);
  await window.getByTestId("graph-editor-guided").click();
  await openU3Details(window.getByTestId("graph-guided-repair"));
  assert.equal(await window.getByTestId("graph-repair-additional").inputValue(), "2");
  assert.equal(await window.getByTestId("graph-repair-minutes").inputValue(), "30");
  assert.equal(await window.getByTestId("graph-repair-admissions").inputValue(), "24");
  assert.equal(await window.getByTestId("graph-repair-no-progress").isChecked(), true);
  const decision = original.definition.nodes.find((node) => node.id === "decision");
  const summaryText = await window.getByTestId("graph-repair-summary").innerText();
  for (const id of [...decision.verification.testNodeIds, original.definition.routing.finalGateId])
    assert.ok(summaryText.includes(id));
  await captureU3(isolation, window, summary, "pre-z8-u3-repair-defaults-two-tests");
  for (const [field, invalid, restore] of [
    ["additional", "-1", "2"],
    ["additional", "6", "2"],
    ["minutes", "1441", "30"],
    ["admissions", "65", "24"],
  ]) {
    await window.getByTestId(`graph-repair-${field}`).fill(invalid);
    await window.getByTestId("graph-repair-apply").click();
    await window.getByTestId("graph-guided-repair").getByRole("alert").waitFor();
    assert.equal(await window.getByTestId("graph-save").isDisabled(), true);
    assert.deepEqual(await readGraphRecord(isolation), original);
    await window.getByTestId(`graph-repair-${field}`).fill(restore);
  }
  await window.getByTestId("graph-repair-additional").fill("1");
  await window.getByTestId("graph-repair-minutes").fill("40");
  await window.getByTestId("graph-repair-admissions").fill("32");
  await window.getByTestId("graph-repair-apply").click();
  const updated = await saveU3Draft(isolation, window);
  const expected = structuredClone(original.definition);
  expected.routing.region.maxRepairIterations = 1;
  expected.routing.limits = { maxNodeAdmissions: 32, deadlineMs: 40 * 60000 };
  assert.deepEqual(u3DefinitionContent(updated.definition), u3DefinitionContent(expected));
  await window.getByTestId("graph-editor-advanced").click();
  await window.getByTestId("graph-editor-guided").click();
  await openU3Details(window.getByTestId("graph-guided-repair"));
  assert.equal(await window.getByTestId("graph-repair-additional").inputValue(), "1");
  await assertU3Idle(isolation, "bounded explicit repair policy", updated);
  summary.repairPolicy = {
    initial: original.definition.routing,
    updated: updated.definition.routing,
    testNodeIds: decision.verification.testNodeIds,
    rejected: ["additional=-1", "additional=6", "minutes=1441", "admissions=65"],
  };
  summary.assertions.push(
    "The existing repair preset shows one initial attempt, two additional repairs, thirty minutes and twenty-four admissions with both Tests and the final gate. Invalid bounds change no canonical data; an explicit valid policy changes only the three declared limits.",
  );
}
