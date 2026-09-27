import type { GraphRecipe, GraphSequentialDefinition } from "../contract.js";
import { effectiveGraphRecipe } from "./effective-recipe.js";

function consumesGraphTests(definition: GraphSequentialDefinition, nodeId: string): boolean {
  return definition.nodes.some((consumer) => {
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
  });
}

/** A declared role only; it never proves that a recipe or its evidence exists. */
export function graphRequiredRecipeKind(
  definition: GraphSequentialDefinition,
  nodeId: string,
): "any" | "build" | "test" {
  const node = definition.nodes.find((item) => item.id === nodeId);
  if (node?.type !== "tool") return "any";
  // 旧模板的 build/test 是既有预检契约；与 UI 共用，防止仅按名称过滤或把命令当测试。
  return consumesGraphTests(definition, nodeId)
    ? "test"
    : (node.verification?.kind ??
        (nodeId === "test" ? "test" : nodeId === "build" ? "build" : "any"));
}

/** Shared static projection; availability and real evidence remain native execution facts. */
export function graphRecipeCompatibility(
  definition: GraphSequentialDefinition,
  nodeId: string,
  recipe: GraphRecipe,
): { compatible: boolean; requiredKind: "any" | "build" | "test"; issues: string[] } {
  const node = definition.nodes.find((item) => item.id === nodeId);
  if (node?.type !== "tool")
    return {
      compatible: false,
      requiredKind: "any",
      issues: ["Select an existing project-check step."],
    };
  const consumesTests = consumesGraphTests(definition, nodeId);
  const requiredKind = graphRequiredRecipeKind(definition, nodeId);
  const issues: string[] = [];
  if (consumesTests && node.verification?.kind === "build")
    issues.push("A Build-only step cannot supply configured Test verification evidence.");
  if (requiredKind !== "any" && recipe.verifier.kind !== requiredKind)
    issues.push(
      definition.nodes.some(
        (item) => item.type === "condition" && item.verification?.testNodeIds.includes(nodeId),
      )
        ? `Condition verification requires a configured Test recipe for ${node.name}.`
        : `${node.name} requires a ${requiredKind === "test" ? "Test" : "Build"} check. Choose a compatible check in Project setup.`,
    );
  if (recipe.verifier.kind === "test") {
    const effective =
      node.verification?.kind === "build"
        ? recipe
        : effectiveGraphRecipe(definition, nodeId, recipe);
    const buildId = effective.verifier.kind === "test" ? effective.verifier.buildNodeId : "";
    if (
      buildId === nodeId ||
      !definition.nodes.some((item) => item.id === buildId && item.type === "tool")
    )
      issues.push(
        `${node.name}: the check's Build reference does not resolve in this workflow. Rebind the Build check in Project setup.`,
      );
    if (
      !node.verification &&
      nodeId === "test" &&
      definition.nodes.some((item) => item.id === "build" && item.type === "tool") &&
      buildId !== "build"
    )
      issues.push(
        `${node.name}: this verified template requires its Build step. Choose a compatible Test check.`,
      );
  }
  return { compatible: issues.length === 0, requiredKind, issues };
}
