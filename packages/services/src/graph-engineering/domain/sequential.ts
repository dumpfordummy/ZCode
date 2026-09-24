import { z } from "zod";
import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import type { GraphReadiness, GraphSequentialDefinition, GraphTaskNode } from "../contract.js";
import { validateGraphJsonSchema } from "./artifacts.js";
import type { GraphJsonSchema } from "../artifact-types.js";
import { conditionNodeSchema, routingDefinitionSchema } from "./routing-schemas.js";
import { routingReadiness } from "./routing-readiness.js";
import { templateInstanceSchema } from "./workflow-provenance-schema.js";

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
  z.object({ kind: z.literal("repair-feedback") }).strict(),
  z.object({ kind: z.literal("start") }).strict(),
  z.object({ kind: z.literal("node"), nodeId: identifier }).strict(),
  z
    .object({
      kind: z.literal("artifact"),
      nodeId: identifier,
      selector: z.string().min(1).max(500),
      pointer: z.string().max(1024).optional(),
    })
    .strict(),
]);
export const inputBindingSchema = z
  .object({ alias: z.string().max(64), source: inputSourceSchema })
  .strict();
export const sequentialDefinitionSchema = z
  .object({
    version: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(200),
    nodes: z
      .array(
        z.discriminatedUnion("type", [
          conditionNodeSchema,
          z
            .object({
              ...base,
              type: z.literal("tool"),
              name: z.string().max(200),
              recipeId: z.string().max(200),
            })
            .strict(),
          z
            .object({
              ...base,
              type: z.literal("approval"),
              name: z.string().max(200),
              reviewInstructions: z.string().max(GRAPH_TEXT_LIMIT),
              evidence: z
                .array(
                  z
                    .object({
                      alias: z.string().max(64),
                      source: z.union([
                        inputSourceSchema,
                        z.object({ kind: z.literal("source") }).strict(),
                      ]),
                    })
                    .strict(),
                )
                .max(16),
              commentPolicy: z.enum(["optional", "required"]),
            })
            .strict(),
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
              output: z
                .object({
                  kind: z.literal("json"),
                  schema: z.custom<GraphJsonSchema>((value) => {
                    try {
                      return validateGraphJsonSchema(value).type === "object";
                    } catch {
                      return false;
                    }
                  }, "A supported bounded local JSON object schema is required."),
                })
                .strict()
                .optional(),
            })
            .strict(),
        ]),
      )
      .min(2)
      .max(34),
    edges: z
      .array(
        z
          .object({
            source: identifier,
            target: identifier,
            sourcePort: z.string().max(64).optional(),
          })
          .strict(),
      )
      .max(80),
    routing: routingDefinitionSchema.optional(),
    template: templateInstanceSchema.optional(),
  })
  .strict()
  .superRefine((graph, ctx) => {
    if (graph.template && graph.version !== 5)
      ctx.addIssue({
        code: "custom",
        message: "Versioned workflow instances require graph version 5.",
      });
    if (
      graph.version === 5
        ? !graph.routing
        : graph.routing ||
          graph.nodes.length > 26 ||
          graph.edges.length > 52 ||
          graph.edges.some((e) => e.sourcePort !== undefined) ||
          graph.nodes.some(
            (n) =>
              n.type === "condition" ||
              (n.type === "task" && n.inputs.some((b) => b.source.kind === "repair-feedback")) ||
              (n.type === "approval" &&
                n.evidence.some((b) => b.source.kind === "repair-feedback")),
          )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Routing and repair feedback require explicit version 5 with routing configuration.",
      });
    if (
      graph.version < 4 &&
      (graph.nodes.length > 18 ||
        graph.edges.length > 36 ||
        graph.nodes.some(
          (n) =>
            n.type === "tool" ||
            (n.type === "task" &&
              (n.output || n.inputs.some((i) => i.source.kind === "artifact"))) ||
            (n.type === "approval" && n.evidence.some((e) => e.source.kind === "artifact")),
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "Tools, artifacts and structured output require explicit version 4.",
      });
    if (
      graph.version === 2 &&
      (graph.nodes.some((n) => n.type === "approval") ||
        graph.nodes.length > 10 ||
        graph.edges.length > 20)
    )
      ctx.addIssue({
        code: "custom",
        message: "Human Approval requires an explicit version-3 draft.",
      });
  });

