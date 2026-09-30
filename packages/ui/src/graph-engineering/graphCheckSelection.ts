import type {
  GraphPortableTemplate,
  GraphRecipe,
  GraphRecipeSnapshot,
  GraphTemplateBindings,
} from "@zcode/services";
import { compatibleTemplateRecipes } from "./graphWorkflowView.js";

/**
 * UX-M1.2：草稿为某个 Build/Test 步骤选中的检查，逐个说明它现在是否还能用。
 *
 * 纯函数：只读草稿绑定与 Host 的已保存检查快照，不写任何状态，也不替用户换掉选择。
 * 选择永远按稳定的 recipe id 解析；缺失或不兼容的 id 原样保留并标记，由 templateBindingErrors 阻止 Review。
 */
export type GraphCheckState = "resolved" | "missing" | "incompatible" | "unread";

export interface GraphSelectedCheck {
  id: string;
  primary: boolean;
  state: GraphCheckState;
  /** Present only when `state` is "resolved" or "incompatible" (the saved check exists). */
  recipe?: GraphRecipe;
}

export interface GraphStepChecks {
  nodeId: string;
  nodeName: string;
  /** Selected ids in the draft's group order, primary first; empty when nothing is selected. */
  checks: GraphSelectedCheck[];
  /** True when at least one selected id cannot be used (missing or incompatible). */
  unresolved: boolean;
}

type TemplateNode = GraphPortableTemplate["graph"]["nodes"][number];
const isToolNode = (node: TemplateNode): node is Extract<TemplateNode, { type: "tool" }> =>
  node.type === "tool";

export function graphCheckSelection(
  template: GraphPortableTemplate,
  bindings: GraphTemplateBindings,
  snapshot: GraphRecipeSnapshot | null,
): GraphStepChecks[] {
  return template.graph.nodes.filter(isToolNode).map((node) => {
    const primary = bindings.recipes[node.id]?.trim() ?? "";
    const grouped = bindings.recipeGroups?.[node.id] ?? [];
    const ids = [...new Set([...(primary ? [primary] : []), ...grouped])].filter(Boolean);
    const compatible = new Set(
      compatibleTemplateRecipes(template, node.id, snapshot, bindings).map((recipe) => recipe.id),
    );
    const checks = ids.map<GraphSelectedCheck>((id) => {
      const recipe = snapshot?.recipes.find((item) => item.id === id);
      const state: GraphCheckState = !snapshot
        ? "unread"
        : !recipe
          ? "missing"
          : compatible.has(id)
            ? "resolved"
            : "incompatible";
      return { id, primary: id === primary, state, ...(recipe ? { recipe } : {}) };
    });
    return {
      nodeId: node.id,
      nodeName: node.name,
      checks,
      unresolved: checks.some(
        (check) => check.state === "missing" || check.state === "incompatible",
      ),
    };
  });
}
