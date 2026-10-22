import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphRunIsUnresolved } from "./graphEditing.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { useGraphRunText } from "./GraphRunText.js";
import { graphEvidenceActionLabels } from "./graphRunPresentation.js";
import type { GraphRunResult } from "./graphRunResult.js";
import { graphSettledAtEnd, graphStatusMismatch } from "./graphRunStage.js";

export type GraphRunInspection =
  | { kind: "node"; nodeId: string; attemptId?: string }
  | { kind: "checkpoint" | "recovery" };

export function GraphRunActions({
  run,
  summary,
  result,
  disabled,
  onInspect,
  onCancel,
  onOpenConversation,
  onRunAgain,
}: {
  run: GraphRun;
  summary: GraphRunSummary;
  result: GraphRunResult;
  disabled: boolean;
  onRunAgain?(run: GraphRun): void;
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
  const invalidOutputs = result.invalidOutputs;
  const sessionOf = (attemptId: string) =>
    run.version === undefined
      ? undefined
      : run.nodeAttempts.find((attempt) => attempt.attemptId === attemptId)?.sessionId;
  const evidenceActionLabels = graphEvidenceActionLabels(summary.evidence);
  // UX-P2：完成的运行停在 End 节点，“检查 end 步骤”没有可做的事；其他停止状态保留它，
  // 以免“无需操作”被误显示在一个失败或停止的运行上（End 仍在步骤条与步骤列表中）。
  // UX-P2-F1：与“当前步骤”事实共用同一个谓词，两处不再各自判断。
  const settledAtEnd = graphSettledAtEnd(summary);
  // UX-P2-F1：运行说在运行、尝试却未确认时，也给出“先检查拥有的原生任务”的说明（只是文字，不加恢复操作）。
  const unconfirmedAttempt = graphStatusMismatch(summary)?.kind === "unconfirmed";
  const stepButton =
    step &&
    !settledAtEnd &&
    !gates.length &&
    ![...failedChecks, ...invalidChecks].some((check) => check.nodeId === step.nodeId);
  const canRunAgain = Boolean(onRunAgain) && run.version === 5 && run.definition.template;
  // UX-M4：一次只有一个主操作（强调色）：先是原生会话，再是人工闸门，其次失败的 Test、无效输出与无效证据。
  // UX-P2：仅仅在运行的会话不在等任何人，打开它是可选的，不应与“需要你”的操作同样醒目；
  // 权限、问题与不确定归属的会话仍是主操作（第一个需要你的会话）。
  const runIsRunning = run.status === "Running" || run.status === "Starting";
  const nativePrimaryIndex = summary.actionableSessions.findIndex(
    (session) => !(runIsRunning && (session.status === "Running" || session.status === "Starting")),
  );
  const primary =
    nativePrimaryIndex >= 0
      ? "native"
      : gates.length
        ? "gate"
        : failedChecks.length
          ? "failure"
          : invalidOutputs.length
            ? "output"
            : invalidChecks.length
              ? "invalid"
              : undefined;
  const variantOf = (kind: string, index: number) =>
    primary === kind && index === (kind === "native" ? nativePrimaryIndex : 0)
      ? ("default" as const)
      : ("outline" as const);
  const hasActions =
    canRunAgain ||
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
      className="space-y-2 border-t border-border/60 pt-3"
      data-testid="graph-run-required-actions"
    >
      {/* 横幅已经说明状态；这个标题只服务辅助技术，避免重复一句“下一步”。 */}
      <h4 className="sr-only">{u("actions")}</h4>
      {!hasActions ? (
        <p className="text-ui-sm text-foreground-subtle" data-testid="graph-run-no-action">
          {u("noActionRequired")}
        </p>
      ) : null}
      {summary.actionableSessions.length ? (
        <div className="flex flex-wrap gap-2">
          {summary.actionableSessions.map((session, index) => (
            <div key={session.attemptId} className="min-w-0 space-y-1">
              <Button
                variant={variantOf("native", index)}
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
              {/* 权限等待的说明只在横幅里出现一次；问题等待没有横幅正文，仍在这里说明。 */}
              {session.status === "WaitingForUser" ? (
                <p className="max-w-lg text-ui-sm text-foreground-subtle">{u("questionHelp")}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {uncertain || unconfirmedAttempt ? (
        <p className="text-ui-sm text-warning">{u("inspectUnknown")}</p>
      ) : null}
      {evidenceActionLabels.map((key) => (
        <p key={key} className="text-ui-sm text-foreground-subtle">
          {u(key)}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {invalidOutputs.map((output, index) => (
          <Button
            key={output.attemptId}
            variant={variantOf("output", index)}
            data-testid="graph-run-inspect-output"
            onClick={() =>
              onInspect({ kind: "node", nodeId: output.nodeId, attemptId: output.attemptId })
            }
          >
            {output.name} · {u("inspectReviewerOutput")}
          </Button>
        ))}
        {invalidOutputs.flatMap((output) => {
          const sessionId = sessionOf(output.attemptId);
          return sessionId
            ? [
                <Button
                  key={`conversation:${output.attemptId}`}
                  variant="outline"
                  data-testid="graph-run-open-reviewer-conversation"
                  data-session-id={sessionId}
                  onClick={() =>
                    onOpenConversation(
                      summary.target.workspacePath,
                      sessionId,
                      summary.target.workspaceIdentity,
                    )
                  }
                >
                  {output.name} · {u("openReviewerConversation")}
                </Button>,
              ]
            : [];
        })}
        {gates.map((gate, index) => (
          <Button
            key={gate.nodeId}
            variant={variantOf("gate", index)}
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
        {failedChecks.map((check, index) => (
          <Button
            key={check.nodeId}
            variant={variantOf("failure", index)}
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
        {invalidChecks.map((check, index) => (
          <Button
            key={check.nodeId}
            variant={variantOf("invalid", index)}
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
            variant="outline"
            data-testid="graph-run-show-recovery"
            onClick={() => onInspect({ kind: "recovery" })}
          >
            {u("showRecovery")}
          </Button>
        ) : null}
        {stepButton ? (
          <Button
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
        {canRunAgain ? (
          <Button variant="outline" data-testid="graph-run-again" onClick={() => onRunAgain?.(run)}>
            {u("runAgain")}
          </Button>
        ) : null}
        {cancellable ? (
          <Button
            variant="outline"
            data-testid="graph-cancel"
            disabled={disabled}
            onClick={() => onCancel(run.id)}
          >
            {intl.formatMessage({ id: "graph.cancel" })}
          </Button>
        ) : null}
      </div>
      {summary.execution.stopRequested || run.status === "Cancelled" ? (
        <p className="text-ui-sm text-foreground-subtle">{u("stopMeaning")}</p>
      ) : null}
    </section>
  );
}
