import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialDefinition } from "../contract.js";
import { graphContextCandidates } from "../domain/editor-context.js";
import { validateDefinition, validateReadiness } from "../domain/definition.js";

test("a legal maximum-size exclusive DAG has 34 nodes but only 32 planned intermediate steps", () => {
  const graph: GraphSequentialDefinition = {
    version: 5,
    revision: 0,
    name: "Capacity fixture",
    nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, request: "Fixture request" }],
    edges: [],
    routing: { finalGateId: "approval7", limits: { maxNodeAdmissions: 64, deadlineMs: 60_000 } },
  };
  const position = { x: 0, y: 0 };
  for (let index = 0; index < 8; index++)
    graph.nodes.push({
      id: `task${index}`,
      type: "task",
      name: `Task ${index}`,
      position,
      instructions: "Fixture",
      instructionMode: "literal",
      inputs: [],
      configuration: { kind: "inherit" },
      ...(index === 0
        ? {
            output: {
              kind: "json" as const,
              schema: {
                type: "object" as const,
                required: ["ready"],
                additionalProperties: false,
                properties: { ready: { type: "boolean" as const } },
              },
            },
          }
        : {}),
    });
  for (let index = 0; index < 8; index++)
    graph.nodes.push({
      id: `tool${index}`,
      type: "tool",
      name: `Tool ${index}`,
      position,
      recipeId: `recipe${index}`,
    });
  for (let index = 0; index < 8; index++)
    graph.nodes.push({
      id: `condition${index}`,
      type: "condition",
      name: `Condition ${index}`,
      position,
      inputs: [
        { alias: "review", source: { kind: "artifact", nodeId: "task0", selector: "structured" } },
      ],
      branches: [
        { exit: "pass", predicate: { op: "eq", alias: "review", pointer: "/ready", value: true } },
      ],
      defaultExit: "inspect",
      errorPolicy: "needs-human",
    });
  for (let index = 0; index < 8; index++)
    graph.nodes.push({
      id: `approval${index}`,
      type: "approval",
      name: `Approval ${index}`,
      position,
      reviewInstructions: "Review fixture",
      evidence: [{ alias: "request", source: { kind: "start" } }],
      commentPolicy: "required",
    });
  graph.nodes.push({ id: "end", type: "end", position, outputNodeId: "tool7" });
  graph.nodes.slice(0, -1).forEach((node, index) => {
    const target = graph.nodes[index + 1]!.id;
    if (node.type === "condition")
      graph.edges.push(
        { source: node.id, target, sourcePort: "pass" },
        { source: node.id, target, sourcePort: "inspect" },
      );
    else graph.edges.push({ source: node.id, target });
  });
  assert.equal(graph.nodes.length, 34);
  assert.deepEqual(validateDefinition(graph), graph);
  const ready = validateReadiness(graph);
  assert.deepEqual(ready.errors, []);
  assert.equal(ready.path.length, 32);
  assert.equal(ready.path.includes("start") || ready.path.includes("end"), false);
  assert.equal(
    graphContextCandidates(graph, "task7").candidates.find(
      (item) => item.source.kind === "node" && item.source.nodeId === "task0",
    )!.selectable,
    true,
  );
});
