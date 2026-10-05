import type {
  GraphPortableTemplate,
  GraphRecipeSnapshot,
  GraphTemplateBindings,
} from "@zcode/services";
import { compatibleTemplateRecipes } from "./graphWorkflowView.js";

export function defaultGraphCheckBindings(
  template: GraphPortableTemplate,
  bindings: GraphTemplateBindings,
  snapshot: GraphRecipeSnapshot | null,
): GraphTemplateBindings {
  let next = bindings;
  for (const node of template.graph.nodes) {
    // 已清空/失效的稳定 ID 也是用户选择；仅首次未绑定的槽位可接受唯一默认值。
    if (
      node.type !== "tool" ||
      Object.hasOwn(bindings.recipes, node.id) ||
      bindings.recipeGroups?.[node.id]?.length
    )
      continue;
    const choices = compatibleTemplateRecipes(template, node.id, snapshot, next);
    if (choices.length === 1)
      next = { ...next, recipes: { ...next.recipes, [node.id]: choices[0]!.id } };
  }
  return next;
}
