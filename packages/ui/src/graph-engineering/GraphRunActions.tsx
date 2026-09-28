import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphRunIsUnresolved } from "./graphEditing.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { useGraphRunText } from "./GraphRunText.js";
import { graphEvidenceActionLabels } from "./graphRunPresentation.js";
import { graphRunOutputs } from "./graphRunOutputs.js";

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
  // 机器检查失败/证据无效与 reviewer 输出校验属于不同结果，不能用 invalidChecks 推断 JSON 解析失败。
  const failedChecks = summary.evidence.checks.filter((check) => check.state === "failed");
  const invalidChecks = summary.evidence.checks.filter((check) => check.state === "invalid");
  const step = summary.execution.currentStep;
  const invalidOutputs = graphRunOutputs(run).filter((output) => output.state === "invalid");
  const evidenceActionLabels = graphEvidenceActionLabels(summary.evidence);
  const stepButton =
    step &&
    !gates.length &&
    ![...failedChecks, ...invalidChecks].some((check) => check.nodeId === step.nodeId);
  const hasActions =
    summary.actionableSessions.length > 0 ||
    uncertain ||
    invalidChecks.length > 0 ||
    invalidOutputs.length > 0 ||
    evidenceActionLabels.length > 0 ||
    gates.length > 0 ||
    failedChecks.length > 0 ||
    Boolean(summary.checkpoint) ||
    Boolean(stepButton) ||
    cancellable;
  return (
    <section
      className="space-y-2 border-t border-border pt-2"
      data-testid="graph-run-required-actions"
    >
      <h4 className="text-ui-sm font-medium">{u("actions")}</h4>
      {!hasActions ? (
        <p className="text-ui-sm text-foreground-subtle" data-testid="graph-run-no-action">
          {u("noActionRequired")}
        </p>
      ) : null}
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
      {invalidOutputs.length ? (
        <p
          role="alert"
          data-testid="graph-run-output-validation-failed"
          className="text-ui-sm text-warning"
        >
          {u("outputValidationFailed")}
        </p>
      ) : null}
      {evidenceActionLabels.map((key) => (
        <p key={key} className="text-ui-sm text-foreground-subtle">
          {u(key)}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {invalidOutputs.map((output) => (
          <Button
            key={output.attemptId}
            size="sm"
            variant="outline"
            data-testid="graph-run-inspect-output"
            onClick={() =>
              onInspect({ kind: "node", nodeId: output.nodeId, attemptId: output.attemptId })
            }
          >
            {output.name} · {u("inspectInvalidEvidence")}
          </Button>
        ))}
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
              onInspect({
                kind: "node",
                nodeId: gate.nodeId,
                attemptId: gate.attemptId,
              })
            }
          >
            {gate.name} · {u("reviewGate")}
          </Button>
        ))}
        {failedChecks.map((check) => (
          <Button
            key={check.nodeId}
            size="sm"
            variant="outline"
            data-testid="graph-run-inspect-failure"
            data-node-id={check.nodeId}
            onClick={() =>
              onInspect({
                kind: "node",
                nodeId: check.nodeId,
                attemptId: check.attemptId,
              })
            }
          >
            {check.name} · {u("inspectFailedTest")}
          </Button>
        ))}
        {invalidChecks.map((check) => (
          <Button
            key={check.nodeId}
            size="sm"
            variant="outline"
            data-testid="graph-run-inspect-invalid"
            data-node-id={check.nodeId}
            onClick={() =>
              onInspect({
                kind: "node",
                nodeId: check.nodeId,
                attemptId: check.attemptId,
              })
            }
          >
            {check.name} · {u("inspectInvalidEvidence")}
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
        {stepButton ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-run-show-step"
            onClick={() =>
              onInspect({
                kind: "node",
                nodeId: step.nodeId,
                attemptId: step.attemptId,
              })
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
