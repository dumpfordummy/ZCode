import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphRunText } from "./GraphRunText.js";
import type { GraphViewMode } from "@/store/graphEngineeringViewStore.js";

const destinations: GraphViewMode[] = ["runs", "design", "setup"];

export function GraphEditorNavigation({
  name,
  destination,
  dirty,
  conflicted,
  runSelected,
  onSelect,
}: {
  /** A run (not the new-run form) is on screen: its definition is frozen. */
  runSelected: boolean;
  name: string;
  destination: GraphViewMode;
  dirty: boolean;
  conflicted: boolean;
  onSelect(destination: GraphViewMode): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = useGraphRunText();
  const showingRuns = destination === "runs" && runSelected;
  return (
    <nav aria-label={t("title")} className="space-y-2">
      <p
        className="flex flex-wrap items-center gap-2 text-ui-sm"
        data-testid="graph-workflow-header"
      >
        <span className="font-medium">{name}</span>
        <span role="status" className="text-foreground-subtle" data-testid="graph-workflow-state">
          {showingRuns
            ? t("frozenRun")
            : conflicted
              ? t("conflict")
              : dirty
                ? t("unsaved")
                : t("saved")}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {destinations.map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={destination === mode ? "secondary" : "ghost"}
            data-testid={`graph-view-${mode}`}
            aria-current={destination === mode ? "page" : undefined}
            onClick={() => onSelect(mode)}
          >
            {u(`nav.${mode === "design" ? "workflows" : mode === "setup" ? "checks" : "runs"}`)}
          </Button>
        ))}
        <span className="text-ui-sm text-foreground-subtle">
          {showingRuns ? t("frozenRun") : t("designHelp")}
        </span>
      </div>
    </nav>
  );
}
