import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialDefinition, GraphNodeAttempt } from "../contract.js";
import { validateReadiness, validateDefinition } from "../domain/definition.js";
import { resolveGraphInstructions } from "../domain/bindings.js";

export function sequentialFixture(): GraphSequentialDefinition {
  return {
    version: 2,
    revision: 1,
    name: "Synthetic sequence",
    nodes: [
      { id: "end", type: "end", position: { x: 0, y: 0 }, outputNodeId: "b" },
      {
        id: "b",
        type: "task",
        name: "Implement",
        position: { x: -4, y: 2 },
        instructions: "Request {{inputs.request}}\nReport {{inputs.analysis}}",
        instructionMode: "bound",
        inputs: [
          { alias: "request", source: { kind: "start" } },
          { alias: "analysis", source: { kind: "node", nodeId: "a" } },
        ],
        configuration: { kind: "inherit" },
      },
      { id: "start", type: "start", position: { x: 90, y: 1 }, request: "Synthetic request" },
      {
        id: "a",
        type: "task",
        name: "Analyze",
        position: { x: 99, y: 1 },
        instructions: "Literal {{inputs.notAReference}}",
        instructionMode: "literal",
        inputs: [],
        configuration: { kind: "inherit" },
      },
    ],
    edges: [
      { source: "b", target: "end" },
      { source: "start", target: "a" },
      { source: "a", target: "b" },
    ],
  };
}

test("edge order alone controls readiness; shaped incomplete drafts remain saveable", () => {
  const graph = sequentialFixture();
  assert.deepEqual(validateReadiness(graph), { errors: [], path: ["a", "b"] });
  graph.edges = [];
  assert.deepEqual(validateDefinition(graph), graph);
  assert.ok(validateReadiness(graph).errors.length);
});

test("reject invalid topology, duplicate identifiers, unsupported versions and future inputs", () => {
  const variants = [
    (g: GraphSequentialDefinition) => g.edges.push({ source: "a", target: "end" }),
    (g: GraphSequentialDefinition) => {
      g.edges[0]!.target = "a";
    },
    (g: GraphSequentialDefinition) => {
      g.edges[0]!.target = "missing";
    },
    (g: GraphSequentialDefinition) => {
      g.nodes[0]!.id = "a";
    },
    (g: GraphSequentialDefinition) => {
      g.edges.pop();
    },
    (g: GraphSequentialDefinition) => {
      const n = g.nodes[1]!;
      if (n.type === "task") n.inputs[1]!.source = { kind: "node", nodeId: "b" };
    },
  ];
  for (const mutate of variants) {
    const g = sequentialFixture();
    mutate(g);
    assert.ok(validateReadiness(g).errors.length);
  }
  assert.throws(() => validateDefinition({ ...sequentialFixture(), version: 5 }));
  const future = sequentialFixture();
  const a = future.nodes.find((n) => n.id === "a")!;
  if (a.type === "task") {
    a.instructionMode = "bound";
    a.instructions = "{{inputs.future}}";
    a.inputs = [{ alias: "future", source: { kind: "node", nodeId: "b" } }];
  }
  assert.match(validateReadiness(future).errors.join(" "), /earlier/);
});

test("exact frozen output is bound once with source correlation; literal text is untouched", () => {
  const g = sequentialFixture();
  const b = g.nodes.find((n) => n.id === "b")!;
  const prior = {
    nodeId: "a",
    status: "Completed",
    sessionId: "session-a",
    commandId: "command-a",
    inputId: "command-a",
    terminalProof: { state: "completedSuccess" },
    finalOutput: { text: "fresh {{inputs.request}}", turnId: "turn-a", rowId: 4 },
  } as GraphNodeAttempt;
  assert.equal(
    resolveGraphInstructions(g.nodes[3] as never, g, []).instructions,
    "Literal {{inputs.notAReference}}",
  );
  const resolved = resolveGraphInstructions(b as never, g, [prior]);
  assert.equal(resolved.instructions, "Request Synthetic request\nReport fresh {{inputs.request}}");
  assert.equal(resolved.bindings[1]!.sourceSessionId, "session-a");
  assert.equal(resolved.bindings[1]!.sourceInputId, "command-a");
  assert.throws(() => resolveGraphInstructions(b as never, g, []), /output/);
  assert.throws(
    () =>
      resolveGraphInstructions(b as never, g, [
        { ...prior, finalOutput: { ...prior.finalOutput!, text: " " } },
      ]),
    /output/,
  );
});

test("malformed/unmapped aliases and explicit size limits reject without truncation", () => {
  for (const text of [
    "{{inputs.missing}}",
    "{{inputs.bad-alias}}",
    "{{inputs.request}",
    "{{ inputs.request }}",
  ]) {
    const g = sequentialFixture();
    const b = g.nodes[1]!;
    if (b.type === "task") b.instructions = text;
    assert.ok(validateReadiness(g).errors.length, text);
  }
  const g = sequentialFixture();
  const a = g.nodes[3]!;
  if (a.type === "task") a.instructions = "x".repeat(100_001);
  assert.throws(() => validateDefinition(g));
});
