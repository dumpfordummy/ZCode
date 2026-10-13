import { Button } from "@/components/ui/button.js";
import { useGraphM4Text } from "./GraphM4Text.js";

export function GraphQuickSave({ reason, onSave }: { reason: string; onSave(run: boolean): void }) {
  const t = useGraphM4Text();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={Boolean(reason)}
          aria-describedby={reason ? "graph-quick-save-reason" : undefined}
          data-testid="graph-quick-save"
          onClick={() => onSave(false)}
        >
          {t("quickSave")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(reason)}
          aria-describedby={reason ? "graph-quick-save-reason" : undefined}
          data-testid="graph-quick-save-run"
          onClick={() => onSave(true)}
        >
          {t("quickSaveRun")}
        </Button>
      </div>
      {reason ? (
        <p id="graph-quick-save-reason" className="text-ui-sm text-foreground-subtle">
          {reason}
        </p>
      ) : null}
    </div>
  );
}
