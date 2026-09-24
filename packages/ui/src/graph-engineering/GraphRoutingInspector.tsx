import type { GraphConditionAttempt, GraphSequentialRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphRoutingCanContinue } from "./graphRoutingView.js";

export function GraphRoutingInspector({
  run,
  disabled,
  onContinue,
}: {
  run: GraphSequentialRun;
  disabled: boolean;
  onContinue(runId: string, checkpointId: string, checkpointDigest: string): void;
}) {
  const { intl, locale } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  const routing = run.routing,
    config = run.definition.routing;
  if (!routing || !config) return null;
  const checkpoint = routing.checkpoints.find((item) => item.resumeRequired && !item.consumedAt);
  return (
    <section
      className="space-y-3 text-ui-sm"
      data-testid="graph-region-inspector"
      data-current-iteration-id={routing.currentIterationId}
      data-admissions={routing.admissions}
      data-stop-reason={routing.stopReason?.kind ?? ""}
    >
      <h3 className="font-medium">{config.region?.name ?? t("routingRun")}</h3>
      <dl className="grid gap-1 break-all">
        <dt className="text-foreground-subtle">{t("admissions")}</dt>
        <dd>
          {routing.admissions} / {config.limits.maxNodeAdmissions}
        </dd>
        <dt className="text-foreground-subtle">{t("deadline")}</dt>
        <dd>{new Date(routing.deadlineAt).toLocaleString(locale)}</dd>
        <dt className="text-foreground-subtle">{t("maxRepairIterations")}</dt>
        <dd>{config.region?.maxRepairIterations ?? 0}</dd>
        <dt className="text-foreground-subtle">{t("usage")}</dt>
        <dd>{t("usageUnknown")}</dd>
      </dl>
      {routing.stopReason ? (
        <p role="status" data-testid="graph-routing-stop" className="text-warning">
          {routing.stopReason.kind}: {routing.stopReason.message}
        </p>
      ) : null}
      <details data-testid="graph-routing-iterations">
        <summary>{t("iterations")}</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
          {JSON.stringify(routing.iterations, null, 2)}
        </pre>
      </details>
      <details>
        <summary>{t("checkpoints")}</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
          {JSON.stringify(routing.checkpoints, null, 2)}
        </pre>
      </details>
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
