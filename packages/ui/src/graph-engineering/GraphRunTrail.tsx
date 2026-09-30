import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { GraphSequentialRun } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphNodeLabel, graphRunIsUnresolved } from "./graphEditing.js";
import { graphRunTrail } from "./graphRunTrailModel.js";
import { useGraphRunText } from "./GraphRunText.js";

const known = new Set([
  "Pending",
  "Starting",
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
  "WaitingForApproval",
  "AwaitingContinuation",
  "Completed",
  "Approved",
  "Evaluated",
  "Rejected",
  "Failed",
  "Skipped",
  "StaleEvidence",
  "Unknown",
  "Interrupted",
  "Cancelled",
  "CancelRequested",
]);

function StepIcon({ status }: { status?: string }) {
  const className = "mt-0.5 size-4 shrink-0";
  if (status && ["Completed", "Approved", "Evaluated"].includes(status))
    return <CheckCircle2 className={`${className} text-success`} aria-hidden="true" />;
  if (status && ["Failed", "Rejected", "StaleEvidence"].includes(status))
    return <XCircle className={`${className} text-destructive`} aria-hidden="true" />;
  if (
    status &&
    [
      "WaitingForPermission",
      "WaitingForUser",
      "WaitingForApproval",
      "AwaitingContinuation",
    ].includes(status)
  )
    return <AlertTriangle className={`${className} text-warning`} aria-hidden="true" />;
  if (status && ["Starting", "Running", "CancelRequested"].includes(status))
    return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
  return <CircleDashed className={`${className} text-foreground-subtle`} aria-hidden="true" />;
}

/**
 * Primary Runs view: the steps the run actually took, in execution order, one row per visit.
 * Repair iterations are labelled; nodes the run never reached are listed apart, not as a sequence.
 */
export function GraphRunTrail({
  run,
  selectedNodeId,
  selectedAttemptId,
  onSelect,
}: {
  run: GraphSequentialRun;
  selectedNodeId?: string;
  selectedAttemptId?: string;
  onSelect(nodeId: string, attemptId?: string): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.${key}` });
  const u = useGraphRunText();
  const trail = useMemo(() => graphRunTrail(run), [run]);
  const active = graphRunIsUnresolved(run);
  const label = (nodeId: string) => {
    const node = run.definition.nodes.find((item) => item.id === nodeId);
    return node ? graphNodeLabel(node, run.definition, t) : nodeId;
  };
  return (
    <div className="space-y-2" data-testid="graph-run-trail" data-iterations={trail.iterations}>
      <ol className="space-y-1" aria-label={u("trail")}>
        {trail.visits.map((visit, index) => {
          const selected =
            visit.nodeId === selectedNodeId &&
            (selectedAttemptId ? visit.attemptId === selectedAttemptId : visit.latest);
          return (
            <li key={`${visit.iteration}:${visit.nodeId}:${index}`}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-ui-sm transition-colors ${
                  selected
                    ? "border-border bg-selected"
                    : "border-transparent hover:bg-surface-hover"
                }`}
                data-testid={
                  visit.latest
                    ? `graph-select-node-${visit.nodeId}`
                    : `graph-trail-step-${visit.iteration}-${visit.nodeId}`
                }
                data-status={visit.status ?? ""}
                data-iteration={visit.iteration}
                aria-current={selected ? "step" : undefined}
                onClick={() => onSelect(visit.nodeId, visit.attemptId)}
              >
                <StepIcon status={visit.status} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{label(visit.nodeId)}</span>
                  {visit.iteration > 0 ? (
                    <span className="ml-2 text-ui-xs text-foreground-subtle">
                      {u("repairIteration", { n: visit.iteration })}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-ui-xs text-foreground-subtle">
                  {active && visit.current ? `${u("currentMark")} · ` : ""}
                  {visit.status && known.has(visit.status)
                    ? u(`stepStatus.${visit.status}`)
                    : (visit.status ?? u("stepStatus.none"))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {trail.notVisited.length ? (
        <div className="space-y-1" data-testid="graph-run-trail-not-visited">
          <p className="text-ui-xs text-foreground-subtle">{u("notVisited")}</p>
          <ul className="flex flex-wrap gap-1">
            {trail.notVisited.map((nodeId) => (
              <li key={nodeId}>
                <button
                  type="button"
                  className={`rounded-md border px-2 py-0.5 text-ui-xs text-foreground-subtle transition-colors ${
                    nodeId === selectedNodeId
                      ? "border-border bg-selected"
                      : "border-transparent hover:bg-surface-hover"
                  }`}
                  data-testid={`graph-select-node-${nodeId}`}
                  aria-current={nodeId === selectedNodeId ? "step" : undefined}
                  onClick={() => onSelect(nodeId)}
                >
                  {label(nodeId)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
