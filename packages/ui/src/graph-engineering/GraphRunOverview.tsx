import { useMemo } from "react";
import type { GraphRun } from "@zcode/services";
import { graphRunSummary } from "./graphRunSummary.js";
import { useGraphRunText } from "./GraphRunText.js";
import { GraphRunActions, type GraphRunInspection } from "./GraphRunActions.js";
import { GraphRunCapturedDetails } from "./GraphRunCapturedDetails.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { graphEvidenceLabels } from "./graphRunPresentation.js";

export function GraphRunOverview({
  run,
  disabled,
  onCancel,
  onInspect,
  onOpenConversation,
}: {
  run: GraphRun;
  disabled: boolean;
  onCancel(runId: string): void;
  onInspect(value: GraphRunInspection): void;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
}) {
  const u = useGraphRunText();
  const summary = useMemo(() => graphRunSummary(run), [run]);
  const evidenceLabels = graphEvidenceLabels(summary.evidence);
  return (
    <section
      className="shrink-0 space-y-3 rounded-xl border border-border bg-surface p-3"
      data-testid="graph-run-summary"
      data-run-id={run.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-ui-base font-medium">
          {run.definition.name} · {u("selectedRun")}
        </h3>
        <p
          className="break-all text-ui-xs text-foreground-subtle"
          data-testid="graph-run-workspace"
        >
          {u("workspace")}: {summary.target.workspacePath}
        </p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-3">
        <Axis
          testId="graph-run-execution"
          label={u("execution")}
          state={summary.execution.status}
          value={u(`execution.${summary.execution.status}`)}
        />
        <Axis
          testId="graph-run-evidence"
          label={u("evidence")}
          state={summary.evidence.state}
          value={u(evidenceLabels.primary)}
          note={evidenceLabels.note ? u(evidenceLabels.note) : undefined}
        />
        <Axis
          testId="graph-run-human"
          label={u("human")}
          state={summary.human.state}
          value={u(`human.${summary.human.state}`)}
        />
      </dl>
      {summary.execution.stopRequested ? (
        <p role="status" data-testid="graph-run-stop-requested" className="text-ui-sm text-warning">
          {u("stopRequested")}
        </p>
      ) : null}
      {summary.execution.currentStep ? (
        <p
          data-testid="graph-run-current-step"
          data-node-id={summary.execution.currentStep.nodeId}
          data-attempt-id={summary.execution.currentStep.attemptId ?? ""}
          className="text-ui-sm"
        >
          {u("currentStep")}: {summary.execution.currentStep.name}
        </p>
      ) : null}
      <div className="grid gap-2 text-ui-sm sm:grid-cols-2">
        <CapturedText label={u("request")} text={summary.requestText} testId="graph-run-request" />
        <CapturedText
          label={u("result")}
          text={
            summary.result.kind === "text"
              ? summary.result.text
              : u(summary.result.kind === "artifact" ? "artifactResult" : "noResult")
          }
          testId="graph-run-result"
        />
      </div>
      <p className="text-ui-xs text-foreground-subtle">{u("capturedMeaning")}</p>
      <GraphRunActions {...{ run, summary, disabled, onInspect, onCancel, onOpenConversation }} />
      <GraphRunCapturedDetails {...{ summary, onInspect }} />
    </section>
  );
}

function Axis({
  testId,
  label,
  state,
  value,
  note,
}: {
  testId: string;
  label: string;
  state: string;
  value: string;
  note?: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg bg-surface-hover p-2"
      data-testid={testId}
      data-state={state}
    >
      <dt className="text-ui-xs text-foreground-subtle">{label}</dt>
      <dd className="mt-1 text-ui-sm font-medium">{value}</dd>
      {note ? <dd className="mt-1 text-ui-xs text-foreground-subtle">{note}</dd> : null}
    </div>
  );
}

function CapturedText({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <details className="min-w-0" data-testid={testId}>
      <summary className="cursor-pointer">
        {label}
        <span className="block truncate text-foreground-subtle">{text.split(/\r?\n/, 1)[0]}</span>
      </summary>
      <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-foreground-subtle">
        {text}
      </p>
    </details>
  );
}
