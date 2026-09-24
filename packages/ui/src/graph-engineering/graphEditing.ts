import type {
  GraphLegacyDefinition,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "@zcode/services";

/** Only the explicit upgrade action calls this; old history and literals stay untouched. */
export function upgradeGraphDefinition(
  definition: GraphLegacyDefinition,
): GraphSequentialDefinition {
  const taskId = definition.nodes.find((node) => node.type === "task")?.id ?? null;
  return {
    version: 2,
    revision: definition.revision,
    name: definition.name,
    nodes: definition.nodes.map((node) => {
      if (node.type === "start") return { ...node, type: "start", request: "" };
      if (node.type === "end") return { ...node, type: "end", outputNodeId: taskId };
      return {
        ...node,
        type: "task",
        name: definition.taskName,
        instructions: definition.instructions,
        instructionMode: "literal",
        inputs: [],
        configuration: { kind: "inherit" },
      };
    }),
    edges: definition.edges.map((edge) => ({ ...edge })),
  };
}

export function appendGraphTask(
  definition: GraphSequentialDefinition,
  id: string,
  name: string,
): GraphSequentialDefinition {
  if (definition.nodes.filter((node) => node.type === "task").length >= 8) return definition;
  const end = definition.nodes.find((node) => node.type === "end");
  const incoming = definition.edges.filter((edge) => edge.target === end?.id);
  const predecessor = incoming.length === 1 ? incoming[0] : undefined;
  const node: GraphTaskNode = {
    id,
    type: "task",
    name,
    instructions: "",
    instructionMode: "literal",
    inputs: [],
    configuration: { kind: "inherit" },
    position: end ? { ...end.position } : { x: 240, y: 240 },
  };
  return {
    ...definition,
    nodes: [
      ...definition.nodes.map((current) =>
        current.id === end?.id
          ? { ...current, position: { x: current.position.x + 260, y: current.position.y } }
          : current,
      ),
      node,
    ],
    edges:
      end && predecessor
        ? [
            ...definition.edges.filter((edge) => edge !== predecessor),
            { source: predecessor.source, target: id },
            { source: id, target: end.id },
          ]
        : definition.edges,
  };
}

export function removeGraphTask(
  definition: GraphSequentialDefinition,
  id: string,
): GraphSequentialDefinition {
  if (!definition.nodes.some((node) => node.id === id && node.type === "task")) return definition;
  return {
    ...definition,
    nodes: definition.nodes.filter((node) => node.id !== id),
    edges: definition.edges.filter((edge) => edge.source !== id && edge.target !== id),
  };
}

export function connectGraphNodes(
  definition: GraphSequentialDefinition,
  source: string,
  target: string | null,
): GraphSequentialDefinition {
  return {
    ...definition,
    edges: [
      ...definition.edges.filter((edge) => edge.source !== source),
      ...(target ? [{ source, target }] : []),
    ],
  };
}

export function graphRunIsUnresolved(run: { status: string; release?: unknown }): boolean {
  return !run.release && !["Completed", "Failed", "Cancelled"].includes(run.status);
}

export function graphRunCanRelease(run: {
  status: string;
  release?: unknown;
  recovery?: { state: string };
}): boolean {
  return (
    !run.release &&
    ["Interrupted", "Unknown", "CancelRequested"].includes(run.status) &&
    run.recovery?.state === "inactive"
  );
}
