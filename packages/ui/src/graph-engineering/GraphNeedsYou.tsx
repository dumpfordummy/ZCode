import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import type { GraphNeedsYouItem } from "./graphNeedsYouQueue.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * Links to the exact place a human must act. It never answers a permission or question and never
 * decides an approval; opening a conversation only navigates to the existing native owner.
 */
export function GraphNeedsYou({
  items,
  onGoToRun,
  onOpenConversation,
}: {
  items: GraphNeedsYouItem[];
  onGoToRun(item: GraphNeedsYouItem): void;
  onOpenConversation(item: GraphNeedsYouItem): void;
}) {
  const u = useGraphRunText();
  const first = items[0];
  if (!first) return null;
  const label = u(`needs.${first.kind}`, { step: first.stepName, run: first.runName });
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-ui-sm"
      aria-label={u("needsYou")}
      data-testid="graph-needs-you"
      data-run-id={first.runId}
      data-kind={first.kind}
      data-count={items.length}
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-40 flex-1 font-medium" role="status">
        {label}
        {items.length > 1 ? ` · ${u("needsMore", { count: items.length - 1 })}` : ""}
      </span>
      <Button
        size="sm"
        variant="outline"
        data-testid="graph-needs-you-go"
        onClick={() => onGoToRun(first)}
      >
        {u("goToRun")}
      </Button>
      {first.sessionId ? (
        <Button
          size="sm"
          data-testid="graph-needs-you-conversation"
          onClick={() => onOpenConversation(first)}
        >
          {u("openConversationNow")}
        </Button>
      ) : null}
    </section>
  );
}
