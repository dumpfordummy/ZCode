import assert from "node:assert/strict";
import test from "node:test";
import {
  upgradeGraphDefinition,
  appendGraphTask,
  appendGraphApproval,
  appendGraphTool,
  removeGraphTask,
  connectGraphNodes,
  graphRunIsUnresolved,
  graphRunCanRelease,
  updateGraphNode,
} from "../src/graph-engineering/graphEditing.js";
import type { GraphLegacyDefinition, GraphConditionNode } from "@zcode/services";

const legacy: GraphLegacyDefinition = {
  revision: 4,
  name: "Original",
  taskName: "Task",
  instructions: "Keep {{inputs.unmapped}} literal",
  nodes: [
    { id: "start", type: "start", position: { x: 0, y: 0 } },
    { id: "task", type: "task", position: { x: 240, y: 0 } },
    { id: "end", type: "end", position: { x: 480, y: 0 } },
  ],
  edges: [
    { source: "start", target: "task" },
    { source: "task", target: "end" },
  ],
};

test("explicit Tool addition preserves history and version 4 survives later gates", () => {
  const original = upgradeGraphDefinition(legacy),
    frozen = structuredClone(original);
  const tool = appendGraphTool(original, "build", "Build");
  assert.equal(tool.version, 4);
  assert.deepEqual(original, frozen);
  assert.deepEqual(tool.edges.slice(-2), [
    { source: "task", target: "build" },
    { source: "build", target: "end" },
  ]);
  assert.equal(appendGraphApproval(tool, "review", "Review").version, 4);
  assert.equal(
    removeGraphTask(tool, "build").nodes.some((node) => node.id === "build"),
    false,
  );
});

test("explicit sequential upgrade preserves old literals, stable identity and layout", () => {
  const before = structuredClone(legacy);
  const next = upgradeGraphDefinition(legacy);
  assert.deepEqual(legacy, before);
  assert.equal(next.revision, legacy.revision);
  assert.equal(next.version, 2);
  assert.deepEqual(next.edges, legacy.edges);
  assert.deepEqual(next.nodes[1], {
    ...legacy.nodes[1],
    name: legacy.taskName,
    instructions: legacy.instructions,
    instructionMode: "literal",
    inputs: [],
    configuration: { kind: "inherit" },
  });
  assert.equal(next.nodes[2].type === "end" && next.nodes[2].outputNodeId, "task");
});

test("append follows the edge into End despite scrambled node array and does not retarget End output", () => {
  const original = upgradeGraphDefinition(legacy);
  original.nodes.reverse();
  const next = appendGraphTask(original, "second", "Second");
  assert.deepEqual(next.edges, [
    { source: "start", target: "task" },
    { source: "task", target: "second" },
    { source: "second", target: "end" },
  ]);
  assert.equal(next.nodes.find((node) => node.type === "end")?.outputNodeId, "task");
  assert.equal(next.nodes.filter((node) => node.type === "task").length, 2);
});

test("node deletion removes incident edges but preserves missing-output reference for explicit correction", () => {
  const original = appendGraphTask(upgradeGraphDefinition(legacy), "second", "Second");
  const next = removeGraphTask(original, "task");
  assert.deepEqual(next.edges, [{ source: "second", target: "end" }]);
  assert.equal(
    next.nodes.some((node) => node.id === "task"),
    false,
  );
  assert.equal(next.nodes.find((node) => node.type === "end")?.outputNodeId, "task");
  assert.deepEqual(removeGraphTask(original, "start"), original);
});

test("reconnection replaces only selected outgoing edge; positions never imply execution", () => {
  const original = appendGraphTask(upgradeGraphDefinition(legacy), "second", "Second");
  const next = connectGraphNodes(original, "start", "second");
  assert.equal(next.edges.find((edge) => edge.source === "start")?.target, "second");
  assert.deepEqual(next.nodes, original.nodes);
  assert.equal(
    connectGraphNodes(next, "start", null).edges.some((edge) => edge.source === "start"),
    false,
  );
});

