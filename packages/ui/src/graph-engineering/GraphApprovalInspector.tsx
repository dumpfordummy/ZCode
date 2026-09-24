import { useState } from "react";
import type {
  GraphApprovalAttempt,
  GraphApprovalCommand,
  GraphSequentialRun,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphApprovalEvidence } from "./GraphApprovalEvidence.js";
import {
  graphApprovalActionState,
  graphApprovalCommand,
  type GraphDecisionIntent,
} from "./graphApprovalView.js";

export interface GraphApprovalActions {
  disabled: boolean;
  retainedDecision: (command: GraphApprovalCommand) => GraphDecisionIntent | undefined;
  decideApproval: (
    command: GraphApprovalCommand,
    value: "approve" | "reject",
    comment: string,
  ) => Promise<unknown>;
  continueApproval: (command: GraphApprovalCommand) => Promise<unknown>;
}

export function GraphApprovalInspector({
  run,
  gate,
  actions,
  onOpenConversation,
}: {
  run: GraphSequentialRun;
  gate: GraphApprovalAttempt;
  actions: GraphApprovalActions;
  onOpenConversation: (
    workspacePath: string,
    sessionId: string,
    workspaceIdentity?: string,
  ) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.approval.${id}` });
  const [comment, setComment] = useState("");
  const request = gate.request;
  const frozenNode = run.definition.nodes.find(
    (node) => node.id === gate.nodeId && node.type === "approval",
  );
  const command = graphApprovalCommand(run, gate);
  const enabled = graphApprovalActionState(run, gate);
  const retained = command ? actions.retainedDecision(command) : undefined;
  const decision = gate.decision;
  const successor = run.definition.nodes.find((node) => node.id === request?.successorNodeId);
  const effectiveComment = retained?.comment ?? comment;
  const commentReady = request?.commentPolicy !== "required" || Boolean(effectiveComment.trim());
  const allowed =
    enabled.decide && !actions.disabled && commentReady && effectiveComment.length <= 2000;
  const blockedReason = !request
    ? t("requestPending")
    : !request.complete
      ? t("evidenceIncomplete")
      : gate.status === "StaleEvidence" || run.status === "StaleEvidence"
        ? t("staleHelp")
        : gate.resumeRequired && run.status === "AwaitingContinuation"
          ? t("continueHelp")
          : decision
            ? t("decisionSaved")
            : !enabled.decide
              ? t("decisionBlocked")
              : !commentReady
                ? t("commentRequired")
                : null;
  return (
    <section
      className="space-y-3"
      data-testid="graph-approval-request"
      data-node-id={gate.nodeId}
      data-request-id={request?.id ?? ""}
      data-request-version={request?.version ?? ""}
      data-digest={request?.digest ?? ""}
      data-status={gate.status}
    >
      <p className="text-ui-sm text-foreground-subtle">{t("controlMeaning")}</p>
      <p role="status" className="text-ui-sm">
        {intl.formatMessage({ id: `graph.status.${gate.status}` })}
      </p>
      <p className="whitespace-pre-wrap break-words text-ui-sm">
        {request?.reviewText ??
          (frozenNode?.type === "approval" ? frozenNode.reviewInstructions : "")}
      </p>
      {request ? (
        <>
          <dl className="space-y-1 break-all text-ui-sm">
            <dt className="text-foreground-subtle">{t("commentPolicy")}</dt>
            <dd>
              {t(request.commentPolicy === "required" ? "commentRequired" : "commentOptional")}
            </dd>
            <dt className="text-foreground-subtle">{t("workspace")}</dt>
            <dd className="font-mono">{request.target.workspacePath}</dd>
            <dt className="text-foreground-subtle">{t("successor")}</dt>
            <dd>
              {successor && "name" in successor
                ? successor.name
                : successor
                  ? intl.formatMessage({ id: `graph.node.${successor.type}` })
                  : t("noSuccessor")}
            </dd>
            <dt className="text-foreground-subtle">{t("requestIdentity")}</dt>
            <dd className="font-mono">
              {request.id} · v{request.version}
            </dd>
          </dl>
          <details className="text-ui-sm">
            <summary>{t("requestCorrelation")}</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
              {JSON.stringify(
                {
                  runId: run.id,
                  nodeId: gate.nodeId,
                  attemptId: gate.attemptId,
                  workspaceIdentity: request.target.workspaceIdentity,
                  requestDigest: request.digest,
                  graphDigest: request.graphDigest,
                  createdAt: request.createdAt,
                  successorIntent: gate.successorIntent,
                },
                null,
                2,
              )}
            </pre>
          </details>
          {request.complete ? (
            <p className="text-ui-sm text-foreground-subtle">{t("evidenceComplete")}</p>
          ) : null}
          {request.issues.map((issue, index) => (
            <p key={index} className="text-ui-sm text-warning">
              {issue}
            </p>
          ))}
          {request.evidence.map((evidence) => (
            <GraphApprovalEvidence
              key={evidence.alias}
              evidence={evidence}
              target={request.target}
              onOpenConversation={onOpenConversation}
            />
          ))}
        </>
      ) : null}
      <p className="text-ui-sm text-foreground-subtle">{t("checkLimit")}</p>
      {gate.message ? (
        <p className="break-words text-ui-sm text-foreground-subtle">{gate.message}</p>
      ) : null}
      {blockedReason ? (
        <p role="status" className="text-ui-sm text-warning" data-testid="graph-approval-blocked">
          {blockedReason}
        </p>
      ) : null}
      {retained && !decision ? (
        <p className="text-ui-sm text-warning">{t("retainedDecision")}</p>
      ) : null}
      {enabled.continue && command ? (
        <Button
          variant="outline"
          size="sm"
          data-testid="graph-approval-continue"
          disabled={actions.disabled}
          onClick={() => void actions.continueApproval(command)}
        >
          {t(decision ? "continueApproved" : "continueReview")}
        </Button>
      ) : null}
      {request && !decision ? (
        <>
          <label className="block space-y-1 text-ui-sm">
            <span>
              {t("comment")}
              {request.commentPolicy === "required" ? ` · ${t("commentRequired")}` : ""}
            </span>
            <Textarea
              rows={3}
              maxLength={2000}
              value={retained?.comment ?? comment}
              disabled={actions.disabled || Boolean(retained) || !enabled.decide}
              data-testid="graph-approval-comment"
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              data-testid="graph-approval-approve"
              disabled={!allowed || Boolean(retained && retained.value !== "approve")}
              onClick={() => {
                if (command && allowed)
                  void actions.decideApproval(command, "approve", retained?.comment ?? comment);
              }}
            >
              {t("approve")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="graph-approval-reject"
              disabled={!allowed || Boolean(retained && retained.value !== "reject")}
              onClick={() => {
                if (command && allowed)
                  void actions.decideApproval(command, "reject", retained?.comment ?? comment);
              }}
            >
              {t("reject")}
            </Button>
          </div>
        </>
      ) : null}
      {decision ? (
        <section
          className="space-y-2 border-t border-border pt-3 text-ui-sm"
          data-testid="graph-approval-decisions"
          data-decision-id={decision.id}
        >
          <h4 className="font-medium">{t("decisionHistory")}</h4>
          <p>
            {t(decision.value)} · {new Date(decision.decidedAt).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap break-words">{decision.comment}</p>
          <dl className="break-all font-mono text-ui-xs">
            <dt>{t("decisionId")}</dt>
            <dd>{decision.id}</dd>
            <dt>{t("actor")}</dt>
            <dd>
              {decision.actor.kind} / {decision.actor.hostSessionId}
            </dd>
            <dt>{t("requestIdentity")}</dt>
            <dd>
              {decision.requestId} · v{decision.requestVersion}
            </dd>
            <dt>{t("digest")}</dt>
            <dd>{decision.requestDigest}</dd>
          </dl>
          <p className="text-foreground-subtle">{t("actorLimit")}</p>
        </section>
      ) : null}
    </section>
  );
}
