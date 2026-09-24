import type {
  GraphInputBinding,
  GraphJsonSchema,
  GraphNode,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "../contract.js";
import type { GraphPortableTemplate } from "../workflow-contract.js";

export const request: GraphInputBinding = { alias: "request", source: { kind: "start" } };
export const from = (nodeId: string, alias = nodeId): GraphInputBinding => ({
  alias,
  source: { kind: "node", nodeId },
});
const verification: GraphInputBinding = {
  alias: "verification",
  source: { kind: "artifact", nodeId: "test", selector: "verification" },
};
const reviewerSchema: GraphJsonSchema = {
  type: "object",
  required: ["outcome", "findings", "evidenceReferences"],
  additionalProperties: false,
  properties: {
    outcome: { type: "string", enum: ["pass", "needs_changes", "needs_human"] },
    findings: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        required: ["code", "message"],
        additionalProperties: false,
        properties: {
          code: { type: "string", minLength: 1, maxLength: 100 },
          message: { type: "string", minLength: 1, maxLength: 1000 },
        },
      },
    },
    evidenceReferences: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};
export const position = { x: 0, y: 0 };
export function task(
  id: string,
  name: string,
  instructions: string,
  inputs: GraphInputBinding[],
): GraphTaskNode {
  return {
    id,
    type: "task",
    name,
    position,
    instructions: `Workflow task: ${id}.\n${instructions}\n${inputs.map((input) => `${input.alias}:\n{{inputs.${input.alias}}}`).join("\n\n")}`,
    instructionMode: "bound",
    inputs,
    configuration: { kind: "inherit" },
  };
}
export function gate(id: string, name: string, nodeId: string, selector: string): GraphNode {
  return {
    id,
    type: "approval",
    name,
    position,
    reviewInstructions:
      "Review this exact source-linked evidence, diff and unresolved questions. Approve only the selected scope. This does not authorize publication or answer native permissions.",
    evidence: [
      { alias: "evidence", source: { kind: "artifact", nodeId, selector } },
      ...(id === "final-gate"
        ? [
            {
              alias: "review",
              source: { kind: "artifact" as const, nodeId: "reviewer", selector: "structured" },
            },
          ]
        : []),
      { alias: "source", source: { kind: "source" } },
    ],
    commentPolicy: "required",
  };
}
export function reviewer(): GraphTaskNode {
  return {
    ...task(
      "reviewer",
      "Review current verification",
      "Review the actual current verification, source and report. Return only a JSON object with outcome pass, needs_changes or needs_human; findings as {code,message} records; and evidenceReferences containing the exact verification artifactId. A failed test cannot be PASS. Link each finding to a supplied source reference or label it an assumption/question. Do not edit files or run commands.",
      [verification],
    ),
    output: { kind: "json", schema: reviewerSchema },
  };
}
export const tools = (): GraphNode[] => [
  { id: "build", type: "tool", name: "Build", position, recipeId: "build" },
  { id: "test", type: "tool", name: "Test configured criteria", position, recipeId: "test" },
];
export function graph(
  name: string,
  middle: GraphNode[],
  path: string[],
): GraphSequentialDefinition {
  const nodes: GraphNode[] = [
    { id: "start", type: "start", position, request: "" },
    ...middle,
    { id: "end", type: "end", position, outputNodeId: "test" },
  ];
  const sequence = ["start", ...path, "end"];
  return {
    version: 5,
    revision: 0,
    name,
    nodes: nodes.map((node, index) => ({
      ...node,
      position: { x: 40 + (index % 6) * 260, y: 100 + Math.floor(index / 6) * 220 },
    })),
    edges: sequence.slice(1).map((target, index) => ({ source: sequence[index]!, target })),
    routing: { finalGateId: "final-gate", limits: { maxNodeAdmissions: 24, deadlineMs: 1800000 } },
  };
}
const parameters: GraphPortableTemplate["parameters"] = [
  { id: "request", label: "Explicit run request", type: "string", required: true },
];
export function portable(
  name: string,
  description: string,
  definition: GraphSequentialDefinition,
): GraphPortableTemplate {
  return {
    format: "zcode-workflow",
    version: 1,
    name,
    description,
    graph: definition,
    parameters: structuredClone(parameters),
    references: [],
    optionalNodes: [],
  };
}
