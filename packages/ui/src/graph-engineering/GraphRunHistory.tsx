import type { GraphRun } from "@zcode/services";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphHistoryPage } from "./graphRunHistoryView.js";
import { useGraphRunText } from "./GraphRunText.js";
import { graphRunEvidence } from "./graphRunEvidence.js";
import { graphFocusClass } from "./graphFocus.js";
import { graphRequestText } from "./graphRequestText.js";

/** 历史列表中显示的请求预览：取首行非空文本，与概览面板的 requestText 来源保持一致。 */
function runRequestPreview(run: GraphRun): string {
  const text = run.version === undefined ? run.definition.instructions : run.startInput;
  return graphRequestText(run.definition, text).trim().split(/\r?\n/, 1)[0] ?? "";
}

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
        <div
          className="max-h-56 overflow-auto rounded-lg border border-border"
          data-testid="graph-run-history"
        >
          <table className="w-full border-collapse text-ui-sm">
            <thead className="sticky top-0 z-10 bg-surface-hover text-ui-xs text-foreground-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{u("historyTitle")}</th>
                <th className="px-3 py-2 text-left font-medium">{u("historyTime")}</th>
                <th className="px-3 py-2 text-left font-medium">{u("historyStatus")}</th>
                <th className="px-3 py-2 text-left font-medium">{u("historyEvidence")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((run) => {
                const selected = run.id === selectedRunId;
                const evidence = graphRunEvidence(run);
                return (
                  <tr
                    key={run.id}
                    className={`cursor-pointer border-t border-border transition-colors ${
                      selected ? "bg-primary/10 font-medium" : "hover:bg-surface-hover"
                    }`}
                    data-testid="graph-run"
                    data-run-id={run.id}
                    data-status={run.status}
                    data-evidence-state={evidence.state}
                    data-session-id={run.version !== undefined ? "" : (run.sessionId ?? "")}
                    data-input-id={run.version !== undefined ? "" : run.inputId}
                    aria-current={selected ? "true" : undefined}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      // 表格替换按钮列表后仍须保留键盘选择；Space 不应只滚动页面。
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(run.id);
                      }
                    }}
                    onClick={() => onSelect(run.id)}
                  >
                    <td className="max-w-xs px-3 py-2">
                      <div className="truncate font-medium">
                        {run.definition.name}
                        {run.release ? ` · ${t("released")}` : ""}
                      </div>
                      {runRequestPreview(run) ? (
                        <div
                          className="truncate text-ui-xs text-foreground-subtle"
                          data-testid="graph-run-request-preview"
                        >
                          {runRequestPreview(run)}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-foreground-subtle">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{u(`execution.${run.status}`)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-foreground-subtle">
                      {evidence.configuredTestCount
                        ? u(`evidence.${evidence.state}`)
                        : u("evidence.no-tests")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
