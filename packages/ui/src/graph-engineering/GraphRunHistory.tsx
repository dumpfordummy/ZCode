import type { GraphRun } from "@zcode/services";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Plus, XCircle } from "lucide-react";
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

const failedStatuses = new Set([
  "Failed",
  "NeedsHuman",
  "BudgetExhausted",
  "NoProgress",
  "Rejected",
  "StaleEvidence",
]);
const waitingStatuses = new Set([
  "WaitingForPermission",
  "WaitingForUser",
  "WaitingForApproval",
  "AwaitingContinuation",
]);

/** Status is conveyed by icon and text together, never by colour alone. */
function StatusIcon({ status }: { status: string }) {
  const className = "mt-0.5 size-4 shrink-0";
  if (status === "Completed")
    return <CheckCircle2 className={`${className} text-success`} aria-hidden="true" />;
  if (failedStatuses.has(status))
    return <XCircle className={`${className} text-destructive`} aria-hidden="true" />;
  if (waitingStatuses.has(status))
    return <AlertTriangle className={`${className} text-warning`} aria-hidden="true" />;
  if (["Starting", "Running", "CancelRequested"].includes(status))
    return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
  return <CircleDashed className={`${className} text-foreground-subtle`} aria-hidden="true" />;
}

const noRuns: ReadonlySet<string> = new Set();

/**
 * Run activity list. Pagination is a display concern over the complete run list; the Needs-you
 * badge comes from the complete projection (`needsYouRunIds`), so a pending run on another page
 * is still discoverable through the strip and is badged when its page is shown.
 */
export function GraphRunHistory({
  runs,
  selectedRunId,
  newRunSelected = false,
  needsYouRunIds = noRuns,
  onSelect,
  onNewRun,
}: {
  runs: GraphRun[];
  selectedRunId?: string;
  newRunSelected?: boolean;
  needsYouRunIds?: ReadonlySet<string>;
  onSelect: (runId: string) => void;
  onNewRun?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = useGraphRunText();
  const [requestedPage, setPage] = useState(
    () => graphHistoryPage(runs, 0, selectedRunId).selectedPage ?? 0,
  );
  const page = graphHistoryPage(runs, requestedPage, selectedRunId);
  return (
    <nav className={`${graphFocusClass} min-w-0 space-y-2`} aria-label={t("runs")}>
      {onNewRun ? (
        <Button
          className="w-full"
          size="lg"
          variant={newRunSelected ? "secondary" : "default"}
          aria-current={newRunSelected ? "page" : undefined}
          data-testid="graph-new-run"
          onClick={onNewRun}
        >
          <Plus className="size-4" />
          {u("newRun")}
        </Button>
      ) : null}
      {runs.length ? (
        <ul className="space-y-1" data-testid="graph-run-history">
          {page.items.map((run) => {
            const selected = !newRunSelected && run.id === selectedRunId;
            const evidence = graphRunEvidence(run);
            const preview = runRequestPreview(run);
            const needsYou = needsYouRunIds.has(run.id);
            return (
              <li
                key={run.id}
                className={`flex cursor-pointer gap-2 rounded-lg border p-2 transition-colors ${
                  selected
                    ? "border-border bg-selected"
                    : "border-transparent hover:bg-surface-hover"
                }`}
                data-testid="graph-run"
                data-run-id={run.id}
                data-status={run.status}
                data-evidence-state={evidence.state}
                data-needs-you={needsYou ? "true" : undefined}
                data-session-id={run.version !== undefined ? "" : (run.sessionId ?? "")}
                data-input-id={run.version !== undefined ? "" : run.inputId}
                aria-current={selected ? "true" : undefined}
                tabIndex={0}
                onKeyDown={(event) => {
                  // 列表项不是按钮：Enter/Space 必须保留键盘选择，Space 不应只滚动页面。
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(run.id);
                  }
                }}
                onClick={() => onSelect(run.id)}
              >
                <StatusIcon status={run.status} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  {preview ? (
                    <div
                      className="line-clamp-2 break-words text-ui-sm font-medium"
                      data-testid="graph-run-request-preview"
                    >
                      {preview}
                    </div>
                  ) : null}
                  <div className="break-words text-ui-xs text-foreground-subtle">
                    {run.definition.name}
                    {run.release ? ` · ${t("released")}` : ""} · {u(`execution.${run.status}`)}
                  </div>
                  <div className="text-ui-xs text-foreground-subtle">
                    {new Date(run.createdAt).toLocaleString()} ·{" "}
                    {evidence.configuredTestCount
                      ? u(`evidence.${evidence.state}`)
                      : u("evidence.no-tests")}
                  </div>
                  {needsYou ? (
                    <div className="text-ui-xs font-medium text-warning">{u("needsYou")}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ui-sm text-foreground-subtle">{u("noRunsYet")}</p>
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
