import type { GraphConditionAttempt, GraphSequentialRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphNodeLabel } from "./graphEditing.js";
import { graphRoutingCanContinue } from "./graphRoutingView.js";
import { useGraphTime } from "./GraphM2Text.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import { GraphDisclosure, GraphDisclosureStack } from "./GraphDisclosure.js";
import { GraphFacts } from "./GraphFacts.js";

export function GraphRoutingInspector({
  run,
  disabled,
  onContinue,
}: {
  run: GraphSequentialRun;
  disabled: boolean;
  onContinue(runId: string, checkpointId: string, checkpointDigest: string): void;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  const time = useGraphTime();
  const m4 = useGraphM4Text();
  const g = (key: string) => intl.formatMessage({ id: `graph.${key}` });
  const label = (nodeId: string) => {
    const node = run.definition.nodes.find((item) => item.id === nodeId);
    return node ? graphNodeLabel(node, run.definition, g) : nodeId;
  };
  const routing = run.routing,
    config = run.definition.routing;
  if (!routing || !config) return null;
  const checkpoint = routing.checkpoints.find((item) => item.resumeRequired && !item.consumedAt);
  return (
    <section
      tabIndex={-1}
      className="space-y-3 text-ui-sm"
      data-testid="graph-region-inspector"
      data-current-iteration-id={routing.currentIterationId}
      data-admissions={routing.admissions}
      data-stop-reason={routing.stopReason?.kind ?? ""}
    >
      <h3 className="font-medium">{config.region?.name ?? t("routingRun")}</h3>
      {routing.stopReason ? (
        <p role="status" data-testid="graph-routing-stop" className="text-warning">
          {routing.stopReason.kind}: {routing.stopReason.message}
        </p>
      ) : null}
      <GraphDisclosureStack>
        <GraphDisclosure
          testId="graph-routing-iterations"
          title={t("iterations")}
          meta={
            routing.iterations.length === 1
              ? m4("iterationsMetaOne")
              : m4("iterationsMeta", { count: routing.iterations.length })
          }
        >
          {/* 准入计数/截止时间属于诊断，不应挤占默认步骤视图；停止原因和继续操作仍保持可见。 */}
          <GraphFacts
            facts={[
              {
                label: t("admissions"),
                value: `${routing.admissions} / ${config.limits.maxNodeAdmissions}`,
              },
              { label: t("deadline"), value: time(routing.deadlineAt) },
              { label: t("maxRepairIterations"), value: config.region?.maxRepairIterations ?? 0 },
              { label: t("usage"), value: t("usageUnknown") },
            ]}
          />
          {routing.iterations.map((iteration) => (
            <GraphFacts
              key={iteration.id}
              facts={[
                {
                  label: m4("iterationLabel", { n: iteration.index }),
                  value: time(iteration.createdAt),
                },
                {
                  label: m4("stepsVisited"),
                  value: iteration.visitedNodeIds.map(label).join(" › ") || m4("noneRecorded"),
                },
                { label: m4("attemptsCount"), value: Object.keys(iteration.attemptIds).length },
                ...(iteration.feedback
                  ? [{ label: m4("feedbackText"), value: iteration.feedback.text }]
                  : []),
                ...(iteration.failureFingerprint
                  ? [{ label: m4("fingerprint"), value: iteration.failureFingerprint, mono: true }]
                  : []),
              ]}
            />
          ))}
          <GraphDisclosure title={m4("rawRecord")}>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
              {JSON.stringify(routing.iterations, null, 2)}
            </pre>
          </GraphDisclosure>
        </GraphDisclosure>
        <GraphDisclosure
          testId="graph-routing-checkpoints"
          title={t("checkpoints")}
          meta={
            routing.checkpoints.length === 1
              ? m4("checkpointsMetaOne")
              : m4("checkpointsMeta", { count: routing.checkpoints.length })
          }
        >
          {routing.checkpoints.map((item) => (
            <GraphFacts
              key={item.id}
              facts={[
                { label: m4("checkpointId"), value: item.id, mono: true },
                { label: m4("nextStep"), value: label(item.successorNodeId) },
                {
                  label: m4("checkpointState"),
                  value:
                    item.resumeRequired && !item.consumedAt
                      ? m4("checkpointWaiting")
                      : item.consumedAt
                        ? m4("checkpointConsumed", { time: time(item.consumedAt) })
                        : m4("checkpointRecorded"),
                },
                { label: m4("createdAt"), value: time(item.createdAt) },
                { label: m4("decisionId"), value: item.decisionId, mono: true },
                { label: m4("digestLabel"), value: item.digest, mono: true },
              ]}
            />
          ))}
          <GraphDisclosure title={m4("rawRecord")}>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
              {JSON.stringify(routing.checkpoints, null, 2)}
            </pre>
          </GraphDisclosure>
        </GraphDisclosure>
      </GraphDisclosureStack>
      {checkpoint ? (
        <div className="space-y-2">
          <p className="text-foreground-subtle">{t("continueHelp")}</p>
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-route-continue"
            data-checkpoint-id={checkpoint.id}
            data-checkpoint-digest={checkpoint.digest}
            disabled={disabled || !graphRoutingCanContinue(run)}
            onClick={() => onContinue(run.id, checkpoint.id, checkpoint.digest)}
          >
            {t("continueRoute")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
export function GraphConditionInspector({ attempt }: { attempt: GraphConditionAttempt }) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  return (
    <section
      className="space-y-2 text-ui-sm"
      data-testid="graph-condition-inspector"
      data-node-id={attempt.nodeId}
      data-attempt-id={attempt.attemptId}
      data-iteration-id={attempt.iterationId}
      data-selected-exit={attempt.selectedExit ?? ""}
    >
      <p>{intl.formatMessage({ id: `graph.status.${attempt.status}` })}</p>
      <p className="break-all">
        {t("exit")}: {attempt.selectedExit ?? "—"}
      </p>
      <p className="break-all">
        {t("successor")}: {attempt.successorNodeId ?? "—"}
      </p>
      {attempt.message ? <p className="text-warning">{attempt.message}</p> : null}
      <details open>
        <summary>{t("evaluatedValues")}</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
          {JSON.stringify(
            {
              bindings: attempt.bindings ?? [],
              values: attempt.values ?? [],
              decisionId: attempt.decisionId ?? null,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}
