import type { GraphConditionNode, GraphSequentialDefinition } from "../contract.js";

export const condition = (): GraphConditionNode => ({
  id: "decision",
  type: "condition",
  name: "Decision",
  position: { x: 0, y: 0 },
  inputs: [
    { alias: "review", source: { kind: "artifact", nodeId: "task", selector: "structured" } },
  ],
  branches: [
    { exit: "yes", predicate: { op: "eq", alias: "review", pointer: "/passed", value: true } },
  ],
  defaultExit: "no",
  errorPolicy: "needs-human",
});
export function routingGraph(): GraphSequentialDefinition {
  const position = { x: 0, y: 0 };
  return {
    version: 5,
    revision: 1,
    name: "Exclusive paths",
    routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 12, deadlineMs: 60_000 } },
    nodes: [
      { id: "start", type: "start", request: "review", position },
      {
        id: "task",
        type: "task",
        name: "Review",
        instructions: "review",
        instructionMode: "literal",
        inputs: [],
        configuration: { kind: "inherit" },
        output: {
          kind: "json",
          schema: {
            type: "object",
            properties: { passed: { type: "boolean" } },
            required: ["passed"],
            additionalProperties: false,
          },
        },
        position,
      },
      condition(),
      ...["yes", "no"].map((id) => ({
        id,
        type: "task" as const,
        name: id,
        instructions: id,
        instructionMode: "literal" as const,
        inputs: [],
        configuration: { kind: "inherit" as const },
        position,
      })),
      {
        id: "gate",
        type: "approval",
        name: "Final",
        reviewInstructions: "Check",
        evidence: [{ alias: "start", source: { kind: "start" } }],
        commentPolicy: "required",
        position,
      },
      { id: "end", type: "end", outputNodeId: "task", position },
    ],
    edges: [
      { source: "start", target: "task" },
      { source: "task", target: "decision" },
      { source: "decision", target: "yes", sourcePort: "yes" },
      { source: "decision", target: "no", sourcePort: "no" },
      { source: "yes", target: "gate" },
      { source: "no", target: "gate" },
      { source: "gate", target: "end" },
    ],
  };
}
