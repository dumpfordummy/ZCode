import type { ReactNode } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphRunText } from "./GraphRunText.js";
import type { GraphViewMode } from "@/store/graphEngineeringViewStore.js";

const destinations: GraphViewMode[] = ["runs", "design", "setup"];

/**
 * UX-M4: one header. The workflow name and its saved/frozen state, then a single tab row whose
 * trailing slot carries the next-run context (model, mode, saved checks). The tabs are the same
 * three buttons with `aria-current`; the active one is marked by the accent underline.
 */
export function GraphEditorNavigation({
  name,
  destination,
  dirty,
  conflicted,
  runSelected,
  onSelect,
  context,
}: {
  /** A run (not the new-run form) is on screen: its definition is frozen. */
  runSelected: boolean;
  name: string;
  destination: GraphViewMode;
  dirty: boolean;
  conflicted: boolean;
  onSelect(destination: GraphViewMode): void;
  /** Next-run context, shown at the trailing end of the tab row. */
  context?: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = useGraphRunText();
  const showingRuns = destination === "runs" && runSelected;
  return (
    <nav aria-label={t("title")} className="border-b border-border">
      {!showingRuns ? (
        <p
          className="flex flex-wrap items-baseline gap-x-2 pb-2 text-ui-sm"
          data-testid="graph-workflow-header"
        >
          <span className="text-ui-lg font-semibold">{name}</span>
          <span role="status" className="text-foreground-subtle" data-testid="graph-workflow-state">
            {showingRuns
              ? t("frozenRun")
              : conflicted
                ? t("conflict")
                : dirty
                  ? t("unsaved")
                  : t("saved")}
          </span>
          {!showingRuns && destination !== "runs" ? (
            <span className="text-foreground-subtle">{t("designHelp")}</span>
          ) : null}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="-mb-px flex items-end gap-1">
          {destinations.map((mode) => {
            const active = destination === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`inline-flex h-8 items-center border-b-2 px-3 text-ui-base transition-colors ${
                  active
                    ? "border-brand font-medium text-foreground"
                    : "border-transparent text-foreground-subtle hover:text-foreground"
                }`}
                data-testid={`graph-view-${mode}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect(mode)}
              >
                {u(`nav.${mode === "design" ? "workflows" : mode === "setup" ? "checks" : "runs"}`)}
              </button>
            );
          })}
        </div>
        {!showingRuns ? context : null}
      </div>
    </nav>
  );
}
