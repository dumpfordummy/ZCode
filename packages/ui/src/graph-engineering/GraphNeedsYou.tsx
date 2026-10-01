import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import type { GraphNeedsYouItem } from "./graphNeedsYouQueue.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import { useGraphM4Text } from "./GraphM4Text.js";
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
  const m4 = useGraphM4Text();
  // 注意力在别处时，条带指向另一个等待的运行；只有等待的全都是当前打开的运行时才退为安静的指路条。
  const first = items.find((item) => item.runId !== currentRunId) ?? items[0];
  if (!first) return null;
  const quiet = first.runId === currentRunId;
  const label = u(`needs.${first.kind}`, { step: first.stepName, run: first.runName });
  if (quiet)
    return (
      <section
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-1.5 text-ui-sm text-foreground-subtle"
        aria-label={u("needsYou")}
        data-testid="graph-needs-you"
        data-run-id={first.runId}
        data-kind={first.kind}
        data-count={items.length}
        data-quiet="true"
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-40 flex-1" role="status">
          {m4("needsYouHere")} {/* 范围说明：这是本主机对本工作区运行的投影，不是全局队列。 */}
          <span data-testid="graph-needs-you-scope">{m1("needsYouScope")}</span>
        </span>
        <Button variant="ghost" data-testid="graph-needs-you-go" onClick={() => onGoToRun(first)}>
          {u("goToRun")}
        </Button>
      </section>
    );
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-ui-sm"
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
        <Button
          variant="default"
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
