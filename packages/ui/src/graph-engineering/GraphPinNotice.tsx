import { Button } from "@/components/ui/button.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import type { GraphPinStatus } from "./graphHistoricalPin.js";

/**
 * UX-M3.3: the historical version a run used is not what the library offers now. Says so, never
 * substitutes a version on its own, and offers the explicit way forward.
 */
export function GraphPinNotice({
  status,
  onContinue,
}: {
  status: Exclude<GraphPinStatus, { kind: "offered" }>;
  onContinue?(): void;
}) {
  const m3 = useGraphM3Text();
  const offered = status.kind === "version-missing" ? status.offered : undefined;
  const text =
    status.kind === "workflow-missing"
      ? m3("pinWorkflowMissing")
      : status.kind === "content-changed"
        ? m3("pinChanged", { requested: status.requested })
        : offered === undefined
          ? m3("pinNoneOffered", { requested: status.requested })
          : m3("pinNotOffered", { requested: status.requested, offered });
  const continueVersion = status.kind === "content-changed" ? status.requested : offered;
  return (
    <div
      role="status"
      className="space-y-2 rounded-lg border border-border bg-surface p-3 text-ui-sm"
      data-testid="graph-historical-pin"
      data-status={status.kind}
    >
      <p className="font-medium text-warning">{text}</p>
      <p className="text-foreground-subtle">{m3("pinExplain")}</p>
      {onContinue && continueVersion !== undefined ? (
        <Button size="sm" data-testid="graph-historical-pin-continue" onClick={onContinue}>
          {m3("pinContinue", { offered: continueVersion })}
        </Button>
      ) : null}
    </div>
  );
}
