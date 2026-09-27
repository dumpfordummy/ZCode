import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialDefinition, GraphTaskNode } from "@zcode/services";
import {
  graphDeleteImpact,
  insertGraphTaskOnEdge,
  graphTaskGuidance,
  editGraphInstructionPart,
  removeGraphContext,
} from "../src/graph-engineering/graphEditorGuidance.js";
import { createGraphDraftStore } from "../src/store/graphDraftStore.js";
import { projectGraphEditorBuffer } from "../src/graph-engineering/graphEditorBuffer.js";

const task = (id: string): GraphTaskNode => ({
  id,
  type: "task",
  name: id,
  position: { x: 1, y: 2 },
  instructions: "  Before\n{{inputs.request}}\nBetween {{inputs.review}} after\n",
  instructionMode: "bound",
  inputs: [
    { alias: "request", source: { kind: "start" } },
    { alias: "review", source: { kind: "node", nodeId: "review" } },
  ],
  configuration: { kind: "inherit" },
});
const graph = (): GraphSequentialDefinition => ({
  version: 5,
  revision: 7,
  name: "branch",
  nodes: [
    { id: "start", type: "start", request: "literal {{inputs.nope}}", position: { x: 0, y: 0 } },
    task("review"),
    {
      id: "decide",
      type: "condition",
      name: "Decision",
      inputs: [],
      branches: [],
      defaultExit: "pass",
      errorPolicy: "needs-human",
      position: { x: 2, y: 2 },
    },
    { id: "end", type: "end", outputNodeId: "review", position: { x: 3, y: 2 } },
  ],
  edges: [
    { source: "start", target: "review" },
    { source: "review", target: "decide" },
    { source: "decide", sourcePort: "pass", target: "end" },
    { source: "decide", sourcePort: "retry", target: "review" },
  ],
});

test("Guided projection and an individual text edit preserve every token and surrounding segment", () => {
  const node = task("edit"),
    before = structuredClone(node);
  const projection = graphTaskGuidance(node);
  assert.equal(projection.supported, true);
  assert.equal(
    projection.parts.map((part) => (part.kind === "text" ? part.text : part.token)).join(""),
    node.instructions,
  );
  assert.deepEqual(node, before);
  const changed = editGraphInstructionPart(node, 2, " revised ");
  assert.equal(
    changed.instructions,
    "  Before\n{{inputs.request}} revised {{inputs.review}} after\n",
  );
  assert.deepEqual(changed.inputs, node.inputs);
  assert.deepEqual(changed.configuration, node.configuration);
  assert.throws(() => editGraphInstructionPart(node, 1, "lose token"));
  const removed = removeGraphContext(node, "review");
  assert.equal(removed.instructions, "  Before\n{{inputs.request}}\nBetween  after\n");
  assert.deepEqual(removed.inputs, node.inputs.slice(0, 1));
});

test("repeated, malformed and unmatched drafts remain visibly Advanced-only without mutation", () => {
  for (const instructions of [
    "{{inputs.request}} {{inputs.request}}",
    "{{ broken }}",
    "{{inputs.missing}}",
  ])
    assert.equal(graphTaskGuidance({ ...task("x"), instructions }).supported, false);
  const literal = {
    ...task("x"),
    instructionMode: "literal" as const,
    inputs: [],
    instructions: "literal {{inputs.request}}",
  };
  assert.equal(graphTaskGuidance(literal).supported, true);
  assert.equal(graphTaskGuidance(literal).parts.length, 1);
});
test("buffer projection preserves unapplied errors and adopts only pristine canonical updates", () => {
  const dirty = { base: "old", text: "{ incomplete", error: "Invalid" };
  assert.equal(projectGraphEditorBuffer(dirty, "new"), dirty);
  const rejected = { base: "same", text: "same", error: "Readiness failed" };
  assert.equal(projectGraphEditorBuffer(rejected, "same"), rejected);
  assert.deepEqual(projectGraphEditorBuffer(rejected, "new"), { base: "new", text: "new" });
  assert.deepEqual(projectGraphEditorBuffer({ base: "old", text: "old" }, "new"), {
    base: "new",
    text: "new",
  });
});

