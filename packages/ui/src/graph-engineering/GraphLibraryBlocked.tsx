import { Button } from "@/components/ui/button.js";
import { useGraphM1Text } from "./GraphM1Text.js";

/**
 * UX-M3.1: one sentence saying which library actions are unavailable and why, with the way to the run
 * that owns the workspace. Buttons that are disabled for this reason point at it with aria-describedby.
 */
export function GraphLibraryBlocked({
  id,
  reason,
  onViewCurrentRun,
}: {
  id: string;
  reason: string;
  onViewCurrentRun?(): void;
}) {
  const m1 = useGraphM1Text();
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-3"
      data-testid="graph-library-blocked"
    >
      <p id={id} role="status" className="min-w-0 flex-1 text-ui-sm text-warning">
        {reason}
      </p>
      {onViewCurrentRun ? (
        <Button
          size="sm"
          variant="outline"
          data-testid="graph-library-view-current-run"
          onClick={onViewCurrentRun}
        >
          {m1("viewCurrentRun")}
        </Button>
      ) : null}
    </div>
  );
}
