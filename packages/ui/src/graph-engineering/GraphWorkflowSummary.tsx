import type { GraphDefinition, GraphRunProvenance } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphCommandLine } from "./graphCommandLine.js";
import { graphWorkflowSummaryData } from "./graphWorkflowSummaryData.js";

/**
 * What the reviewed snapshot will do, from the frozen definition and (when present) the frozen
 * preflight: the task request, the explicitly selected context, and the configured check commands.
 * Checks here are configuration; results only exist on the run after execution.
 */
export function GraphWorkflowSummary({
  definition,
  provenance,
}: {
  definition: GraphDefinition;
  provenance?: GraphRunProvenance;
}) {
  const { intl } = useZCodeIntl();
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  const { request, references } = graphWorkflowSummaryData(definition);
  // 冻结的预检里的引用与命令优先；没有预检（非模板图）时退回定义里显式绑定的引用。
  const context = provenance?.references.length
    ? provenance.references.map((reference) => ({ id: reference.id, path: reference.path }))
    : references.map((reference) => ({ id: reference.id, path: reference.path }));
  const recipes = provenance?.recipes ?? [];
  return (
    <section className="space-y-3" data-testid="graph-workflow-summary">
      <div className="space-y-1">
        <p className="text-ui-xs font-medium text-foreground-subtle">{u("taskRequest")}</p>
        <p
          className="whitespace-pre-wrap break-words text-ui-sm"
          data-testid="graph-workflow-request"
        >
          {request || u("noRequest")}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs font-medium text-foreground-subtle">{u("contextLabel")}</p>
        {context.length ? (
          <ul className="break-words text-ui-sm" data-testid="graph-workflow-context">
            {context.map((reference) => (
              <li key={reference.id}>{reference.path}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ui-sm text-foreground-subtle">{u("noContext")}</p>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs font-medium text-foreground-subtle">{u("checksToRun")}</p>
        {recipes.length ? (
          <ul className="space-y-1 text-ui-sm" data-testid="graph-workflow-checks">
            {recipes.map((recipe) => (
              <li key={`${recipe.nodeId}:${recipe.id}`}>
                <span className="font-medium">{recipe.id}</span>
                <span className="block break-all font-mono text-ui-xs text-foreground-subtle">
                  {graphCommandLine(recipe.command)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui-sm text-foreground-subtle">{u("noChecks")}</p>
        )}
        <p className="text-ui-xs text-foreground-subtle" data-testid="graph-workflow-saved-checks">
          {u("savedChecksNotRun")}
        </p>
      </div>
    </section>
  );
}
