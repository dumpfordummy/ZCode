import { useMemo } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { GraphRun } from "@zcode/services";
import { graphRunSummary } from "./graphRunSummary.js";
import { useGraphRunText } from "./GraphRunText.js";
import { GraphRunActions, type GraphRunInspection } from "./GraphRunActions.js";
import { GraphRunBanner, type GraphBannerIcon, type GraphBannerTone } from "./GraphRunBanner.js";
import { GraphRunStepStrip } from "./GraphRunStepStrip.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { graphEvidenceLabels } from "./graphRunPresentation.js";
import { graphRequestText } from "./graphRequestText.js";
import { graphRunOutputs } from "./graphRunOutputs.js";
import { graphRunResult } from "./graphRunResult.js";
import { GraphRunResultBlock } from "./GraphRunResultBlock.js";
import { GraphRunPermissionBlock } from "./GraphRunPermissionBlock.js";
import { graphPermissionInfo } from "./graphPermissionInfo.js";

/** Facts that say nothing happened or nothing applies read as quiet lines, not as emphasised values. */
const quietEvidence = new Set(["no-tests", "not-run"]);
const quietHuman = new Set(["not-required", "not-reached", "not-requested"]);

/**
 * UX-M4 run detail header. The banner owns the one explanation of the state and the next action;
 * under it a step strip and compact outcome facts. Execution, machine evidence, reviewer judgment
 * and the human decision stay distinct rows, but rows that do not apply are quiet single lines.
 * Request, result, checks, file changes and technical details live in the tabs below.
 */
