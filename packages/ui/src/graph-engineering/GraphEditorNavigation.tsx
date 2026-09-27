import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { GraphViewMode } from "@/store/graphEngineeringViewStore.js";

const destinations: GraphViewMode[] = ["workflows", "design", "runs", "setup"];

export function GraphEditorNavigation({
  name,
  destination,
  dirty,
  conflicted,
  onSelect,
}: {
  name: string;
  destination: GraphViewMode;
  dirty: boolean;
  conflicted: boolean;
  onSelect(destination: GraphViewMode): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const showingRuns = destination === "runs";
  return (
    <>
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
            onClick={() => onSelect(mode)}
          >
            {t(mode === "workflows" || mode === "setup" ? `preZ8.${mode}` : mode)}
          </Button>
        ))}
        <span className="text-ui-sm text-foreground-subtle">
          {showingRuns ? t("frozenRun") : t("designHelp")}
        </span>
      </div>
    </>
  );
}
