import { z } from "zod";
import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import type { GraphReadiness, GraphSequentialDefinition, GraphTaskNode } from "../contract.js";

export const GRAPH_TEXT_LIMIT = 100_000;
export const GRAPH_RESOLVED_LIMIT = 200_000;
export const graphSettingsSchema = z
  .object({
    modelSelection: modelSelectionSchema,
    mode: submissionModeSchema,
    planEnabled: z.boolean(),
  })
  .strict();
const identifier = z.string().min(1).max(200);
const base = {
  id: identifier,
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
};
export const inputSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("start") }).strict(),
  z.object({ kind: z.literal("node"), nodeId: identifier }).strict(),
]);
export const inputBindingSchema = z
  .object({ alias: z.string().max(64), source: inputSourceSchema })
  .strict();
export const sequentialDefinitionSchema = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(200),
    nodes: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              ...base,
              type: z.literal("start"),
              request: z.string().max(GRAPH_TEXT_LIMIT),
            })
            .strict(),
          z
            .object({ ...base, type: z.literal("end"), outputNodeId: identifier.nullable() })
            .strict(),
          z
            .object({
              ...base,
              type: z.literal("task"),
              name: z.string().max(200),
              instructions: z.string().max(GRAPH_TEXT_LIMIT),
              instructionMode: z.enum(["literal", "bound"]),
              inputs: z.array(inputBindingSchema).max(16),
              configuration: z.discriminatedUnion("kind", [
                z.object({ kind: z.literal("inherit") }).strict(),
                graphSettingsSchema.extend({ kind: z.literal("override") }).strict(),
              ]),
            })
            .strict(),
        ]),
      )
      .min(2)
      .max(10),
    edges: z.array(z.object({ source: identifier, target: identifier }).strict()).max(20),
  })
  .strict();

export function taskBindingErrors(task: GraphTaskNode, earlier: Set<string>): string[] {
  const errors: string[] = [];
  if (!task.name.trim()) errors.push(`Task ${task.id}: a name is required.`);
  if (!task.instructions.trim()) errors.push(`Task ${task.id}: instructions are required.`);
  const aliases = new Set<string>();
  for (const input of task.inputs) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(input.alias))
      errors.push(`Task ${task.id}: invalid input alias ${input.alias}.`);
    if (aliases.has(input.alias))
      errors.push(`Task ${task.id}: duplicate input alias ${input.alias}.`);
    aliases.add(input.alias);
    if (input.source.kind === "node" && !earlier.has(input.source.nodeId))
      errors.push(`Task ${task.id}: input ${input.alias} must select an earlier task.`);
  }
  if (task.instructionMode === "literal") return errors;
  const remaining = task.instructions.replace(
    /\{\{inputs\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,
    (_token, alias: string) => {
      if (!aliases.has(alias)) errors.push(`Task ${task.id}: input ${alias} has no binding.`);
      return "";
    },
  );
  if (remaining.includes("{{") || remaining.includes("}}"))
    errors.push(
      `Task ${task.id}: malformed binding; use {{inputs.alias}} exactly or choose literal mode.`,
    );
  return errors;
}

export function sequentialReadiness(graph: GraphSequentialDefinition): GraphReadiness {
  const errors: string[] = [];
  const starts = graph.nodes.filter((n) => n.type === "start");
  const ends = graph.nodes.filter((n) => n.type === "end");
  const tasks = graph.nodes.filter((n) => n.type === "task");
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (byId.size !== graph.nodes.length) errors.push("Node identifiers must be unique.");
  if (starts.length !== 1 || ends.length !== 1 || tasks.length < 1 || tasks.length > 8)
    errors.push("Connect exactly one Start, one to eight Agent Tasks, and one End.");
  const outgoing = new Map<string, string>();
  const incoming = new Map<string, string>();
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target))
      errors.push("An edge references a missing node.");
    if (outgoing.has(edge.source) || incoming.has(edge.target))
      errors.push("Branches, merges and duplicate edges are not supported.");
    outgoing.set(edge.source, edge.target);
    incoming.set(edge.target, edge.source);
  }
  for (const node of graph.nodes) {
    if (
      (node.type !== "start") !== incoming.has(node.id) ||
      (node.type !== "end") !== outgoing.has(node.id)
    )
      errors.push(`Node ${node.id} has an incomplete or invalid connection.`);
  }
  const visited = new Set<string>();
  const path: string[] = [];
  let current = starts[0]?.id;
  while (current && byId.has(current) && !visited.has(current)) {
    visited.add(current);
    const node = byId.get(current)!;
    if (node.type === "task") path.push(node.id);
    current = outgoing.get(current);
  }
  if (current || visited.size !== graph.nodes.length || !ends[0] || !visited.has(ends[0].id))
    errors.push(
      "Every node must be on the same Start-to-End path without cycles or disconnected nodes.",
    );
  if (errors.length) return { errors: [...new Set(errors)], path: [] };
  const earlier = new Set<string>();
  for (const id of path) {
    const task = byId.get(id) as GraphTaskNode;
    errors.push(...taskBindingErrors(task, earlier));
    if (
      task.instructionMode === "bound" &&
      task.inputs.some((i) => i.source.kind === "start") &&
      !starts[0]!.request.trim()
    )
      errors.push(`Task ${id}: the Start request is empty.`);
    earlier.add(id);
  }
  if (!ends[0]!.outputNodeId || !path.includes(ends[0]!.outputNodeId))
    errors.push("End must select a task's final text.");
  return { errors, path };
}
