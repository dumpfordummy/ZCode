import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function GraphRunHistory({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: GraphRun[];
  selectedRunId?: string;
  onSelect: (runId: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  return (
    <div className="max-h-32 shrink-0 overflow-auto" aria-label={t("runs")}>
      {runs.length ? (
        <div className="flex flex-wrap gap-2">
          {runs.map((run) => (
            <Button
              key={run.id}
              variant={run.id === selectedRunId ? "secondary" : "outline"}
              size="sm"
              data-testid="graph-run"
              data-run-id={run.id}
              data-status={run.status}
              data-session-id={run.version !== undefined ? "" : (run.sessionId ?? "")}
              data-input-id={run.version !== undefined ? "" : run.inputId}
              onClick={() => onSelect(run.id)}
            >
              {run.definition.name} ·{" "}
              {t(
                run.version === 3 && run.status === "Completed"
                  ? "approval.runCompleted"
                  : `status.${run.status}`,
              )}{" "}
              · {new Date(run.createdAt).toLocaleTimeString()}
              {run.release ? ` · ${t("released")}` : ""}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-ui-sm text-foreground-subtle">{t("noRuns")}</p>
      )}
    </div>
  );
}
