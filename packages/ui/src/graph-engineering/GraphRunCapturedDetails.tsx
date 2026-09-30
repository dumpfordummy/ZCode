import { Button } from "@/components/ui/button.js";
import { graphRequestText } from "./graphRequestText.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";
import type { GraphRunInspection } from "./GraphRunActions.js";
import { useGraphRunText } from "./GraphRunText.js";
import { useGraphTime } from "./GraphM2Text.js";
import type { GraphRun } from "@zcode/services";

/**
 * UX-M4: the secondary detail of a run is reached through named tabs (one level, no nested
 * collapsibles). The panels below are the former in-card disclosures; nothing a decision depends
 * on lives here: the banner and its actions own the decision.
 */

export function GraphRunRequestPanel({ run, summary }: { run: GraphRun; summary: GraphRunSummary }) {
  const u = useGraphRunText();
  const result =
    summary.result.kind === "text"
      ? summary.result.text
      : u(summary.result.kind === "artifact" ? "artifactResult" : "noResult");
  const preview = graphRequestText(run.definition, summary.requestText);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-2" data-testid="graph-run-request">
        <h4 className="text-ui-base font-medium">{u("request")}</h4>
        <p className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-foreground-subtle">
          {summary.requestText || preview}
        </p>
      </section>
      <section className="min-w-0 space-y-2" data-testid="graph-run-result">
        <h4 className="text-ui-base font-medium">{u("result")}</h4>
        <p className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-foreground-subtle">
          {result}
        </p>
      </section>
    </div>
  );
}

export function GraphRunEvidencePanel({
  summary,
  onInspect,
}: {
  summary: GraphRunSummary;
  onInspect(value: GraphRunInspection): void;
}) {
  const u = useGraphRunText();
  const time = useGraphTime();
  return (
    <div className="space-y-6 text-ui-base">
      {summary.evidence.checks.length ? (
        <section className="space-y-2" data-testid="graph-run-checks">
          <h4 className="font-medium">
            {u("checks")} · {summary.evidence.checks.length}
          </h4>
          <ul className="divide-y divide-border">
            {summary.evidence.checks.map((check) => (
              <li
                key={check.nodeId}
                data-testid="graph-run-check"
                data-node-id={check.nodeId}
                data-attempt-id={check.attemptId ?? ""}
                data-state={check.state}
                className="space-y-1 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    {check.name} · {u(`check.${check.state}`)}
                  </p>
                  <Button
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
        </section>
      ) : null}
      <section className="space-y-2" data-testid="graph-run-captured-changes">
        <h4 className="font-medium">
          {u("changes")} ·{" "}
          {summary.sourceChanges.reduce((count, entry) => count + entry.snapshot.files.length, 0)}
        </h4>
        {!summary.sourceChanges.length ? (
          <p className="text-foreground-subtle">{u("noChanges")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {summary.sourceChanges.map((entry) => (
              <li
                key={`${entry.requestId}:${entry.alias}`}
                className="space-y-1 py-2"
                data-testid="graph-run-source-snapshot"
                data-request-id={entry.requestId}
                data-attempt-id={entry.attemptId}
                data-complete={entry.snapshot.complete}
              >
                <p>
                  {time(entry.capturedAt)} ·{" "}
                  {u(entry.snapshot.complete ? "snapshotComplete" : "snapshotIncomplete")}
                </p>
                <p className="break-words font-mono text-ui-sm">{entry.snapshot.scope}</p>
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
      </section>
    </div>
  );
}

export function GraphRunTechnicalPanel({ summary }: { summary: GraphRunSummary }) {
  return (
    <section data-testid="graph-run-technical-details">
      <pre
        data-testid="graph-run-summary-snapshot"
        className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm"
      >
        {JSON.stringify(summary, null, 2)}
      </pre>
    </section>
  );
}
