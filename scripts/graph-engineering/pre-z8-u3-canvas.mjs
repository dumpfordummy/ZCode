import assert from "node:assert/strict";
import {
  assertU3Idle,
  captureU3,
  readGraphRecord,
  saveU3Draft,
  selectNode,
  selectValue,
  u3DefinitionContent,
} from "./pre-z8-u3-common.mjs";

const edgeKey = (edge) => JSON.stringify([edge.source, edge.sourcePort ?? null, edge.target]);

export async function verifyU3Canvas(isolation, window, summary) {
  const original = await readGraphRecord(isolation);
  const edge = original.definition.edges.find(
    (item) => item.source === "decision" && item.sourcePort === "pass",
  );
  assert.ok(edge);
  await window.getByTestId("graph-edge-select").click();
  const options = window.getByRole("option");
  // JSON 边身份含引号；比较真实属性值，不能拼进旧 helper 的未转义 CSS 选择器。
  const indexes = await options.evaluateAll(
    (elements, value) =>
      elements.flatMap((element, index) =>
        element.getAttribute("data-value") === value ? [index] : [],
      ),
    edgeKey(edge),
  );
  assert.equal(indexes.length, 1);
  await options.nth(indexes[0]).click();
  await window.getByTestId("graph-insert-on-edge").click();
  const insertedId = await window.getByTestId("graph-node-inspector").getAttribute("data-node-id");
  assert.ok(!original.definition.nodes.some((node) => node.id === insertedId));
  await window
    .getByTestId("graph-instructions")
    .fill("Synthetic editor-only inserted step. No execution is authorized.");
  const inserted = await saveU3Draft(isolation, window);
  assert.equal(inserted.definition.nodes.length, original.definition.nodes.length + 1);
  assert.deepEqual(
    inserted.definition.nodes.filter((node) => node.id !== insertedId),
    original.definition.nodes,
  );
  assert.deepEqual(
    inserted.definition.edges.filter(
      (item) => item.source !== insertedId && item.target !== insertedId,
    ),
    original.definition.edges.filter((item) => edgeKey(item) !== edgeKey(edge)),
  );
  assert.deepEqual(
    inserted.definition.edges.find(
      (item) => item.source === "decision" && item.sourcePort === "pass",
    ),
    { ...edge, target: insertedId },
  );
  assert.deepEqual(
    inserted.definition.edges.find((item) => item.source === insertedId),
    { source: insertedId, target: edge.target },
  );
  await window.getByTestId("graph-delete-node").click();
  const impact = window.getByTestId("graph-delete-impact");
  await impact.waitFor();
  assert.equal(await impact.locator('[data-kind="edge"]').count(), 2);
  await window.getByTestId("graph-delete-cancel").click();
  assert.equal(await window.getByTestId(`graph-select-node-${insertedId}`).count(), 1);
  assert.deepEqual(await readGraphRecord(isolation), inserted);
  assert.equal(await window.getByTestId("graph-save").isDisabled(), true);
  await window.getByTestId("graph-delete-node").click();
  await window.getByTestId("graph-delete-confirm").click();
  const deleted = await saveU3Draft(isolation, window);
  assert.deepEqual(deleted.definition.nodes, original.definition.nodes);
  assert.deepEqual(
    deleted.definition.edges,
    original.definition.edges.filter((item) => edgeKey(item) !== edgeKey(edge)),
  );
  await selectNode(window, "decision");
  await selectValue(window, "graph-next-node-decision-pass", edge.target);
  const reconnected = await saveU3Draft(isolation, window);
  assert.deepEqual(reconnected.definition.nodes, original.definition.nodes);
  assert.deepEqual(
    reconnected.definition.edges.map(edgeKey).sort(),
    original.definition.edges.map(edgeKey).sort(),
  );
  assert.deepEqual(reconnected.definition.routing, original.definition.routing);
  summary.canvasInsert = {
    selected: edge,
    insertedId,
    branchPreserved: true,
    cancelPreserved: true,
    explicitlyReconnected: true,
  };
  await selectNode(window, "build");
  await window.getByTestId("graph-delete-node").click();
  await impact.waitFor();
  assert.ok((await impact.locator('[data-kind="build-mapping"]').count()) >= 2);
  assert.equal(await impact.locator('[data-kind="repair-region"]').count(), 1);
  await window.getByTestId("graph-delete-cancel").click();
  assert.deepEqual(await readGraphRecord(isolation), reconnected);
  await selectNode(window, "end");
  await selectValue(window, "graph-end-output", "reviewer");
  const reviewedEnd = await saveU3Draft(isolation, window);
  const selectedEnd = structuredClone(reconnected.definition);
  selectedEnd.nodes.find((node) => node.id === "end").outputNodeId = "reviewer";
  assert.deepEqual(u3DefinitionContent(reviewedEnd.definition), u3DefinitionContent(selectedEnd));
  summary.canvasInsert.explicitEndBeforeDeletion = "reviewer";
  await selectNode(window, "reviewer");
  await window.getByTestId("graph-delete-node").click();
  await impact.waitFor();
  const kinds = await impact
    .locator("li[data-kind]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-kind")));
  for (const kind of [
    "edge",
    "condition-input",
    "condition-verification",
    "approval-evidence",
    "end-output",
    "repair-region",
  ])
    assert.ok(kinds.includes(kind), `Missing reviewer deletion dependency: ${kind}`);
  await captureU3(isolation, window, summary, "pre-z8-u3-delete-impact-explicit");
  await window.getByTestId("graph-delete-cancel").click();
  assert.deepEqual(await readGraphRecord(isolation), reviewedEnd);
  await window.getByTestId("graph-delete-node").click();
  await window.getByTestId("graph-delete-confirm").click();
  const missing = await saveU3Draft(isolation, window);
  const expected = structuredClone(reviewedEnd.definition);
  expected.nodes = expected.nodes.filter((node) => node.id !== "reviewer");
  expected.edges = expected.edges.filter(
    (item) => item.source !== "reviewer" && item.target !== "reviewer",
  );
  assert.deepEqual(u3DefinitionContent(missing.definition), u3DefinitionContent(expected));
  await window.getByTestId("graph-readiness-errors").waitFor();
  assert.equal(await window.getByTestId("graph-run-button").isDisabled(), true);
  await selectNode(window, "end");
  await window.getByTestId("graph-end-output").click();
  const priorOutput = window.getByRole("option").filter({ hasText: /reviewer/ });
  assert.equal(await priorOutput.count(), 1);
  await window.keyboard.press("Escape");
  assert.equal(missing.definition.nodes.find((node) => node.id === "end").outputNodeId, "reviewer");
  await captureU3(isolation, window, summary, "pre-z8-u3-unresolved-after-delete");
  await selectValue(window, "graph-end-output", "implement");
  const endChanged = await saveU3Draft(isolation, window);
  const explicitEnd = structuredClone(expected);
  explicitEnd.nodes.find((node) => node.id === "end").outputNodeId = "implement";
  assert.deepEqual(u3DefinitionContent(endChanged.definition), u3DefinitionContent(explicitEnd));
  assert.equal(await window.getByTestId("graph-run-button").isDisabled(), true);
  await assertU3Idle(isolation, "explicit canvas insert/delete/End changes", endChanged);
  summary.deleteImpactKinds = kinds;
  summary.assertions.push(
    "Insert splits only the selected Condition exit and retains its sourcePort/other branches. Delete previews dependencies, Cancel preserves exact data, and confirmation removes only the chosen node/edges. Missing evidence/repair/End references remain visible and block Run; reconnect and End changes occur only through explicit controls.",
  );
}
