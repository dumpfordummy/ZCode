import type {
  GraphLegacyDefinition,
  GraphSequentialDefinition,
  GraphTaskNode,
  GraphApprovalNode,
  GraphNode,
  GraphToolNode,
  GraphConditionNode,
  GraphNativeSettings,
} from "@zcode/services";

/** Tool-only runs use no model; this inert selection only satisfies the inherited run envelope. */
export function graphToolOnlySettings(): GraphNativeSettings {
  return {
    modelSelection: { providerId: "graph-tool-only", modelId: "graph-tool-only" },
    mode: "build",
    planEnabled: false,
  };
}
export function graphNodeLabel(
  node: GraphLegacyDefinition["nodes"][number] | GraphNode,
  definition: GraphLegacyDefinition | GraphSequentialDefinition,
  fallback: (id: string) => string,
): string {
  return "name" in node
    ? node.name
    : node.type === "task" && definition.version === undefined
      ? definition.taskName
      : fallback(`node.${node.type}`);
}

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
  return appendGraphNode(definition, node);
}

export function appendGraphApproval(
  definition: GraphSequentialDefinition,
  id: string,
  name: string,
): GraphSequentialDefinition {
  if (definition.nodes.filter((node) => node.type === "approval").length >= 8) return definition;
  const end = definition.nodes.find((node) => node.type === "end");
  const node: GraphApprovalNode = {
    id,
    type: "approval",
    name,
    reviewInstructions: "",
    evidence: [],
    commentPolicy: "optional",
    position: end ? { ...end.position } : { x: 240, y: 240 },
  };
  return appendGraphNode(
    { ...definition, version: definition.version >= 4 ? definition.version : 3 },
    node,
  );
}

export function appendGraphTool(
  definition: GraphSequentialDefinition,
  id: string,
  name: string,
): GraphSequentialDefinition {
  if (definition.nodes.filter((node) => node.type === "tool").length >= 8) return definition;
  const end = definition.nodes.find((node) => node.type === "end");
  const node: GraphToolNode = {
    id,
    type: "tool",
    name,
    recipeId: "",
    position: end ? { ...end.position } : { x: 240, y: 240 },
  };
  return appendGraphNode(
    { ...definition, version: definition.version >= 4 ? definition.version : 4 },
    node,
  );
}

export function appendGraphCondition(
  definition: GraphSequentialDefinition,
  id: string,
  name: string,
): GraphSequentialDefinition {
  if (
    definition.version !== 5 ||
    definition.nodes.filter((node) => node.type === "condition").length >= 8
  )
    return definition;
  const end = definition.nodes.find((node) => node.type === "end");
  const node: GraphConditionNode = {
    id,
    type: "condition",
    name,
    inputs: [],
    branches: [],
    defaultExit: "needs_changes",
    errorPolicy: "needs-human",
    position: end ? { ...end.position } : { x: 240, y: 240 },
  };
  const next = appendGraphNode(definition, node);
  return {
    ...next,
    edges: next.edges.map((edge) =>
      edge.source === id ? { ...edge, sourcePort: node.defaultExit } : edge,
    ),
  };
}

function appendGraphNode(
  definition: GraphSequentialDefinition,
  node: GraphNode,
): GraphSequentialDefinition {
  const end = definition.nodes.find((item) => item.type === "end");
  const incoming = definition.edges.filter((edge) => edge.target === end?.id);
  const predecessor = incoming.length === 1 ? incoming[0] : undefined;
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
            { ...predecessor, target: node.id },
            { source: node.id, target: end.id },
          ]
        : definition.edges,
  };
}

export function removeGraphTask(
  definition: GraphSequentialDefinition,
  id: string,
): GraphSequentialDefinition {
  if (
    !definition.nodes.some(
      (node) => node.id === id && ["task", "approval", "tool", "condition"].includes(node.type),
    )
  )
    return definition;
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
  sourcePort?: string,
): GraphSequentialDefinition {
  return {
    ...definition,
    edges: [
      ...definition.edges.filter(
        (edge) => edge.source !== source || edge.sourcePort !== sourcePort,
      ),
      ...(target ? [{ source, target, ...(sourcePort ? { sourcePort } : {}) }] : []),
    ],
  };
}

export function updateGraphNode(
  definition: GraphSequentialDefinition,
  next: GraphNode,
): GraphSequentialDefinition {
  const exits =
    next.type === "condition"
      ? new Set([...next.branches.map((branch) => branch.exit), next.defaultExit])
      : null;
  return {
    ...definition,
    version:
      definition.version === 5
        ? 5
        : definition.version === 4 ||
            (next.type === "task" &&
              (next.output || next.inputs.some((binding) => binding.source.kind === "artifact"))) ||
            (next.type === "approval" &&
              next.evidence.some((binding) => binding.source.kind === "artifact"))
          ? 4
          : definition.version,
    nodes: definition.nodes.map((current) => (current.id === next.id ? next : current)),
    // 出口改名后旧连线没有可操作的句柄；仅清除已删除出口，保留其他连线并要求用户明确重连。
    edges: exits
      ? definition.edges.filter(
          (edge) =>
            edge.source !== next.id ||
            (edge.sourcePort !== undefined && exits.has(edge.sourcePort)),
        )
      : definition.edges,
  };
}

export function graphRunIsUnresolved(run: { status: string; release?: unknown }): boolean {
  return (
    !run.release &&
    ![
      "Completed",
      "Failed",
      "Cancelled",
      "Rejected",
      "NeedsHuman",
      "BudgetExhausted",
      "NoProgress",
    ].includes(run.status)
  );
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
