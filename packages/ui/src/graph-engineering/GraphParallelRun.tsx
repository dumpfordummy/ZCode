import { useState } from "react";
import type { GraphParallelRun as Run, GraphParallelView, GraphRun } from "@zcode/services";
import type { useGraphParallel } from "@/hooks/useGraphParallel.js";
import { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Textarea } from "@/components/ui/textarea.js";
import { GraphRunPanel } from "./GraphRunPanel.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { parallelConflicts } from "./graphParallelView.js";

function ChildInspector({
  run,
  onOpenConversation,
}: {
  run: GraphRun;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
}) {
  const graph = useGraphEngineering(run.target);
  const [attempt, setAttempt] = useState<string>();
  const [nodeId, setNodeId] = useState<string>();
  const current = graph.view?.runs.find((r) => r.id === run.id) ?? run;
  const fallback =
    current.version !== undefined
      ? (current.approvalAttempts?.find((g) => g.status === "WaitingForApproval")?.nodeId ??
        current.nodeAttempts[0]?.nodeId ??
        current.toolAttempts?.at(-1)?.nodeId)
      : undefined;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {current.version !== undefined
          ? current.definition.nodes
              .filter((n) => n.type !== "start" && n.type !== "end")
              .map((n) => (
                <Button
                  key={n.id}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNodeId(n.id);
                    setAttempt(undefined);
                  }}
                  data-testid={`parallel-child-node-${n.id}`}
                >
                  {n.name}
                </Button>
              ))
          : null}
      </div>
      <GraphRunPanel
        selectedRun={current}
        nodeId={nodeId ?? fallback}
        selectedAttemptId={attempt}
        regionSelected={false}
        onSelectAttempt={setAttempt}
        onOpenConversation={onOpenConversation}
        graph={graph}
        disabled={graph.pending}
      />
    </>
  );
}
export function GraphParallelRun({
  run,
  view,
  actions,
  onOpenConversation,
}: {
  run: Run;
  view: GraphParallelView;
  actions: ReturnType<typeof useGraphParallel>;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z7.${key}` });
  const [comment, setComment] = useState(""),
    [ack, setAck] = useState(false),
    [resolutions, setResolutions] = useState<Record<string, string>>({}),
    [childId, setChildId] = useState<string>();
  const children = [...run.children, run.integration, run.validation];
  const inspect =
    view.children[
      `${run.id}:${childId ?? (run.phase === "Validating" || run.phase === "Completed" ? "validation" : run.children[0]?.id)}`
    ];
  const disabled = actions.pending || view.readOnly;
  const decision = (approved: boolean) =>
    actions.decide({
      runId: run.id,
      phase: run.phase === "Prepared" ? "plan" : "integration",
      digest: (run.phase === "Prepared" ? run.preparedDigest : run.joinDigest) ?? "",
      approved,
      acknowledgedUnknowns: ack,
      comment,
      resolutions,
    });
  return (
    <section className="space-y-3" data-testid="parallel-run" data-phase={run.phase}>
      <p className="break-all font-mono text-ui-xs">
        {run.id} · {run.preview.base.head}
      </p>
      <p role="status" className="text-ui-base">
        {t(`phase.${run.phase}`)} · {t("admissions")}: {run.admissions}/{run.plan.admissionBudget}
      </p>
      {run.message ? <p className="text-ui-sm text-foreground-subtle">{run.message}</p> : null}
      <ol className="grid gap-2 sm:grid-cols-2">
        {children.map((child) => {
          const native = view.children[`${run.id}:${child.id}`];
          return (
            <li key={child.id} className="space-y-1 rounded-xl border border-border p-3 text-ui-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={!native || child.workspace?.cleaned}
                onClick={() => setChildId(child.id)}
                data-testid={`parallel-inspect-${child.id}`}
              >
                {child.id} ·{" "}
                {!child.selected
                  ? t("skipped")
                  : native
                    ? intl.formatMessage({ id: `graph.status.${native.status}` })
                    : t("pending")}
              </Button>
              <p className="break-all font-mono text-ui-xs">{child.workspace?.workspacePath}</p>
              {native?.version !== undefined
                ? native?.nodeAttempts.map((node) =>
                    node.sessionId ? (
                      <Button
                        key={node.attemptId}
                        size="sm"
                        variant="ghost"
                        disabled={child.workspace?.cleaned}
                        onClick={() =>
                          onOpenConversation(
                            native.target.workspacePath,
                            node.sessionId!,
                            native.target.workspaceIdentity,
                          )
                        }
                        data-testid={`parallel-conversation-${child.id}`}
                      >
                        {t("openConversation")}
                      </Button>
                    ) : null,
                  )
                : null}
              {child.inventory ? (
                <details>
                  <summary>{t("inventory")}</summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-ui-xs">
                    {JSON.stringify(child.inventory, null, 2)}
                  </pre>
                </details>
              ) : null}
              {child.proposal ? (
                <details>
                  <summary>{t("proposal")}</summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-ui-xs">
                    {JSON.stringify(child.proposal, null, 2)}
                  </pre>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
      <details>
        <summary className="text-ui-sm">{t("frozen")}</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-ui-xs">
          {JSON.stringify(
            {
              plan: run.plan,
              settings: run.settings,
              preview: run.preview,
              preparedDigest: run.preparedDigest,
              planDecision: run.planDecision,
              integrationDecision: run.integrationDecision,
              expectedProposal: run.expectedProposal,
              released: run.released,
              retentionDecisions: run.retentionDecisions,
              cleanup: run.cleanup,
            },
            null,
            2,
          )}
        </pre>
      </details>
      <label className="block text-ui-sm">
        {t("comment")}
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          data-testid="parallel-review-comment"
        />
      </label>
      {["Prepared", "JoinReview"].includes(run.phase) ? (
        <>
          {run.phase === "JoinReview"
            ? parallelConflicts(run).map(([path, branches]) => (
                <label key={path} className="block text-ui-sm text-warning">
                  {t("conflict")}: {path}
                  <select
                    className="ml-2 rounded-lg border border-input-border bg-input p-2"
                    value={resolutions[path] ?? ""}
                    onChange={(e) => setResolutions({ ...resolutions, [path]: e.target.value })}
                    data-testid={`parallel-conflict-${path}`}
                  >
                    <option value="">{t("choose")}</option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
              ))
            : null}
          <label className="flex items-start gap-2 text-ui-sm">
            <Checkbox
              checked={ack}
              onCheckedChange={(v) => setAck(v === true)}
              data-testid="parallel-review-ack"
            />
            {t("reviewAck")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={disabled || !ack || !comment.trim()}
              onClick={() => void decision(true)}
              data-testid="parallel-approve"
            >
              {run.phase === "Prepared" ? t("approvePlan") : t("approveIntegration")}
            </Button>
            <Button
              variant="outline"
              disabled={disabled || !comment.trim()}
              onClick={() => void decision(false)}
            >
              {t("reject")}
            </Button>
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(["cancel", "inspect", "release"] as const).map((action) => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            disabled={
              disabled || !comment.trim() || (action === "cancel" && run.phase === "Completed")
            }
            onClick={() => void actions.control({ runId: run.id, action, reason: comment })}
            data-testid={`parallel-${action}`}
          >
            {t(action)}
          </Button>
        ))}
      </div>
      <details>
        <summary className="text-ui-sm">{t("retention")}</summary>
        <p className="text-ui-sm text-foreground-subtle">{t("cleanupHelp")}</p>
        {[...run.children, run.integration]
          .filter((c) => c.workspace)
          .map((child) => (
            <div key={child.id} className="my-2 flex flex-wrap items-center gap-2 text-ui-sm">
              <span>{child.id}</span>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={run.preservedSlots.includes(child.id)}
                  disabled={disabled || !comment.trim() || child.workspace?.cleaned}
                  onCheckedChange={(v) =>
                    void actions.control({
                      runId: run.id,
                      action: "preserve",
                      slots: [child.id],
                      preserve: v === true,
                      reason: comment,
                    })
                  }
                />
                {t("preserve")}
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !comment.trim() || child.workspace?.cleaned}
                onClick={() =>
                  void actions.control({
                    runId: run.id,
                    action: "cleanup",
                    slots: [child.id],
                    reason: comment,
                  })
                }
                data-testid={`parallel-cleanup-${child.id}`}
              >
                {child.workspace?.cleaned ? t("cleaned") : t("cleanup")}
              </Button>
            </div>
          ))}
      </details>
      {inspect &&
      !children.some((child) => child.workspace?.cleaned && child.runId === inspect.id) ? (
        <section className="space-y-2 rounded-xl border border-border p-3">
          <ChildInspector key={inspect.id} run={inspect} onOpenConversation={onOpenConversation} />
        </section>
      ) : null}
    </section>
  );
}
