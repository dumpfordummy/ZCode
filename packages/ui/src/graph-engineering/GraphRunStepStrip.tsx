import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { GraphSequentialRun } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphNodeLabel, graphRunIsUnresolved } from "./graphEditing.js";
import { graphRunTrail } from "./graphRunTrailModel.js";
import { useGraphRunText } from "./GraphRunText.js";

function StripIcon({ status }: { status?: string }) {
  const className = "size-4 shrink-0";
  if (status && ["Completed", "Approved", "Evaluated"].includes(status))
    return <CheckCircle2 className={`${className} text-success`} aria-hidden="true" />;
  if (status && ["Failed", "Rejected", "StaleEvidence"].includes(status))
    return <XCircle className={`${className} text-destructive`} aria-hidden="true" />;
  if (
    status &&
    ["WaitingForPermission", "WaitingForUser", "WaitingForApproval", "AwaitingContinuation"].includes(
      status,
    )
  )
    return <AlertTriangle className={`${className} text-warning`} aria-hidden="true" />;
  if (status && ["Starting", "Running", "CancelRequested"].includes(status))
    return <Loader2 className={`${className} animate-spin text-brand`} aria-hidden="true" />;
  return <CircleDashed className={`${className} text-foreground-subtle`} aria-hidden="true" />;
}

/**
 * UX-M4: a one-line orientation strip built from the steps the run actually visited, in the
 * order it visited them (the same model as the Steps tab). It is never a fixed sequence: a branch
 * or a repair loop shows as what happened, and the strip wraps for long graphs. Each entry opens
 * that step in the Steps tab.
 */
export function GraphRunStepStrip({
  run,
  onSelect,
}: {
  run: GraphSequentialRun;
  onSelect(nodeId: string, attemptId?: string): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.${key}` });
  const u = useGraphRunText();
  const trail = useMemo(() => graphRunTrail(run), [run]);
  const active = graphRunIsUnresolved(run);
  if (!trail.visits.length) return null;
  const label = (nodeId: string) => {
    const node = run.definition.nodes.find((item) => item.id === nodeId);
    return node ? graphNodeLabel(node, run.definition, t) : nodeId;
  };
  return (
    <ol
      className="flex flex-wrap items-center gap-x-1 gap-y-1"
      aria-label={u("trail")}
      data-testid="graph-run-step-strip"
    >
      {trail.visits.map((visit, index) => (
        <li key={`${visit.iteration}:${visit.nodeId}:${index}`} className="flex items-center gap-1">
          {index > 0 ? (
            <span className="text-foreground-subtlest" aria-hidden="true">
              ›
            </span>
          ) : null}
          <button
            type="button"
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-sm transition-colors hover:bg-surface-hover ${
              active && visit.current ? "bg-selected font-medium" : ""
            }`}
            data-testid="graph-strip-step"
            data-node-id={visit.nodeId}
            data-status={visit.status ?? ""}
            data-current={active && visit.current ? "true" : undefined}
            aria-current={active && visit.current ? "step" : undefined}
            onClick={() => onSelect(visit.nodeId, visit.attemptId)}
          >
            <StripIcon status={visit.status} />
            {label(visit.nodeId)}
            {visit.iteration > 0 ? (
              <span className="text-foreground-subtle">
                {u("repairIteration", { n: visit.iteration })}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ol>
  );
}
