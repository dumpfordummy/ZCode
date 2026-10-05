import type { GraphNode, GraphSequentialRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphConversationTarget } from "./graphEngineeringView.js";
import { GraphApprovalInspector, type GraphApprovalActions } from "./GraphApprovalInspector.js";
import { GraphSelect } from "./GraphSelect.js";
import { graphNodeAttempts, graphSelectedAttempt } from "./graphRoutingView.js";
import { GraphConditionInspector } from "./GraphRoutingInspector.js";
import { GraphToolInspector } from "./GraphToolInspector.js";
import { GraphArtifactInspector, type GraphEvidenceActions } from "./GraphArtifactInspector.js";
import { useGraphRunText } from "./GraphRunText.js";
import { GraphDisclosure, GraphDisclosureStack } from "./GraphDisclosure.js";
import { GraphFacts } from "./GraphFacts.js";

export function GraphRunInspector({
  run,
  nodeId,
  onOpenConversation,
  approvalActions,
  evidenceActions,
  selectedAttemptId,
  onSelectAttempt,
}: {
  run: GraphSequentialRun;
  nodeId?: string;
  selectedAttemptId?: string;
  onSelectAttempt?: (attemptId: string) => void;
  approvalActions: GraphApprovalActions;
  evidenceActions: GraphEvidenceActions;
  onOpenConversation: (
    workspacePath: string,
    sessionId: string,
    workspaceIdentity?: string,
  ) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = useGraphRunText();
  const node = run.definition.nodes.find((item) => item.id === nodeId);
  const choices = nodeId ? graphNodeAttempts(run, nodeId) : [];
  const selected = nodeId ? graphSelectedAttempt(run, nodeId, selectedAttemptId) : undefined;
  const attempt = run.nodeAttempts.find((item) => item.attemptId === selected?.attemptId);
  const approval = run.approvalAttempts?.find((item) => item.attemptId === selected?.attemptId);
  const tool = run.toolAttempts?.find((item) => item.attemptId === selected?.attemptId);
  const condition = run.routing?.conditionAttempts.find(
    (item) => item.attemptId === selected?.attemptId,
  );
  const conversation = graphConversationTarget({
    ...run.target,
    sessionId: attempt?.sessionId ?? null,
  });
  const nodeLabel = (item: GraphNode) =>
    item.type === "task" ||
    item.type === "approval" ||
    item.type === "tool" ||
    item.type === "condition"
      ? item.name
      : t(`node.${item.type}`);
  // 人性化 end 节点的输出引用：解析为节点名称，找不到时回退到原始 ID。
  const outputNode =
    node?.type === "end"
      ? run.definition.nodes.find((item) => item.id === node.outputNodeId)
      : undefined;
  return (
    <section
      tabIndex={-1}
      className="space-y-3"
      data-testid="graph-node-inspector"
      data-node-id={nodeId ?? ""}
      data-session-id={attempt?.sessionId ?? tool?.sessionId ?? ""}
      data-input-id={attempt?.inputId ?? ""}
      data-status={selected?.status ?? ""}
      data-attempt-id={selected?.attemptId ?? ""}
      data-iteration-id={selected?.iterationId ?? ""}
    >
      <h3 className="text-ui-base font-medium">
        {node?.type === "task" ||
        node?.type === "approval" ||
        node?.type === "tool" ||
        node?.type === "condition"
          ? node.name
          : node
            ? t(`node.${node.type}`)
            : t("selectNode")}
      </h3>
      {run.version === 5 && choices.length ? (
        <GraphSelect
          label={t("z5.iterationAttempt")}
          testId="graph-attempt-select"
          value={selected?.attemptId ?? "none"}
          options={[
            ...(!selected ? [{ value: "none", label: t("z5.selectAttempt") }] : []),
            ...choices.map((item) => ({
              value: item.attemptId,
              label: `${t("z5.iteration")} ${item.iteration ?? 0} · ${u(`execution.${item.status}`)}`,
            })),
          ]}
          onChange={(value) => {
            if (value !== "none") onSelectAttempt?.(value);
          }}
          disabled={false}
        />
      ) : null}
      {condition ? <GraphConditionInspector attempt={condition} /> : null}
      {tool ? <GraphToolInspector {...{ run, attempt: tool, onOpenConversation }} /> : null}
      {approval && node?.type === "approval" ? (
        <GraphApprovalInspector
          key={`${run.id}:${approval.attemptId}:${approval.request?.id ?? "pending"}:${approval.request?.version ?? 0}`}
          run={run}
          gate={approval}
          actions={approvalActions}
          onOpenConversation={onOpenConversation}
        />
      ) : null}
      {node?.type === "start" ? (
        <TextEvidence title={t("startInput")} text={run.startInput} />
      ) : null}
      {node?.type === "end" ? (
        <>
          <p className="break-all text-ui-sm">
            {outputNode ? nodeLabel(outputNode) : node.outputNodeId}
          </p>
          <TextEvidence title={t("runResult")} text={run.result?.text ?? t("noOutput")} />
        </>
      ) : null}
      {attempt && node?.type === "task" ? (
        <>
          <p role="status" className="text-ui-sm">
            {u(`execution.${attempt.status}`)}
          </p>
          {attempt.message ? (
            <p className="break-words text-ui-sm text-foreground-subtle">{attempt.message}</p>
          ) : null}
          {conversation ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="graph-open-conversation"
              onClick={() =>
                onOpenConversation(
                  conversation.workspacePath,
                  conversation.sessionId,
                  conversation.workspaceIdentity,
                )
              }
            >
              {t("openConversation")}
            </Button>
          ) : null}
          {["WaitingForPermission", "WaitingForUser"].includes(attempt.status) ? (
            <p className="text-ui-sm text-foreground-subtle">{t("waitingHelp")}</p>
          ) : null}
          <GraphDisclosureStack>
            <GraphDisclosure title={u("technical")}>
              <GraphFacts
                facts={[
                  {
                    label: t("configurationSource"),
                    value:
                      attempt.settings.source === "workspace"
                        ? t("inheritSettings")
                        : t("overrideSettings"),
                  },
                  {
                    label: t("configuration"),
                    value: `${attempt.settings.modelSelection.providerId} / ${attempt.settings.modelSelection.modelId} · ${attempt.settings.mode}${
                      attempt.settings.modelSelection.options?.reasoningLevel
                        ? ` · ${attempt.settings.modelSelection.options.reasoningLevel}`
                        : ""
                    }${attempt.settings.planEnabled ? ` · ${t("planEnabled")}` : ""}`,
                  },
                  { label: t("attempt"), value: attempt.attemptId, mono: true },
                  { label: t("session"), value: attempt.sessionId ?? "—", mono: true },
                  { label: t("input"), value: attempt.inputId, mono: true },
                  { label: t("command"), value: attempt.commandId, mono: true },
                  { label: t("runtime"), value: attempt.runtimeIdentity ?? "—", mono: true },
                  { label: t("dispatchPhase"), value: attempt.dispatchPhase },
                ]}
              />
            </GraphDisclosure>
          </GraphDisclosureStack>
          <GraphDisclosureStack>
            {/* 已提交提示词不是执行状态；保留全文在既有披露区，避免默认占据步骤检查器。 */}
            <GraphDisclosure title={t("resolvedInstructions")} testId="graph-resolved-instructions">
              <p className="max-h-80 overflow-auto whitespace-pre-wrap break-words">
                {attempt.resolvedInstructions ?? t("notSubmitted")}
              </p>
            </GraphDisclosure>
            <GraphDisclosure title={t("instructionTemplate")}>
              <p className="whitespace-pre-wrap break-words">{node.instructions}</p>
            </GraphDisclosure>
            {attempt.bindings?.length ? (
              <GraphDisclosure testId="graph-frozen-bindings" title={t("bindingEvidence")}>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                  {JSON.stringify(attempt.bindings, null, 2)}
                </pre>
              </GraphDisclosure>
            ) : null}
          </GraphDisclosureStack>
          {attempt.finalOutput ? (
            <TextEvidence title={t("finalOutput")} text={attempt.finalOutput.text} />
          ) : null}
          {attempt.outputIssue ? (
            <p className="text-ui-sm text-warning">{attempt.outputIssue}</p>
          ) : null}
          <GraphDisclosureStack>
            <GraphDisclosure title={t("terminalProof")}>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                {JSON.stringify(
                  {
                    terminalProof: attempt.terminalProof ?? null,
                    finalOutput: attempt.finalOutput
                      ? { ...attempt.finalOutput, text: undefined }
                      : null,
                  },
                  null,
                  2,
                )}
              </pre>
            </GraphDisclosure>
          </GraphDisclosureStack>
        </>
      ) : null}
      {run.version >= 4 ? (
        <GraphArtifactInspector
          key={`${run.id}:${nodeId}:${selected?.attemptId}`}
          run={run}
          nodeId={nodeId}
          attemptId={selected?.attemptId}
          actions={evidenceActions}
        />
      ) : null}
    </section>
  );
}

function TextEvidence({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1">
      <h4 className="text-ui-sm font-medium">{title}</h4>
      <p className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-ui-sm text-foreground-subtle">
        {text}
      </p>
    </div>
  );
}
