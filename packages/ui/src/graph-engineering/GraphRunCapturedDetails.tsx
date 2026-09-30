import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";
import type { GraphRunInspection } from "./GraphRunActions.js";
import { useGraphRunText } from "./GraphRunText.js";
import { useGraphTime } from "./GraphM2Text.js";

export function GraphRunCapturedDetails({
  summary,
  onInspect,
}: {
  summary: GraphRunSummary;
  onInspect(value: GraphRunInspection): void;
}) {
  const u = useGraphRunText();
  const time = useGraphTime();
  const [technicalOpen, setTechnicalOpen] = useState(false);
  return (
    <div className="space-y-2 text-ui-sm">
      {summary.evidence.checks.length ? (
        <details data-testid="graph-run-checks">
          <summary className="cursor-pointer">
            {u("checks")} · {summary.evidence.checks.length}
          </summary>
          <ul className="mt-2 max-h-64 space-y-2 overflow-auto">
            {summary.evidence.checks.map((check) => (
              <li
                key={check.nodeId}
                data-testid="graph-run-check"
                data-node-id={check.nodeId}
                data-attempt-id={check.attemptId ?? ""}
                data-state={check.state}
                className="rounded-lg border border-border p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    {check.name} · {u(`check.${check.state}`)}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onInspect({ kind: "node", nodeId: check.nodeId, attemptId: check.attemptId })
                    }
                  >
                    {u("showStep")}
                  </Button>
                </div>
                {check.issues.map((issue) => (
                  <p key={issue} className="text-warning">
                    {u(`issue.${issue}`)}
                  </p>
                ))}
                {check.verification?.issues.map((issue, index) => (
                  <p key={index} className="break-words text-warning">
                    {issue}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <details data-testid="graph-run-captured-changes">
        <summary className="cursor-pointer">
          {u("changes")} ·{" "}
          {summary.sourceChanges.reduce((count, entry) => count + entry.snapshot.files.length, 0)}
        </summary>
        {!summary.sourceChanges.length ? (
          <p className="mt-2 text-foreground-subtle">{u("noChanges")}</p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-2 overflow-auto">
            {summary.sourceChanges.map((entry) => (
              <li
                key={`${entry.requestId}:${entry.alias}`}
                className="space-y-1 rounded-lg border border-border p-2"
                data-testid="graph-run-source-snapshot"
                data-request-id={entry.requestId}
                data-attempt-id={entry.attemptId}
                data-complete={entry.snapshot.complete}
              >
                <p>
                  {time(entry.capturedAt)} ·{" "}
                  {u(entry.snapshot.complete ? "snapshotComplete" : "snapshotIncomplete")}
                </p>
                <p className="break-words font-mono text-ui-xs">{entry.snapshot.scope}</p>
                {entry.snapshot.files.map((file) => (
                  <p key={file.path} className="break-all" data-testid="graph-run-source-path">
                    {file.path}
                    {file.issue ? ` · ${file.issue}` : ""}
                  </p>
                ))}
                {entry.snapshot.issues.map((issue, index) => (
                  <p key={index} className="break-words text-warning">
                    {issue}
                  </p>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onInspect({ kind: "node", nodeId: entry.nodeId, attemptId: entry.attemptId })
                  }
                >
                  {u("reviewGate")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details
        data-testid="graph-run-technical-details"
        onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-foreground-subtle">{u("technical")}</summary>
        {technicalOpen ? (
          <pre
            data-testid="graph-run-summary-snapshot"
            className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs"
          >
            {JSON.stringify(summary, null, 2)}
          </pre>
        ) : null}
      </details>
    </div>
  );
}