test("selected edge insertion preserves branch port, siblings, End selection and original draft", () => {
  const original = graph(),
    before = structuredClone(original),
    edge = original.edges[2]!;
  const inserted = insertGraphTaskOnEdge(original, edge, "new", "New");
  assert.deepEqual(original, before);
  assert.deepEqual(inserted.edges, [
    original.edges[0],
    original.edges[1],
    { source: "decide", sourcePort: "pass", target: "new" },
    { source: "new", target: "end" },
    original.edges[3],
  ]);
  assert.deepEqual(
    inserted.nodes.find((node) => node.type === "end"),
    original.nodes.find((node) => node.type === "end"),
  );
  assert.throws(() =>
    insertGraphTaskOnEdge(original, { source: "gone", target: "end" }, "new", "New"),
  );
  const full = {
    ...original,
    nodes: [...original.nodes, ...Array.from({ length: 7 }, (_, index) => task(`extra-${index}`))],
  };
  assert.throws(() => insertGraphTaskOnEdge(full, edge, "new", "New"));
});

test("delete review includes every dependency without rewriting unresolved relationships", () => {
  const original = graph();
  original.nodes.push(
    {
      id: "test",
      type: "tool",
      name: "Test",
      recipeId: "test",
      verification: { kind: "test", buildNodeId: "review" },
      position: { x: 0, y: 0 },
    },
    {
      id: "gate",
      type: "approval",
      name: "Gate",
      reviewInstructions: "",
      evidence: [{ alias: "proof", source: { kind: "node", nodeId: "review" } }],
      commentPolicy: "optional",
      position: { x: 0, y: 0 },
    },
  );
  original.routing = {
    finalGateId: "review",
    limits: { deadlineMs: 10, maxNodeAdmissions: 24 },
    region: {
      id: "region",
      name: "Repair",
      entryNodeId: "review",
      repairEntryNodeId: "review",
      decisionNodeId: "decide",
      bodyNodeIds: ["review", "test"],
      sourcePaths: [],
      repairExit: "retry",
      passExit: "pass",
      maxRepairIterations: 2,
      stopOnNoProgress: true,
    },
  };
  original.template = {
    id: "template",
    version: 1,
    name: "T",
    digest: "pin",
    parameters: {},
    bindings: {
      references: {},
      recipes: { review: "build", test: "test" },
      buildMappings: { test: "review" },
      sourcePaths: [],
    },
    references: [{ id: "doc", kind: "document", nodeIds: ["review"] }],
    excluded: [],
  };
  const before = structuredClone(original),
    impact = graphDeleteImpact(original, "review");
  for (const kind of [
    "edge",
    "task-input",
    "approval-evidence",
    "end-output",
    "final-gate",
    "repair-region",
    "template-role",
    "build-mapping",
  ])
    assert.ok(
      impact.some((item) => item.kind === kind),
      kind,
    );
  assert.deepEqual(original, before);
});

test("invalid workspace/node buffers survive navigation, canonical refresh and acknowledge only exact explicit apply", () => {
  const store = createGraphDraftStore(),
    state = store.getState();
  state.setEditorBuffer("A", "task:schema", {
    base: "{}",
    text: "{ invalid",
    error: "invalid JSON",
  });
  state.observeDefinition("A", graph());
  assert.equal(store.getState().workspaces.A?.editorBuffers?.["task:schema"]?.text, "{ invalid");
  assert.equal(store.getState().workspaces.B?.editorBuffers, undefined);
  state.setEditorBuffer("A", "task:schema", {
    base: "{ new }",
    text: "{ invalid",
    error: "invalid JSON",
  });
  assert.equal(
    store.getState().workspaces.A?.editorBuffers?.["task:schema"]?.error,
    "invalid JSON",
  );
  state.setEditorBuffer("A", "task:schema", { base: "{}", text: "{}" });
  assert.equal(store.getState().workspaces.A?.editorBuffers?.["task:schema"]?.error, undefined);
});
