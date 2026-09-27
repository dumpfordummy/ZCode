import type { GraphInputBinding, GraphPredicate, GraphSequentialDefinition } from "../contract.js";
import type { GraphTemplateBindings } from "../workflow-provenance.js";

function isTestSlot(graph: GraphSequentialDefinition, nodeId: string): boolean {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (node?.type !== "tool") return false;
  if (node.verification) return node.verification.kind === "test";
  return (
    nodeId === "test" ||
    graph.nodes.some((consumer) => {
      if (consumer.type === "condition" && consumer.verification?.testNodeIds.includes(nodeId))
        return true;
      const bindings =
        consumer.type === "approval"
          ? consumer.evidence
          : consumer.type === "task" || consumer.type === "condition"
            ? consumer.inputs
            : [];
      return bindings.some(
        ({ source }) =>
          source.kind === "artifact" &&
          source.nodeId === nodeId &&
          ["test", "verification"].includes(source.selector),
      );
    })
  );
}
function usesAlias(predicate: GraphPredicate, aliases: Set<string>): boolean {
  if (predicate.op === "all" || predicate.op === "any")
    return predicate.predicates.some((part) => usesAlias(part, aliases));
  if (predicate.op === "not") return usesAlias(predicate.predicate, aliases);
  return "alias" in predicate && aliases.has(predicate.alias);
}
/** Expands the canonical instance before save, preserving every selected check and its evidence. */
export function applyWorkflowCheckGroups(
  graph: GraphSequentialDefinition,
  bindings: GraphTemplateBindings,
): void {
  for (const [testId, buildId] of Object.entries(bindings.buildMappings ?? {})) {
    const node = graph.nodes.find((item) => item.id === testId),
      build = graph.nodes.find((item) => item.id === buildId);
    if (
      !isTestSlot(graph, testId) ||
      node?.type !== "tool" ||
      build?.type !== "tool" ||
      testId === buildId ||
      isTestSlot(graph, buildId)
    )
      throw new Error("Build mapping requires an existing Test slot and a distinct Build slot.");
    node.verification = { kind: "test", buildNodeId: buildId };
    build.verification = { kind: "build" };
  }
  for (const [slotId, ids] of Object.entries(bindings.recipeGroups ?? {})) {
    const slot = graph.nodes.find((item) => item.id === slotId);
    if (!isTestSlot(graph, slotId) || slot?.type !== "tool")
      throw new Error("Only an existing verified Test slot supports a recipe group.");
    if (!ids.length || ids[0] !== bindings.recipes[slotId] || new Set(ids).size !== ids.length)
      throw new Error(
        "A Test recipe group must include its primary recipe first and contain unique identities.",
      );
    if (ids.length === 1) continue;
    const buildId =
      slot.verification?.kind === "test"
        ? slot.verification.buildNodeId
        : graph.nodes.some((n) => n.type === "tool" && n.id === "build")
          ? "build"
          : undefined;
    if (!buildId) throw new Error("Explicitly map the group's Build slot before expanding tests.");
    slot.verification = { kind: "test", buildNodeId: buildId };
    const next = graph.edges.filter((edge) => edge.source === slotId);
    if (next.length !== 1 || next[0]!.sourcePort)
      throw new Error("Multi-test expansion requires a single Test successor.");
    const extras = ids
      .slice(1)
      .map((recipeId, index) => ({
        ...structuredClone(slot),
        id: `${slotId}__check_${index + 2}`,
        name: `${slot.name} ${index + 2}`,
        recipeId,
        position: { x: slot.position.x + (index + 1) * 220, y: slot.position.y },
      }));
    if (extras.some((extra) => graph.nodes.some((node) => node.id === extra.id)))
      throw new Error("Expanded Test identity conflicts with an existing node.");
    for (const consumer of graph.nodes) {
      const inputs =
        consumer.type === "approval"
          ? consumer.evidence
          : consumer.type === "task" || consumer.type === "condition"
            ? consumer.inputs
            : undefined;
      if (!inputs) continue;
      const selected = inputs.filter(
        (input) => input.source.kind === "artifact" && input.source.nodeId === slotId,
      );
      if (consumer.type === "condition" && selected.length) {
        const aliases = new Set(selected.map((input) => input.alias));
        if (consumer.branches.some((branch) => usesAlias(branch.predicate, aliases)))
          throw new Error(
            "This custom condition directly tests one check's fields; explicitly expand its routing policy in Advanced before grouping checks.",
          );
      }
      if (consumer.type === "task" && selected.length && consumer.instructionMode !== "bound")
        throw new Error("Additional check evidence needs explicit bound reviewer inputs.");
      for (const [index, extra] of extras.entries())
        for (const original of selected) {
          const alias = `${original.alias}_check${index + 2}`;
          if (inputs.some((input) => input.alias === alias))
            throw new Error("Expanded evidence alias conflicts with an existing input.");
          if (original.source.kind !== "artifact") continue;
          const input: GraphInputBinding = {
            alias,
            source: { ...original.source, nodeId: extra.id },
          };
          inputs.push(input);
          if (consumer.type === "task")
            consumer.instructions += `\n\nAdditional configured check ${alias}:\n{{inputs.${alias}}}\nReview every supplied check and include each exact verification artifactId when producing evidenceReferences.`;
        }
      if (consumer.type === "condition" && consumer.verification?.testNodeIds.includes(slotId))
        consumer.verification.testNodeIds = consumer.verification.testNodeIds.flatMap((id) =>
          id === slotId ? [id, ...extras.map((node) => node.id)] : [id],
        );
    }
    const position = graph.nodes.indexOf(slot);
    graph.nodes.splice(position + 1, 0, ...extras);
    graph.edges = graph.edges.filter((edge) => edge.source !== slotId);
    const chain = [slotId, ...extras.map((extra) => extra.id), next[0]!.target];
    graph.edges.push(...chain.slice(1).map((target, index) => ({ source: chain[index]!, target })));
    const region = graph.routing?.region;
    if (region?.bodyNodeIds.includes(slotId))
      region.bodyNodeIds = region.bodyNodeIds.flatMap((id) =>
        id === slotId ? [id, ...extras.map((extra) => extra.id)] : [id],
      );
  }
  if (graph.nodes.filter((node) => node.type === "tool" && isTestSlot(graph, node.id)).length > 8)
    throw new Error(
      "This workflow's bounded reviewer evidence supports at most eight Test steps; no selection was dropped.",
    );
}
