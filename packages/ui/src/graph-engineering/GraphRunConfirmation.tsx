import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox.js";
import { GraphWorkflowProvenance } from "./GraphWorkflowProvenance.js";
import { GraphFailureText } from "./GraphFailureText.js";
import type { GraphRunConfirmationSnapshot, GraphSubmission } from "./graphSubmission.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphRunText } from "./GraphRunText.js";
import { GraphWorkflowSummary } from "./GraphWorkflowSummary.js";

/**
 * Inline run review. It shows the frozen snapshot and keeps the explicit, per-run acknowledgment
 * and Start in a sticky bar so they stay reachable; nothing executes until Start is pressed.
 */
export function GraphRunConfirmation({
  snapshot,
  workspacePath,
  disabled,
  canConfirm,
  onConfirm,
  onClose,
  error,
  errorKind = "start",
}: {
  snapshot: GraphRunConfirmationSnapshot;
  workspacePath: string;
  disabled: boolean;
  canConfirm: boolean;
  onConfirm(preflight?: GraphSubmission["preflight"]): void;
  onClose(): void;
  /** A failed Start, shown in the commit bar next to Start. */
  error?: string;
  /** UX-M2.3: which admission step failed, for the UI-owned framing above the verbatim message. */
  errorKind?: "review" | "start";
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  const u = useGraphRunText();
  // 每次运行都必须重新确认：初始未勾选，组件按快照 key 重建，不继承上一次。
  const [acknowledged, setAcknowledged] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: false }), []);
  const templateReady =
    !snapshot.definition.template || Boolean(snapshot.provenance && acknowledged);
  return (
    <section
      className="flex min-h-0 flex-col gap-3"
      data-testid="graph-run-confirmation"
      aria-labelledby="graph-review-heading"
    >
      <div className="space-y-1">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onClose}>
          <ArrowLeft className="size-4" />
          {t("backToDesign")}
        </Button>
        <h3
          id="graph-review-heading"
          ref={heading}
          tabIndex={-1}
          className="text-ui-lg font-medium outline-none"
        >
          {u("reviewTitle")}
        </h3>
        <p className="text-ui-sm text-foreground-subtle">{t("confirmHelp")}</p>
        <p className="break-all font-mono text-ui-sm" data-testid="graph-review-workspace">
          {workspacePath}
        </p>
      </div>
      <GraphWorkflowSummary definition={snapshot.definition} provenance={snapshot.provenance} />
      {snapshot.provenance ? (
        <GraphWorkflowProvenance provenance={snapshot.provenance} unknownsFirst />
      ) : null}
      <dl className="grid gap-1 text-ui-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        <dt className="text-foreground-subtle">{t("maxRepairIterations")}</dt>
        <dd>{snapshot.definition.routing?.region?.maxRepairIterations ?? 0}</dd>
        <dt className="text-foreground-subtle">{t("maxNodeAdmissions")}</dt>
        <dd>{snapshot.definition.routing?.limits.maxNodeAdmissions}</dd>
        <dt className="text-foreground-subtle">{t("deadlineMs")}</dt>
        <dd>{snapshot.definition.routing?.limits.deadlineMs}</dd>
      </dl>
      <details data-testid="graph-confirmation-definition" className="text-ui-sm">
        <summary className="cursor-pointer">{t("capturedDefinition")}</summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </details>
      <div
        className="sticky -bottom-3 z-10 -mx-3 -mb-3 mt-auto flex flex-wrap items-center gap-3 border-t border-border bg-background px-3 pb-5 pt-2"
        data-testid="graph-review-commit"
      >
        {error ? (
          <GraphFailureText
            testId="graph-run-confirmation-error"
            framing={errorKind === "review" ? "reviewFailed" : "startFailed"}
            message={error}
          />
        ) : null}
        {snapshot.provenance ? (
          <label className="flex min-w-60 flex-1 items-start gap-2 text-ui-sm">
            <Checkbox
              checked={acknowledged}
              disabled={disabled}
              onCheckedChange={(value) => setAcknowledged(value === true)}
              aria-describedby="graph-review-ack-hint"
              data-testid="graph-preflight-ack"
            />
            <span>{intl.formatMessage({ id: "graph.z6.acknowledge" })}</span>
          </label>
        ) : (
          <span className="flex-1" />
        )}
        {snapshot.provenance && !acknowledged ? (
          <span id="graph-review-ack-hint" className="text-ui-sm text-foreground-subtle">
            {u("ackNeeded")}
          </span>
        ) : null}
        <Button
          size="lg"
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
          <Play className="size-4" />
          {u("startRun")}
        </Button>
      </div>
    </section>
  );
}
