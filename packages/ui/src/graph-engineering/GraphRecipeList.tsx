import { Button } from "@/components/ui/button.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import { useGraphM2Text } from "./GraphM2Text.js";
import type { GraphRecipeChanges } from "./graphRecipeChanges.js";
import {
  graphRecipeGuidedIssue,
  recipeVerifierKind,
  type GraphRecipeDraftObject,
} from "./graphRecipeDraftForm.js";

/**
 * 主视图：已保存检查的紧凑列表，显示名称/类型/配置状态与编辑操作。
 * UX-M2.2：未保存的新增与修改按稳定 id 在行内标出（从 GraphProjectRecipes 抽出以控制文件行数）。
 */
export function GraphRecipeList({
  recipes,
  changes,
  onEdit,
}: {
  recipes: GraphRecipeDraftObject[];
  changes: GraphRecipeChanges;
  onEdit(index: number): void;
}) {
  const s = useGraphSetupText();
  const m2 = useGraphM2Text();
  return recipes.length ? (
    <div className="overflow-auto rounded-lg border border-border" data-testid="graph-recipe-list">
      <table className="w-full border-collapse text-ui-sm">
        <thead className="bg-surface-hover text-ui-xs text-foreground-subtle">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{s("checkName")}</th>
            <th className="px-3 py-2 text-left font-medium">{s("checkType")}</th>
            <th className="px-3 py-2 text-left font-medium">{s("checkStatus")}</th>
            <th className="px-3 py-2 text-left font-medium" />
          </tr>
        </thead>
        <tbody>
          {recipes.map((recipe, index) => {
            const issue = graphRecipeGuidedIssue(recipe);
            // UX-M2.2：按稳定 id 标出这一行在未保存编辑中的状态；无法完整列出时不做逐行声明。
            const unsaved =
              changes.kind === "changes" && typeof recipe.id === "string"
                ? changes.added.some((item) => item.id === recipe.id)
                  ? "added"
                  : changes.modified.some((item) => item.id === recipe.id)
                    ? "modified"
                    : undefined
                : undefined;
            return (
              <tr
                key={index}
                className="border-t border-border"
                data-testid="graph-recipe-row"
                data-check-id={typeof recipe.id === "string" ? recipe.id : undefined}
                data-unsaved={unsaved}
              >
                <td className="px-3 py-2 font-medium">
                  {String(recipe.name ?? recipe.id ?? index + 1)}
                  {unsaved ? (
                    <span
                      className="ml-2 font-normal text-ui-xs text-warning"
                      data-testid="graph-recipe-row-unsaved"
                    >
                      {m2(unsaved === "added" ? "rowNew" : "rowUnsaved")}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-foreground-subtle">
                  {s(recipeVerifierKind(recipe))}
                </td>
                <td className="px-3 py-2">
                  {issue ? (
                    <span className="text-warning">{s("checkNeedsAttention")}</span>
                  ) : (
                    <span className="text-foreground-subtle">{s("checkConfigured")}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`graph-recipe-edit-${index}`}
                    onClick={() => onEdit(index)}
                  >
                    {s("edit")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="text-ui-sm text-foreground-subtle">{s("noChecks")}</p>
  );
}