export function taskBindingErrors(
  task: GraphTaskNode,
  earlier: Set<string>,
  executable = earlier,
): string[] {
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
    if (input.source.kind === "artifact" && !executable.has(input.source.nodeId))
      errors.push(
        `Task ${task.id}: artifact input ${input.alias} must select an earlier executable node.`,
      );
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
  if (graph.version === 5) {
    const ready = routingReadiness(graph);
    const taskIds = new Set(graph.nodes.filter((n) => n.type === "task").map((n) => n.id));
    const executableIds = new Set(
      graph.nodes.filter((n) => n.type === "task" || n.type === "tool").map((n) => n.id),
    );
    for (const node of graph.nodes) {
      if (node.type === "task")
        ready.errors.push(...taskBindingErrors(node, taskIds, executableIds));
      if (node.type === "tool" && (!node.name.trim() || !node.recipeId.trim()))
        ready.errors.push(`Tool ${node.id}: a name and recipe are required.`);
      if (
        node.type === "approval" &&
        (!node.name.trim() ||
          !node.reviewInstructions.trim() ||
          !node.evidence.length ||
          new Set(node.evidence.map((e) => e.alias)).size !== node.evidence.length ||
          node.evidence.some((e) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(e.alias)))
      )
        ready.errors.push(
          `Approval ${node.id}: complete review instructions and unique evidence aliases are required.`,
        );
    }
    return ready.errors.length ? { errors: [...new Set(ready.errors)], path: [] } : ready;
  }
  const errors: string[] = [];
  const starts = graph.nodes.filter((n) => n.type === "start");
  const ends = graph.nodes.filter((n) => n.type === "end");
  const tasks = graph.nodes.filter((n) => n.type === "task");
  const tools = graph.nodes.filter((n) => n.type === "tool");
  if (tools.length > 8) errors.push("At most eight Tool nodes are supported.");
  if (graph.nodes.filter((n) => n.type === "approval").length > 8)
    errors.push("At most eight Human Approval nodes are supported.");
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (byId.size !== graph.nodes.length) errors.push("Node identifiers must be unique.");
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    (graph.version === 4 ? tasks.length + tools.length < 1 : tasks.length < 1) ||
    tasks.length > 8
  )
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
    if (node.type === "task" || node.type === "approval" || node.type === "tool")
      path.push(node.id);
    current = outgoing.get(current);
  }
  if (current || visited.size !== graph.nodes.length || !ends[0] || !visited.has(ends[0].id))
    errors.push(
      "Every node must be on the same Start-to-End path without cycles or disconnected nodes.",
    );
  if (errors.length) return { errors: [...new Set(errors)], path: [] };
  const earlier = new Set<string>();
  const executable = new Set<string>();
  for (const id of path) {
    const task = byId.get(id)!;
    if (task.type === "tool") {
      if (!task.name.trim() || !task.recipeId.trim())
        errors.push(`Tool ${id}: a name and configured project recipe are required.`);
      executable.add(id);
      continue;
    }
    if (task.type === "approval") {
      if (!task.name.trim() || !task.reviewInstructions.trim())
        errors.push(`Approval ${id}: title and review instructions are required.`);
      if (!task.evidence.length) errors.push(`Approval ${id}: select required evidence.`);
      const aliases = new Set<string>();
      for (const binding of task.evidence) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(binding.alias) || aliases.has(binding.alias))
          errors.push(`Approval ${id}: evidence aliases must be valid and unique.`);
        aliases.add(binding.alias);
        if (binding.source.kind === "node" && !earlier.has(binding.source.nodeId))
          errors.push(`Approval ${id}: evidence must select an earlier Agent Task.`);
        if (binding.source.kind === "artifact" && !executable.has(binding.source.nodeId))
          errors.push(`Approval ${id}: artifact must select an earlier executable node.`);
        if (binding.source.kind === "start" && !starts[0]!.request.trim())
          errors.push(`Approval ${id}: the Start request is empty.`);
      }
      continue;
    }
    if (task.type !== "task") continue;
    errors.push(...taskBindingErrors(task, earlier, executable));
    if (
      task.instructionMode === "bound" &&
      task.inputs.some((i) => i.source.kind === "start") &&
      !starts[0]!.request.trim()
    )
      errors.push(`Task ${id}: the Start request is empty.`);
    earlier.add(id);
    executable.add(id);
  }
  if (!ends[0]!.outputNodeId || ![...tasks, ...tools].some((n) => n.id === ends[0]!.outputNodeId))
    errors.push("End must select a task's final text or a Tool result.");
  return { errors, path };
}
