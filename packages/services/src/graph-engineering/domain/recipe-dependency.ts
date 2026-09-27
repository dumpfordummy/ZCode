import type { GraphDefinition } from "../contract.js";

// 新的无 Tool 运行显式绑定此标记；历史运行仍保留原有配方漂移检查，不能迁移时放宽。
export const noProjectRecipes = "graph:no-project-recipes:v1";

export function usesProjectRecipes(definition: GraphDefinition): boolean {
  return (
    definition.nodes.some((node) => node.type === "tool") ||
    (definition.version !== undefined && Boolean(definition.routing?.region))
  );
}
