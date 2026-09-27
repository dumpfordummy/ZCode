import type { GraphRun } from "@zcode/services";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphHistoryPage } from "./graphRunHistoryView.js";
import { useGraphRunText } from "./GraphRunText.js";
import { graphFocusClass } from "./graphFocus.js";

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
  const u = useGraphRunText();
  const [requestedPage, setPage] = useState(
    () => graphHistoryPage(runs, 0, selectedRunId).selectedPage ?? 0,
  );
  const page = graphHistoryPage(runs, requestedPage, selectedRunId);
  return (
    <nav className={`${graphFocusClass} shrink-0 space-y-2`} aria-label={t("runs")}>
      {runs.length ? (
        <div className="flex max-h-32 flex-wrap gap-2 overflow-auto">
          {page.items.map((run) => (
            <Button
              key={run.id}
              variant={run.id === selectedRunId ? "secondary" : "outline"}
              size="sm"
              data-testid="graph-run"
              data-run-id={run.id}
              data-status={run.status}
              data-session-id={run.version !== undefined ? "" : (run.sessionId ?? "")}
              data-input-id={run.version !== undefined ? "" : run.inputId}
              aria-current={run.id === selectedRunId ? "true" : undefined}
              onClick={() => onSelect(run.id)}
            >
              {run.definition.name} · {u(`execution.${run.status}`)} ·{" "}
              {new Date(run.createdAt).toLocaleTimeString()}
              {run.release ? ` · ${t("released")}` : ""}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-ui-sm text-foreground-subtle">{t("noRuns")}</p>
      )}
      {runs.length ? (
        <div className="flex flex-wrap items-center gap-2 text-ui-xs">
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-history-previous"
            disabled={page.page === 0}
            onClick={() => setPage(page.page - 1)}
          >
            {u("historyPrevious")}
          </Button>
          <p role="status" data-testid="graph-history-range">
            {u("historyRange", {
              start: page.start,
              end: page.end,
              total: page.total,
              page: page.page + 1,
              pages: page.pages,
            })}
          </p>
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-history-next"
            disabled={page.page + 1 >= page.pages}
            onClick={() => setPage(page.page + 1)}
          >
            {u("historyNext")}
          </Button>
          {page.selectedPage !== undefined && page.selectedPage !== page.page ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="graph-history-selected"
              onClick={() => setPage(page.selectedPage!)}
            >
              {u("historySelected")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
