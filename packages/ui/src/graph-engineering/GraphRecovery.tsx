import { useState } from "react";
import type { GraphRun } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphRunCanRelease } from "./graphEditing.js";

export function GraphRecovery({
  run,
  disabled,
  onInspect,
  onRelease,
}: {
  run: GraphRun;
  disabled: boolean;
  onInspect: (runId: string) => void;
  onRelease: (runId: string, reason: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  if (run.release)
    return (
      <div className="space-y-2 text-ui-sm" data-testid="graph-release-audit">
        <p className="font-medium">{t("released")}</p>
        <p>{run.release.reason}</p>
        <p>{new Date(run.release.releasedAt).toLocaleString()}</p>
        <p className="text-foreground-subtle">{t("releaseMeaning")}</p>
      </div>
    );
  if (
    [
      "NeedsHuman",
      "BudgetExhausted",
      "NoProgress",
      "Completed",
      "Failed",
      "Cancelled",
      "Rejected",
      "WaitingForApproval",
      "AwaitingContinuation",
      "StaleEvidence",
    ].includes(run.status)
  )
    return null;
  return (
    <section className="space-y-3 border-t border-border pt-3" data-testid="graph-recovery">
      <h3 className="text-ui-base font-medium">{t("recovery")}</h3>
      {["Unknown", "Interrupted", "CancelRequested"].includes(run.status) ? (
        <p className="text-ui-sm text-warning">{t("uncertainHelp")}</p>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        data-testid="graph-reconcile"
        onClick={() => onInspect(run.id)}
      >
        {t("inspectRecovery")}
      </Button>
      {run.recovery ? (
        <>
          <p
            role="status"
            className="break-words text-ui-sm"
            data-testid="graph-recovery-state"
            data-state={run.recovery.state}
          >
            {t(`recoveryState.${run.recovery.state}`)}: {run.recovery.reason}
          </p>
          <details className="text-ui-sm">
            <summary>{t("recoveryEvidence")}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm text-foreground-subtle">
              {JSON.stringify(run.recovery, null, 2)}
            </pre>
          </details>
        </>
      ) : null}
      {graphRunCanRelease(run) ? (
        <>
          <label className="block space-y-1 text-ui-sm">
            <span>{t("releaseReason")}</span>
            <Textarea
              rows={3}
              value={reason}
              disabled={disabled}
              data-testid="graph-release-reason"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-ui-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={disabled}
              data-testid="graph-release-confirm"
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t("releaseConfirm")}</span>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !confirmed || !reason.trim() || reason.length > 2000}
            data-testid="graph-release"
            onClick={() => onRelease(run.id, reason)}
          >
            {t("release")}
          </Button>
        </>
      ) : (
        <p className="text-ui-sm text-foreground-subtle">{t("recoveryBlocked")}</p>
      )}
    </section>
  );
}
