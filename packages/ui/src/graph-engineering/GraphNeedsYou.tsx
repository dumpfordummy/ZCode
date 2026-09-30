import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import type { GraphNeedsYouItem } from "./graphNeedsYouQueue.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import { useGraphRunText } from "./GraphRunText.js";

/**
 * Links to the exact place a human must act. It never answers a permission or question and never
 * decides an approval; opening a conversation only navigates to the existing native owner.
 */
export function GraphNeedsYou({
  items,
  currentRunId,
  onGoToRun,
  onOpenConversation,
}: {
  items: GraphNeedsYouItem[];
  /** The run whose page is open. Its banner already carries the action, so the strip only locates it. */
  currentRunId?: string;
  onGoToRun(item: GraphNeedsYouItem): void;
  onOpenConversation(item: GraphNeedsYouItem): void;
}) {
  const u = useGraphRunText();
  const m1 = useGraphM1Text();
  const first = items[0];
  if (!first) return null;
  const label = u(`needs.${first.kind}`, { step: first.stepName, run: first.runName });
  const quiet = first.runId === currentRunId;
  return (
    <section
      className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-ui-sm ${
        quiet ? "border-border bg-surface" : "border-warning/40 bg-warning/10"
      }`}
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
      <Button variant="outline" data-testid="graph-needs-you-go" onClick={() => onGoToRun(first)}>
        {u("goToRun")}
      </Button>
      {first.sessionId ? (
        // 横幅里已有主操作时，条带里的同一操作退为普通样式，页面上仍只有一个强调色的“打开会话”。
        <Button
          variant={quiet ? "outline" : "default"}
          data-testid="graph-needs-you-conversation"
          onClick={() => onOpenConversation(first)}
        >
          {u("openConversationNow")}
        </Button>
      ) : null}
      {/* 范围说明：这是本主机对本工作区运行的投影，不是全局队列。 */}
      <p
        className="basis-full text-ui-sm font-normal text-foreground-subtle"
        data-testid="graph-needs-you-scope"
      >
        {m1("needsYouScope")}
      </p>
    </section>
  );
}
