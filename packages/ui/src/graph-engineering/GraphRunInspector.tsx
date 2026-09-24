import type { GraphSequentialRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphConversationTarget } from "./graphEngineeringView.js";
import { GraphApprovalInspector, type GraphApprovalActions } from "./GraphApprovalInspector.js";
import { GraphSelect } from "./GraphSelect.js";
import { graphNodeAttempts, graphSelectedAttempt } from "./graphRoutingView.js";
import { GraphConditionInspector } from "./GraphRoutingInspector.js";
import { GraphToolInspector } from "./GraphToolInspector.js";
import { GraphArtifactInspector, type GraphEvidenceActions } from "./GraphArtifactInspector.js";

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
  return (
    <section
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
      <p className="text-ui-sm text-foreground-subtle">{t("frozenHelp")}</p>
      {run.version === 5 && choices.length ? (
        <GraphSelect
          label={t("z5.iterationAttempt")}
          testId="graph-attempt-select"
          value={selected?.attemptId ?? "none"}
          options={[
            ...(!selected ? [{ value: "none", label: t("z5.selectAttempt") }] : []),
            ...choices.map((item) => ({
              value: item.attemptId,
              label: `${t("z5.iteration")} ${item.iteration ?? 0} · ${t(`status.${item.status}`)} · ${item.attemptId}`,
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
          <p className="break-all font-mono text-ui-sm">{node.outputNodeId}</p>
          <TextEvidence title={t("runResult")} text={run.result?.text ?? t("noOutput")} />
        </>
      ) : null}
      {attempt && node?.type === "task" ? (
        <>
          <p role="status" className="text-ui-sm">
            {t(`status.${attempt.status}`)}
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
          <dl className="grid grid-cols-1 gap-1 break-all text-ui-sm">
            <dt className="text-foreground-subtle">{t("configurationSource")}</dt>
            <dd>
              {attempt.settings.source === "workspace"
                ? t("inheritSettings")
                : t("overrideSettings")}
            </dd>
            <dt className="text-foreground-subtle">{t("configuration")}</dt>
            <dd>
              {attempt.settings.modelSelection.providerId} /{" "}
              {attempt.settings.modelSelection.modelId} · {attempt.settings.mode}
              {attempt.settings.modelSelection.options?.reasoningLevel
                ? ` · ${attempt.settings.modelSelection.options.reasoningLevel}`
                : ""}
              {attempt.settings.planEnabled ? ` · ${t("planEnabled")}` : ""}
            </dd>
            <dt className="text-foreground-subtle">{t("attempt")}</dt>
            <dd className="font-mono">{attempt.attemptId}</dd>
            <dt className="text-foreground-subtle">{t("session")}</dt>
            <dd className="font-mono">{attempt.sessionId ?? "—"}</dd>
            <dt className="text-foreground-subtle">{t("input")}</dt>
            <dd className="font-mono">{attempt.inputId}</dd>
            <dt className="text-foreground-subtle">{t("command")}</dt>
            <dd className="font-mono">{attempt.commandId}</dd>
            <dt className="text-foreground-subtle">{t("runtime")}</dt>
            <dd className="font-mono">{attempt.runtimeIdentity ?? "—"}</dd>
            <dt className="text-foreground-subtle">{t("dispatchPhase")}</dt>
            <dd>{attempt.dispatchPhase}</dd>
          </dl>
          <TextEvidence
            title={t("resolvedInstructions")}
            text={attempt.resolvedInstructions ?? t("notSubmitted")}
          />
          <details className="text-ui-sm">
            <summary>{t("instructionTemplate")}</summary>
            <p className="mt-2 whitespace-pre-wrap break-words">{node.instructions}</p>
          </details>
          {attempt.bindings?.length ? (
            <details className="text-ui-sm" data-testid="graph-frozen-bindings">
              <summary>{t("bindingEvidence")}</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                {JSON.stringify(attempt.bindings, null, 2)}
              </pre>
            </details>
          ) : null}
          {attempt.finalOutput ? (
            <TextEvidence title={t("finalOutput")} text={attempt.finalOutput.text} />
          ) : null}
          {attempt.outputIssue ? (
            <p className="text-ui-sm text-warning">{attempt.outputIssue}</p>
          ) : null}
          <details className="text-ui-sm">
            <summary>{t("terminalProof")}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
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
          </details>
        </>
      ) : null}
      {run.version >= 4 ? (
        <GraphArtifactInspector
          key={`${run.id}:${nodeId}:${selected?.attemptId}`}
          run={run}
          nodeId={nodeId}
          attemptId={selected?.attemptId}
          actions={evidenceActions}
          disabled={approvalActions.disabled}
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
