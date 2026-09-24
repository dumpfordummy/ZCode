import assert from "node:assert/strict";
import test from "node:test";
import {
  upgradeGraphDefinition,
  appendGraphTask,
  removeGraphTask,
  connectGraphNodes,
  graphRunIsUnresolved,
  graphRunCanRelease,
} from "../src/graph-engineering/graphEditing.js";
import type { GraphLegacyDefinition } from "@zcode/services";

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

test("audited release lifts UI unresolved indication without changing unknown status", () => {
  assert.equal(graphRunIsUnresolved({ status: "Interrupted" }), true);
  assert.equal(graphRunIsUnresolved({ status: "Interrupted", release: {} }), false);
  assert.equal(graphRunIsUnresolved({ status: "Completed" }), false);
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
