import type { GraphDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Play, Settings } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphDesignReadiness } from "./GraphDesignReadiness.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";

export function GraphWorkflowSummary({
  definition,
  recipeReadState,
  readinessErrors,
  canRun,
  runReason,
  activeRunId,
  onEditChecks,
  onOpenRun,
  onRun,
}: {
  definition: GraphDefinition;
  recipeReadState: GraphRecipeReadState;
  readinessErrors: string[];
  canRun: boolean;
  runReason?: string;
  activeRunId?: string;
  onEditChecks(): void;
  onOpenRun(runId: string): void;
  onRun(): void;
}) {
  const { intl } = useZCodeIntl();
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  const t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });

  const toolNodes = definition.nodes.filter((node) => node.type === "tool");
  const startNode = definition.nodes.find((n) => n.type === "start");
  const contextText =
    "instructions" in definition
      ? definition.instructions
      : startNode && "request" in startNode
        ? startNode.request
        : "";
  const snapshot =
    recipeReadState.status === "ready" ? recipeReadState.snapshot : null;
  const recipes = snapshot?.recipes ?? [];
  const buildChecks = recipes.filter(
    (recipe) => recipe.verifier.kind === "build",
  );
  const testChecks = recipes.filter(
    (recipe) => recipe.verifier.kind === "test",
  );

  return (
    <section className="space-y-3" data-testid="graph-workflow-summary">
      {/* 紧凑摘要：上下文 / 构建 / 测试，附编辑操作 */}
      <div
        className="grid gap-3 sm:grid-cols-3"
        data-testid="graph-workflow-summary-grid"
      >
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="text-ui-xs font-medium text-foreground-subtle">
            {u("contextLabel")}
          </p>
          {contextText ? (
            <p
              className="line-clamp-3 break-words text-ui-sm"
              data-testid="graph-workflow-context"
            >
              {contextText}
            </p>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">{u("noContext")}</p>
          )}
        </div>
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="text-ui-xs font-medium text-foreground-subtle">
            {u("buildChecks")}
          </p>
          {buildChecks.length ? (
            <ul className="text-ui-sm">
              {buildChecks.map((check) => (
                <li key={check.id} className="truncate">
                  {check.name || check.id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">{u("noChecks")}</p>
          )}
        </div>
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="text-ui-xs font-medium text-foreground-subtle">
            {u("testChecks")}
          </p>
          {testChecks.length ? (
            <ul className="text-ui-sm">
              {testChecks.map((check) => (
                <li key={check.id} className="truncate">
                  {check.name || check.id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">{u("noChecks")}</p>
          )}
        </div>
      </div>

      {/* 工具节点摘要 */}
      {toolNodes.length ? (
        <p className="text-ui-sm text-foreground-subtle">
          {u("toolSteps")}:{" "}
          {toolNodes
            .map((node) => ("name" in node ? node.name : "") || node.id)
            .join(", ")}
        </p>
      ) : null}

      {/* 操作行：编辑检查 + 运行 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEditChecks}
          data-testid="graph-workflow-edit-checks"
        >
          <Settings className="size-4" />
          {u("setupChecks")}
        </Button>
        <Button
          size="sm"
          disabled={!canRun}
          aria-describedby={runReason ? "graph-run-reason" : undefined}
          data-testid="graph-workflow-run"
          onClick={onRun}
        >
          <Play className="size-4" />
          {t("run")}
        </Button>
        <span role="status" className="text-ui-sm text-foreground-subtle">
          {recipeReadState.status === "loading"
            ? u("loadingChecks")
            : recipeReadState.status === "not-loaded"
              ? u("notLoaded")
              : recipeReadState.status === "error"
                ? u("readFailed")
                : u("checksLoaded").replace("{count}", String(recipes.length))}
        </span>
      </div>

      {/* 就绪问题始终可见 */}
      <GraphDesignReadiness
        reason={runReason}
        errors={readinessErrors}
        activeRunId={activeRunId}
        onOpenRun={onOpenRun}
      />
    </section>
  );
}
