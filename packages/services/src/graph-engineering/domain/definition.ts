import { z } from "zod";
import { isRemoteWorkspaceIdentity } from "@zcode/shared";
import type { GraphDefinition, GraphRun, GraphWorkspaceTarget } from "../contract.js";

export const targetSchema = z
  .object({
    workspacePath: z.string().trim().min(1),
    workspaceIdentity: z.string().optional(),
    remoteSessionId: z.string().optional(),
  })
  .strict();
export function workspaceKey(target: GraphWorkspaceTarget): string {
  return target.workspaceIdentity?.trim() || target.workspacePath;
}
export function localTarget(value: unknown): GraphWorkspaceTarget {
  const target = targetSchema.parse(value);
  if (target.remoteSessionId || isRemoteWorkspaceIdentity(target.workspaceIdentity?.trim() ?? ""))
    throw new Error("Z1 supports local workspaces only.");
  return target;
}
export const definitionSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(200),
    taskName: z.string().trim().min(1).max(200),
    instructions: z.string().max(100_000),
    nodes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            type: z.enum(["start", "task", "end"]),
            position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
          })
          .strict(),
      )
      .length(3),
    edges: z.array(z.object({ source: z.string(), target: z.string() }).strict()).length(2),
  })
  .strict();

export function validateDefinition(value: unknown): GraphDefinition {
  const parsed = definitionSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("Z1 requires Start -> Agent Task -> End with valid names and positions.");
  const definition = parsed.data;
  const [start, task, end] = ["start", "task", "end"].map((type) =>
    definition.nodes.filter((node) => node.type === type),
  );
  if (
    start!.length !== 1 ||
    task!.length !== 1 ||
    end!.length !== 1 ||
    new Set(definition.nodes.map((node) => node.id)).size !== 3
  )
    throw new Error("Z1 requires exactly Start -> Agent Task -> End.");
  const edges = new Set(definition.edges.map((edge) => `${edge.source}\0${edge.target}`));
  if (
    !edges.has(`${start![0]!.id}\0${task![0]!.id}`) ||
    !edges.has(`${task![0]!.id}\0${end![0]!.id}`)
  )
    throw new Error("Z1 requires Start -> Agent Task -> End without branching or loops.");
  return definition;
}

export function defaultDefinition(): GraphDefinition {
  return {
    revision: 0,
    name: "Graph Engineering",
    taskName: "Agent Task",
    instructions: "",
    nodes: [
      { id: "start", type: "start", position: { x: 40, y: 100 } },
      { id: "task", type: "task", position: { x: 280, y: 100 } },
      { id: "end", type: "end", position: { x: 600, y: 100 } },
    ],
    edges: [
      { source: "start", target: "task" },
      { source: "task", target: "end" },
    ],
  };
}

export function isConfirmedTerminal(run: GraphRun): boolean {
  return run.status === "Completed" || run.status === "Failed" || run.status === "Cancelled";
}