test("Condition exit edits remove obsolete edges without guessing a new route or changing other edges", () => {
  const condition: GraphConditionNode = {
    id: "decision",
    type: "condition",
    name: "Decision",
    position: { x: 0, y: 0 },
    inputs: [],
    defaultExit: "needs_changes",
    errorPolicy: "needs-human",
    branches: [
      { exit: "pass", predicate: { op: "eq", alias: "data", value: true } },
      { exit: "removed", predicate: { op: "eq", alias: "data", value: false } },
    ],
  };
  const original = {
    ...upgradeGraphDefinition(legacy),
    version: 5 as const,
    nodes: [...upgradeGraphDefinition(legacy).nodes, condition],
    edges: [
      { source: "task", target: "decision" },
      { source: "decision", target: "task", sourcePort: "needs_changes" },
      { source: "decision", target: "end", sourcePort: "pass" },
      { source: "decision", target: "task", sourcePort: "removed" },
      { source: "start", target: "task" },
    ],
  };
  const before = structuredClone(original);
  const next = updateGraphNode(original, {
    ...condition,
    defaultExit: "default",
    branches: [condition.branches[0]!],
  });
  assert.deepEqual(original, before);
  assert.equal(next.version, 5);
  assert.deepEqual(next.edges, [original.edges[0], original.edges[2], original.edges[4]]);
  assert.deepEqual(
    updateGraphNode(original, { ...condition, name: "Renamed" }).edges,
    original.edges,
  );
});

test("audited release lifts UI unresolved indication without changing unknown status", () => {
  assert.equal(graphRunIsUnresolved({ status: "Interrupted" }), true);
  assert.equal(graphRunIsUnresolved({ status: "Interrupted", release: {} }), false);
  assert.equal(graphRunIsUnresolved({ status: "Completed" }), false);
  assert.equal(graphRunIsUnresolved({ status: "Rejected" }), false);
  assert.equal(graphRunIsUnresolved({ status: "WaitingForApproval" }), true);
  assert.equal(graphRunIsUnresolved({ status: "StaleEvidence" }), true);
});

test("adding an approval upgrades only its draft and keeps explicit task output and configuration", () => {
  const original = upgradeGraphDefinition(legacy);
  const snapshot = structuredClone(original);
  const next = appendGraphApproval(original, "review", "Review changes");
  assert.deepEqual(original, snapshot);
  assert.equal(original.version, 2);
  assert.equal(next.version, 3);
  assert.deepEqual(
    next.nodes.find((node) => node.id === "task"),
    original.nodes.find((node) => node.id === "task"),
  );
  assert.deepEqual(next.edges, [
    { source: "start", target: "task" },
    { source: "task", target: "review" },
    { source: "review", target: "end" },
  ]);
  assert.deepEqual(
    next.nodes.find((node) => node.id === "review"),
    {
      id: "review",
      type: "approval",
      name: "Review changes",
      reviewInstructions: "",
      evidence: [],
      commentPolicy: "optional",
      position: { x: 480, y: 0 },
    },
  );
  assert.equal(next.nodes.find((node) => node.type === "end")?.outputNodeId, "task");
  const deleted = removeGraphTask(next, "review");
  assert.deepEqual(deleted.edges, [{ source: "start", target: "task" }]);
  assert.equal(deleted.version, 3);
});

test("approval addition stops at eight gates independently of task count", () => {
  let graph = upgradeGraphDefinition(legacy);
  for (let index = 0; index < 8; index += 1)
    graph = appendGraphApproval(graph, `gate${index}`, "Review");
  assert.equal(graph.nodes.filter((node) => node.type === "task").length, 1);
  assert.equal(graph.nodes.filter((node) => node.type === "approval").length, 8);
  assert.equal(appendGraphApproval(graph, "extra", "Extra"), graph);
});

test("cached inactive inspection cannot expose release while the sequence is running", () => {
  assert.equal(graphRunCanRelease({ status: "Running", recovery: { state: "inactive" } }), false);
  assert.equal(
    graphRunCanRelease({ status: "Interrupted", recovery: { state: "inactive" } }),
    true,
  );
  assert.equal(graphRunCanRelease({ status: "Unknown", recovery: { state: "active" } }), false);
  assert.equal(
    graphRunCanRelease({ status: "Interrupted", recovery: { state: "unknown" } }),
    false,
  );
  assert.equal(
    graphRunCanRelease({ status: "Interrupted", release: {}, recovery: { state: "inactive" } }),
    false,
  );
});
