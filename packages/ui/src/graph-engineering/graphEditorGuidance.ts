import { graphInstructionParts } from "@zcode/services";
import type {
  GraphSequentialDefinition,
  GraphTaskNode,
  GraphInstructionPart,
} from "@zcode/services";

export function graphTaskGuidance(node: GraphTaskNode): {
  supported: boolean;
  reason?: string;
  parts: GraphInstructionPart[];
} {
  if (node.instructionMode === "literal")
    return { supported: true, parts: [{ kind: "text", text: node.instructions }] };
  const parts = graphInstructionParts(node.instructions);
  if (!parts.length || parts[0]?.kind === "token") parts.unshift({ kind: "text", text: "" });
  if (parts.at(-1)?.kind === "token") parts.push({ kind: "text", text: "" });
  const seen = new Set<string>();
  for (const part of parts) {
    if (part.kind === "text") {
      if (part.text.includes("{{") || part.text.includes("}}"))
        return { supported: false, reason: "malformedTokens", parts };
    } else {
      if (
        seen.has(part.alias) ||
        node.inputs.filter((input) => input.alias === part.alias).length !== 1
      )
        return { supported: false, reason: "ambiguousTokens", parts };
      seen.add(part.alias);
    }
  }
  if (node.inputs.some((input) => !seen.has(input.alias)))
    return { supported: false, reason: "unusedBindings", parts };
  return { supported: true, parts };
}

export function editGraphInstructionPart(
  node: GraphTaskNode,
  index: number,
  text: string,
): GraphTaskNode {
  const projection = graphTaskGuidance(node);
  if (!projection.supported || projection.parts[index]?.kind !== "text")
    throw new Error("Only a supported text segment can be edited");
  return {
    ...node,
    instructions: projection.parts
      .map((part, offset) =>
        part.kind === "token" ? part.token : offset === index ? text : part.text,
      )
      .join(""),
  };
}

export function removeGraphContext(node: GraphTaskNode, alias: string): GraphTaskNode {
  const projection = graphTaskGuidance(node);
  if (!projection.supported) throw new Error("Use Advanced for this instruction layout");
  return {
    ...node,
    inputs: node.inputs.filter((input) => input.alias !== alias),
    instructions: projection.parts
      .map((part) => (part.kind === "text" ? part.text : part.alias === alias ? "" : part.token))
      .join(""),
  };
}

export type GraphEdgeSelection = GraphSequentialDefinition["edges"][number];
export const graphEdgeKey = (edge: GraphEdgeSelection) =>
  JSON.stringify([edge.source, edge.sourcePort ?? null, edge.target]);

/** 仅拆分用户选中的准确边，不能以节点顺序猜测分支，也不能重接同源的其他出口。 */
export function insertGraphTaskOnEdge(
  definition: GraphSequentialDefinition,
  selected: GraphEdgeSelection,
  id: string,
  name: string,
): GraphSequentialDefinition {
  const indexes = definition.edges.flatMap((edge, index) =>
    graphEdgeKey(edge) === graphEdgeKey(selected) ? [index] : [],
  );
  const limits = { 2: [10, 20], 3: [18, 36], 4: [26, 52], 5: [34, 80] } as const;
  const [nodes, edges] = limits[definition.version];
  const source = definition.nodes.find((node) => node.id === selected.source),
    target = definition.nodes.find((node) => node.id === selected.target);
  if (indexes.length !== 1 || !source || !target)
    throw new Error("The selected edge has changed; select it again.");
  if (
    definition.nodes.some((node) => node.id === id) ||
    definition.nodes.length >= nodes ||
    definition.edges.length >= edges ||
    definition.nodes.filter((node) => node.type === "task").length >= 8
  )
    throw new Error("The graph's node or edge limit would be exceeded.");
  const node: GraphTaskNode = {
    id,
    type: "task",
    name,
    instructionMode: "literal",
    instructions: "",
    inputs: [],
    configuration: { kind: "inherit" },
    position: {
      x: (source.position.x + target.position.x) / 2,
      y: (source.position.y + target.position.y) / 2,
    },
  };
  return {
    ...definition,
    nodes: [...definition.nodes, node],
    edges: definition.edges.flatMap((edge, index) =>
      index === indexes[0]
        ? [
            { ...edge, target: id },
            { source: id, target: edge.target },
          ]
        : [edge],
    ),
  };
}

export interface GraphDeleteDependency {
  kind:
    | "edge"
    | "task-input"
    | "condition-input"
    | "approval-evidence"
    | "condition-verification"
    | "end-output"
    | "final-gate"
    | "repair-region"
    | "template-role"
    | "build-mapping";
  owner: string;
  detail: string;
}
export function graphDeleteImpact(
  definition: GraphSequentialDefinition,
  id: string,
): GraphDeleteDependency[] {
  const impact: GraphDeleteDependency[] = [];
  const add = (kind: GraphDeleteDependency["kind"], owner: string, detail: string) =>
    impact.push({ kind, owner, detail });
  for (const edge of definition.edges)
    if (edge.source === id || edge.target === id)
      add("edge", edge.source, `${edge.sourcePort ? `${edge.sourcePort} → ` : ""}${edge.target}`);
  for (const node of definition.nodes) {
    if (node.type === "task" || node.type === "condition")
      for (const input of node.inputs)
        if ("nodeId" in input.source && input.source.nodeId === id)
          add(node.type === "task" ? "task-input" : "condition-input", node.id, input.alias);
    if (node.type === "approval")
      for (const input of node.evidence)
        if ("nodeId" in input.source && input.source.nodeId === id)
          add("approval-evidence", node.id, input.alias);
    if (
      node.type === "condition" &&
      (node.verification?.testNodeIds.includes(id) || node.verification?.reviewerNodeId === id)
    )
      add("condition-verification", node.id, id);
    if (node.type === "end" && node.outputNodeId === id) add("end-output", node.id, id);
    if (
      node.type === "tool" &&
      node.verification?.kind === "test" &&
      node.verification.buildNodeId === id
    )
      add("build-mapping", node.id, id);
  }
  const routing = definition.routing,
    region = routing?.region;
  if (routing?.finalGateId === id) add("final-gate", "routing", id);
  if (
    region &&
    [
      region.entryNodeId,
      region.repairEntryNodeId,
      region.decisionNodeId,
      ...region.bodyNodeIds,
    ].includes(id)
  )
    add("repair-region", region.id, id);
  const template = definition.template;
  if (template) {
    for (const reference of template.references)
      if (reference.nodeIds.includes(id)) add("template-role", template.id, reference.id);
    if (id in template.bindings.recipes)
      add("template-role", template.id, template.bindings.recipes[id]!);
    for (const [test, build] of Object.entries(template.bindings.buildMappings ?? {}))
      if (test === id || build === id) add("build-mapping", test, build);
  }
  return impact;
}
