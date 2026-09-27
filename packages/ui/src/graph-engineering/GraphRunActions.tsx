import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphRunIsUnresolved } from "./graphEditing.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { useGraphRunText } from "./GraphRunText.js";
import { graphEvidenceActionLabels } from "./graphRunPresentation.js";

export type GraphRunInspection =
  | { kind: "node"; nodeId: string; attemptId?: string }
  | { kind: "checkpoint" | "recovery" };

export function GraphRunActions({
  run,
  summary,
  disabled,
  onInspect,
  onCancel,
  onOpenConversation,
}: {
  run: GraphRun;
  summary: GraphRunSummary;
  disabled: boolean;
  onInspect(value: GraphRunInspection): void;
  onCancel(runId: string): void;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
}) {
  const u = useGraphRunText(),
    { intl } = useZCodeIntl();
  const cancellable =
    graphRunIsUnresolved(run) &&
    ([
      "Starting",
      "Running",
      "WaitingForPermission",
      "WaitingForUser",
      "WaitingForApproval",
      "AwaitingContinuation",
      "StaleEvidence",
    ].includes(run.status) ||
      run.recovery?.state === "active");
  const uncertain =
    ["Unknown", "Interrupted", "CancelRequested"].includes(run.status) && !run.release;
  const gates = summary.human.gates.filter(
    (gate) => gate.canDecide || gate.canContinue || gate.status === "StaleEvidence",
  );
  const problemChecks = summary.evidence.checks.filter(
    (check) => check.state === "failed" || check.state === "invalid",
  );
  const step = summary.execution.currentStep;
  return (
    <section
      className="space-y-2 border-t border-border pt-2"
      data-testid="graph-run-required-actions"
    >
      <h4 className="text-ui-sm font-medium">{u("actions")}</h4>
      {summary.actionableSessions.length ? (
        <div className="flex flex-wrap gap-2">
          {summary.actionableSessions.map((session) => (
            <div key={session.attemptId} className="min-w-0 space-y-1">
              <Button
                size="sm"
                variant="outline"
                data-testid="graph-run-open-native"
                data-session-id={session.sessionId}
                data-node-id={session.nodeId}
                data-attempt-id={session.attemptId}
                onClick={() =>
                  onOpenConversation(
                    summary.target.workspacePath,
                    session.sessionId,
                    summary.target.workspaceIdentity,
                  )
                }
              >
                {session.name} · {u("openNative")}
              </Button>
              {session.status === "WaitingForPermission" || session.status === "WaitingForUser" ? (
                <p className="max-w-lg text-ui-xs text-foreground-subtle">
                  {u(session.status === "WaitingForPermission" ? "permissionHelp" : "questionHelp")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {uncertain ? <p className="text-ui-sm text-warning">{u("inspectUnknown")}</p> : null}
      {graphEvidenceActionLabels(summary.evidence).map((key) => (
        <p key={key} className="text-ui-sm text-foreground-subtle">
          {u(key)}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {gates.map((gate) => (
          <Button
            key={gate.nodeId}
            size="sm"
            variant="outline"
            data-testid="graph-run-review-gate"
            data-node-id={gate.nodeId}
            data-attempt-id={gate.attemptId ?? ""}
            data-request-id={gate.requestId ?? ""}
            onClick={() =>
              onInspect({ kind: "node", nodeId: gate.nodeId, attemptId: gate.attemptId })
            }
          >
            {gate.name} · {u("reviewGate")}
          </Button>
        ))}
        {problemChecks.map((check) => (
          <Button
            key={check.nodeId}
            size="sm"
            variant="outline"
            data-testid="graph-run-inspect-evidence"
            data-node-id={check.nodeId}
            onClick={() =>
              onInspect({ kind: "node", nodeId: check.nodeId, attemptId: check.attemptId })
            }
          >
            {check.name} · {u("showStep")}
          </Button>
        ))}
        {summary.checkpoint ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-run-show-checkpoint"
            data-checkpoint-id={summary.checkpoint.id}
            data-checkpoint-digest={summary.checkpoint.digest}
            onClick={() => onInspect({ kind: "checkpoint" })}
          >
            {u("showCheckpoint")}
          </Button>
        ) : null}
        {uncertain ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-run-show-recovery"
            onClick={() => onInspect({ kind: "recovery" })}
          >
            {u("showRecovery")}
          </Button>
        ) : null}
        {step && !gates.length && !problemChecks.some((check) => check.nodeId === step.nodeId) ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-run-show-step"
            onClick={() =>
              onInspect({ kind: "node", nodeId: step.nodeId, attemptId: step.attemptId })
            }
          >
            {step.name} · {u("showStep")}
          </Button>
        ) : null}
        {cancellable ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-cancel"
            disabled={disabled}
            onClick={() => onCancel(run.id)}
          >
            {intl.formatMessage({ id: "graph.cancel" })}
          </Button>
        ) : null}
      </div>
      {cancellable || summary.execution.stopRequested || run.status === "Cancelled" ? (
        <p className="text-ui-xs text-foreground-subtle">{u("stopMeaning")}</p>
      ) : null}
    </section>
  );
}
