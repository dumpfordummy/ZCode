import type { GraphRecipe, GraphSequentialDefinition } from "../contract.js";

/** Sole graph-local mapping path. Shared project recipes are never mutated. */
export function effectiveGraphRecipe(
  definition: GraphSequentialDefinition,
  nodeId: string,
  recipe: GraphRecipe,
): GraphRecipe {
  const node = definition.nodes.find((item) => item.id === nodeId);
  if (node?.type !== "tool") throw new Error("Effective check requires an existing Tool node.");
  const result = structuredClone(recipe);
  if (node.verification) {
    if (result.verifier.kind !== node.verification.kind)
      throw new Error(`Step ${node.name} requires a ${node.verification.kind} check.`);
    if (node.verification.kind === "test" && result.verifier.kind === "test")
      result.verifier.buildNodeId = node.verification.buildNodeId;
  }
  return result;
}
