import type { ModelSelection } from "@zcode/shared";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * The effective configuration a new run will start from, visible on every destination:
 * model, permission/submission mode and saved-check status. It only displays the existing
 * workspace defaults; changing them stays where it is (Workflows → Workspace defaults).
 */
export function GraphContextBar({
  modelSelection,
  mode,
  recipeReadState,
  onOpenChecks,
}: {
  modelSelection?: ModelSelection;
  mode?: string;
  recipeReadState: GraphRecipeReadState;
  onOpenChecks(): void;
}) {
  const u = useGraphRunText();
  const checks =
    recipeReadState.status === "ready"
      ? u("ctxChecksSaved", { count: recipeReadState.snapshot.recipes.length })
      : recipeReadState.status === "loading"
        ? u("ctxChecksLoading")
        : u("ctxChecksUnread");
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-ui-sm"
      role="group"
      aria-label={u("ctxLabel")}
      data-testid="graph-context-bar"
    >
      <span className="rounded-md border border-border bg-surface px-2 py-0.5">
        <span className="text-foreground-subtle">{u("ctxModel")} </span>
        <span data-testid="graph-context-model">
          {modelSelection
            ? `${modelSelection.providerId} / ${modelSelection.modelId}`
            : u("ctxNoModel")}
        </span>
      </span>
      {mode ? (
        <span className="rounded-md border border-border bg-surface px-2 py-0.5">
          <span className="text-foreground-subtle">{u("ctxMode")} </span>
          <span data-testid="graph-context-mode">{mode}</span>
        </span>
      ) : null}
      <button
        type="button"
        className="rounded-md border border-border bg-surface px-2 py-0.5 hover:bg-surface-hover"
        data-testid="graph-context-checks"
        onClick={onOpenChecks}
      >
        <span className="text-foreground-subtle">{u("ctxChecks")} </span>
        {checks}
      </button>
    </div>
  );
}