export function GraphRunOverview({
  run,
  disabled,
  onCancel,
  onInspect,
  onOpenConversation,
  onRunAgain,
}: {
  run: GraphRun;
  disabled: boolean;
  onRunAgain?(run: GraphRun): void;
  onCancel(runId: string): void;
  onInspect(value: GraphRunInspection): void;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
}) {
  const u = useGraphRunText();
  const { intl } = useZCodeIntl();
  const summary = useMemo(() => graphRunSummary(run), [run]);
  const evidenceLabels = graphEvidenceLabels(summary.evidence);
  const outputs = graphRunOutputs(run).filter((output) => output.state !== "invalid");
  const result = useMemo(() => graphRunResult(run, summary), [run, summary]);
  const permission = graphPermissionInfo(run, summary);
  const gates = summary.human.gates.filter((gate) => gate.canDecide || gate.canContinue);
  const step = summary.execution.currentStep;
  const title = graphRequestText(run.definition, summary.requestText).trim().split(/\r?\n/, 1)[0];
  const status = summary.execution.status;
  // 横幅的语气：真正的失败用 danger；需要你处理或结果不确定用 warning；其余是中性/进行中/完成。
  const { tone, icon } = bannerStyle(result.kind, permission.length > 0, gates.length > 0, status);
  const plainTitle =
    result.kind === "none" && permission.length === 0
      ? status === "WaitingForUser"
        ? u("needs.question", { step: step?.name ?? "", run: run.definition.name })
        : gates.length
          ? u(gates[0]!.canContinue ? "needs.continuation" : "needs.approval", {
              step: gates[0]!.name,
              run: run.definition.name,
            })
          : u(`execution.${status}`)
      : undefined;
  return (
    <section
      // 「查看运行」的落点：可被程序聚焦，并使用 Graph 的边框式焦点标记。
      tabIndex={-1}
      className="shrink-0 space-y-4 rounded-lg border border-transparent focus-visible:border-brand"
      data-testid="graph-run-summary"
      data-run-id={run.id}
    >
      <header className="space-y-1">
        <h3 className="break-words text-ui-xl font-semibold">{title || run.definition.name}</h3>
        <p className="break-all text-ui-sm text-foreground-subtle" data-testid="graph-run-workspace">
          {run.definition.name} · {u("workspace")}: {summary.target.workspacePath}
        </p>
      </header>
      <GraphRunBanner
        tone={tone}
        icon={icon}
        actions={
          <GraphRunActions
            {...{
              run,
              summary,
              result,
              disabled,
              onInspect,
              onCancel,
              onOpenConversation,
              onRunAgain,
            }}
          />
        }
      >
        {plainTitle ? <p className="text-ui-lg font-semibold">{plainTitle}</p> : null}
        <GraphRunPermissionBlock items={permission} />
        <GraphRunResultBlock result={result} />
        {summary.execution.stopRequested ? (
          <p role="status" data-testid="graph-run-stop-requested" className="text-warning">
            {u("stopRequested")}
          </p>
        ) : null}
      </GraphRunBanner>
      {run.version !== undefined ? (
        <GraphRunStepStrip
          run={run}
          onSelect={(nodeId, attemptId) => onInspect({ kind: "node", nodeId, attemptId })}
        />
      ) : null}
      <dl className="divide-y divide-border rounded-lg border border-border bg-card px-4">
        <Fact
          testId="graph-run-execution"
          label={u("execution")}
          state={status}
          value={u(`execution.${status}`)}
          quiet
        />
        <Fact
          testId="graph-run-evidence"
          label={u("evidence")}
          state={summary.evidence.state}
          value={u(evidenceLabels.primary)}
          note={evidenceLabels.note ? u(evidenceLabels.note) : undefined}
          quiet={quietEvidence.has(summary.evidence.state) && summary.evidence.configuredTestCount === 0}
        />
        {/* 有效的审阅结论只是一行事实；无效输出、失败检查与其他停止统一在横幅中说明一次。 */}
        {outputs.map((output) => (
          <Fact
            key={output.attemptId}
            testId="graph-run-structured-output"
            label={output.name}
            state={output.state}
            value={u(`reviewOutcome.${output.state}`)}
          />
        ))}
        <Fact
          testId="graph-run-human"
          label={u("human")}
          state={summary.human.state}
          value={u(`human.${summary.human.state}`)}
          quiet={quietHuman.has(summary.human.state)}
        />
        {step ? (
          <div
            data-testid="graph-run-current-step"
            data-node-id={step.nodeId}
            data-attempt-id={step.attemptId ?? ""}
            className="flex flex-wrap gap-x-4 py-2 text-ui-base"
          >
            <dt className="w-40 shrink-0 text-foreground-subtle">{u("currentStep")}</dt>
            <dd className="min-w-0 flex-1">{step.name}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-ui-sm text-foreground-subtle">{u("capturedMeaning")}</p>
      {run.version !== undefined && !run.definition.nodes.some((node) => node.type === "tool") ? (
        <p className="text-ui-sm text-foreground-subtle" data-testid="graph-run-verification">
          {intl.formatMessage({ id: "graph.preZ8.agentLed" })}
        </p>
      ) : null}
    </section>
  );
}

function bannerStyle(
  kind: string,
  permission: boolean,
  gate: boolean,
  status: string,
): { tone: GraphBannerTone; icon: GraphBannerIcon } {
  if (kind === "test-failed") return { tone: "danger", icon: "failure" };
  if (kind !== "none") return { tone: "warning", icon: "alert" };
  if (permission) return { tone: "warning", icon: "shield" };
  if (gate || ["WaitingForUser", "WaitingForPermission", "AwaitingContinuation"].includes(status))
    return { tone: "warning", icon: "alert" };
  if (["Starting", "Running"].includes(status)) return { tone: "progress", icon: "progress" };
  if (status === "Completed") return { tone: "success", icon: "done" };
  if (["Interrupted", "Unknown", "CancelRequested", "StaleEvidence"].includes(status))
    return { tone: "warning", icon: "alert" };
  return { tone: "neutral", icon: "none" };
}

function Fact({
  testId,
  label,
  state,
  value,
  note,
  quiet = false,
}: {
  testId: string;
  label: string;
  state: string;
  value: string;
  note?: string;
  quiet?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-0.5 py-2 text-ui-base"
      data-testid={testId}
      data-state={state}
    >
      <dt className="w-40 shrink-0 text-foreground-subtle">{label}</dt>
      <dd className={`min-w-0 flex-1 ${quiet ? "text-foreground-subtle" : "font-medium"}`}>
        {value}
        {note ? <span className="block text-ui-sm font-normal text-foreground-subtle">{note}</span> : null}
      </dd>
    </div>
  );
}
