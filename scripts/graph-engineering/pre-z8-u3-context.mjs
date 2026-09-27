import assert from "node:assert/strict";
import {
  assertU3Idle,
  captureU3,
  openU3Details,
  readGraphRecord,
  saveU3Draft,
  selectNode,
  u3Wait,
} from "./pre-z8-u3-common.mjs";

export async function u3PromptPreview(window) {
  await openU3Details(window.getByTestId("graph-prompt-draft-preview"));
  const data = window.getByTestId("graph-prompt-draft-json");
  await openU3Details(data.locator("xpath=parent::details"));
  return JSON.parse(await data.textContent());
}

export async function verifyU3Context(isolation, window, summary) {
  await window.getByTestId("graph-view-design").click();
  await selectNode(window, "implement");
  const before = await readGraphRecord(isolation);
  const original = before.definition.nodes.find((node) => node.id === "implement");
  const index = original.inputs.findIndex(
    (binding) => binding.source.kind === "node" && binding.source.nodeId === "analyze",
  );
  assert.ok(index >= 0);
  const token = `{{inputs.${original.inputs[index].alias}}}`;
  assert.equal(original.instructions.split(token).length - 1, 1);
  const retained = original.instructions.replace(token, "");
  await window.getByTestId("graph-editor-advanced").click();
  await window.getByTestId(`graph-binding-remove-${index}`).click();
  await window.getByTestId("graph-instructions").fill(retained);
  const removed = await saveU3Draft(isolation, window);
  assert.equal(
    removed.definition.nodes.find((node) => node.id === "implement").instructions,
    retained,
  );
  await window.getByTestId("graph-editor-guided").click();
  await openU3Details(window.getByTestId("graph-context-candidates"));
  const candidates = window.locator('[data-testid^="graph-context-add-"]');
  const mapped = await candidates.evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-testid"),
      source: JSON.parse(element.getAttribute("data-source")),
      disabled: element.disabled,
      explanation: element.parentElement.textContent,
    })),
  );
  const candidate = mapped.find(
    (item) => item.source.kind === "node" && item.source.nodeId === "analyze",
  );
  assert.ok(candidate && !candidate.disabled);
  const future = mapped.find(
    (item) => item.source.kind === "node" && item.source.nodeId === "review",
  );
  assert.ok(future?.disabled);
  assert.ok(future.explanation.length > 10);
  await window.getByTestId(candidate.id).click();
  const added = await saveU3Draft(isolation, window);
  const node = added.definition.nodes.find((item) => item.id === "implement");
  const binding = node.inputs.find(
    (item) => item.source.kind === "node" && item.source.nodeId === "analyze",
  );
  assert.deepEqual(binding.source, candidate.source);
  assert.equal(
    node.inputs.filter((item) => JSON.stringify(item.source) === JSON.stringify(candidate.source))
      .length,
    1,
  );
  assert.equal(node.instructions, `${retained}\n\n{{inputs.${binding.alias}}}`);
  assert.equal(await window.getByTestId(`graph-context-chip-${binding.alias}`).count(), 1);
  await openU3Details(window.getByTestId("graph-context-candidates"));
  await window.getByTestId(candidate.id).click();
  await u3Wait(
    () => window.getByTestId("graph-save").isDisabled(),
    (value) => value,
    "idempotent existing context selection",
  );
  assert.deepEqual(await readGraphRecord(isolation), added);
  const preview = await u3PromptPreview(window);
  assert.equal(preview.kind, "draft");
  const start = added.definition.nodes.find((item) => item.type === "start");
  assert.ok(
    preview.bindings.some(
      (item) =>
        item.source.kind === "start" &&
        item.status === "resolved-start" &&
        item.text === start.request,
    ),
  );
  const unresolved = preview.bindings.find((item) => item.alias === binding.alias);
  assert.equal(unresolved.status, "unresolved");
  assert.equal(unresolved.text, undefined);
  assert.ok(
    preview.segments.some((item) => item.kind === "unresolved" && item.alias === binding.alias),
  );
  assert.equal(Object.hasOwn(preview, "attemptId"), false);
  assert.equal(Object.hasOwn(preview, "artifacts"), false);
  await assertU3Idle(isolation, "lossless explicit context edit and draft preview", added);
  await captureU3(isolation, window, summary, "pre-z8-u3-guided-context-draft-1280");
  await captureU3(isolation, window, summary, "pre-z8-u3-guided-context-draft-1920", [1920, 1080]);
  summary.context = {
    removedAlias: original.inputs[index].alias,
    selected: candidate,
    future,
    binding,
    preview,
    beforeInstructions: original.instructions,
    afterInstructions: node.instructions,
  };
  summary.assertions.push(
    "Advanced removal plus Guided context selection preserves custom text, maps the actual Analyze source to one alias/token and is idempotent. The future Review source is disabled with a reason; draft preview resolves only Start and labels future output unresolved without attempt/artifact evidence.",
  );
  return added;
}
