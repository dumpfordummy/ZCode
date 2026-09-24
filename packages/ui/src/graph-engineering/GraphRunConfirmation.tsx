import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox.js";
import { GraphWorkflowProvenance } from "./GraphWorkflowProvenance.js";
import type { GraphRunConfirmationSnapshot, GraphSubmission } from "./graphSubmission.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
export function GraphRunConfirmation({
  snapshot,
  workspacePath,
  disabled,
  canConfirm,
  onConfirm,
  onClose,
}: {
  snapshot: GraphRunConfirmationSnapshot;
  workspacePath: string;
  disabled: boolean;
  canConfirm: boolean;
  onConfirm(preflight?: GraphSubmission["preflight"]): void;
  onClose(): void;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  const [acknowledged, setAcknowledged] = useState(false);
  const templateReady =
    !snapshot.definition.template || Boolean(snapshot.provenance && acknowledged);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto" data-testid="graph-run-confirmation">
        <DialogHeader>
          <DialogTitle>{t("confirmRun")}</DialogTitle>
          <DialogDescription>{t("confirmHelp")}</DialogDescription>
        </DialogHeader>
        <p className="break-all text-ui-sm">{workspacePath}</p>
        {snapshot.provenance ? (
          <>
            <GraphWorkflowProvenance provenance={snapshot.provenance} />
            <label className="flex items-start gap-2 text-ui-sm">
              <Checkbox
                checked={acknowledged}
                disabled={disabled}
                onCheckedChange={(value) => setAcknowledged(value === true)}
                data-testid="graph-preflight-ack"
              />
              {intl.formatMessage({ id: "graph.z6.acknowledge" })}
            </label>
          </>
        ) : null}
        <dl className="grid gap-1 text-ui-sm">
          <dt>{t("maxRepairIterations")}</dt>
          <dd>{snapshot.definition.routing?.region?.maxRepairIterations ?? 0}</dd>
          <dt>{t("maxNodeAdmissions")}</dt>
          <dd>{snapshot.definition.routing?.limits.maxNodeAdmissions}</dd>
          <dt>{t("deadlineMs")}</dt>
          <dd>{snapshot.definition.routing?.limits.deadlineMs}</dd>
        </dl>
        <details data-testid="graph-confirmation-definition">
          <summary>{t("capturedDefinition")}</summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </details>
        <DialogFooter>
          <Button variant="outline" disabled={disabled} onClick={onClose}>
            {t("backToDesign")}
          </Button>
          <Button
            data-testid="graph-confirm-run"
            disabled={disabled || !canConfirm || !templateReady}
            onClick={() =>
              onConfirm(
                snapshot.provenance
                  ? { digest: snapshot.provenance.digest, acknowledgedUnknowns: acknowledged }
                  : undefined,
              )
            }
          >
            {t("confirmRun")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
