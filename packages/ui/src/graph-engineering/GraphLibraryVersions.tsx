import type { GraphLibraryEntry } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import type { GraphVersionRow } from "./graphLibraryView.js";
import { graphTimestamp } from "./graphTimestamp.js";

/**
 * UX-M3.1: the versions the Host offers for one workflow. Every row is individually selectable
 * (immutable versions), labelled from facts only: Latest when the workflow has several versions,
 * "Used by current design" from the design's stored pin, a date only when one is really recorded.
 */
export function GraphLibraryVersions({
  entry,
  rows,
  selected,
  disabled,
  onSelect,
}: {
  entry: GraphLibraryEntry;
  rows: readonly GraphVersionRow[];
  selected?: number;
  disabled: boolean;
  onSelect(version: number): void;
}) {
  const { locale } = useZCodeIntl();
  const m3 = useGraphM3Text();
  if (!rows.length)
    return (
      <p role="status" className="text-ui-sm text-foreground-subtle">
        {m3("noVersions")}
      </p>
    );
  return (
    <fieldset className="space-y-2" data-testid="graph-library-versions" disabled={disabled}>
      <legend className="sr-only">{m3("versionsGroup")}</legend>
      <p className="text-ui-sm text-foreground-subtle">{m3("versionsHelp")}</p>
      <div className="space-y-1">
        {rows.map((row) => {
          const date = row.createdAt ? graphTimestamp(row.createdAt, locale) : undefined;
          return (
            <label
              key={row.version}
              className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-ui-sm has-[:checked]:bg-accent has-[:focus-visible]:border-brand has-[:focus-visible]:bg-accent has-[:disabled]:cursor-default"
              data-testid="graph-library-version-row"
              data-version={row.version}
              data-latest={row.latest}
              data-used={row.usedByDesign}
            >
              <input
                type="radio"
                name={`graph-library-version-${entry.id}`}
                checked={selected === row.version}
                disabled={!row.compatible}
                onChange={() => onSelect(row.version)}
              />
              <span className="font-medium">{m3("versionLabel", { version: row.version })}</span>
              {row.latest ? (
                <span className="rounded border border-border px-1.5 text-ui-xs">
                  {m3("latest")}
                </span>
              ) : null}
              {row.usedByDesign ? (
                <span className="rounded border border-border px-1.5 text-ui-xs">
                  {m3("usedByDesign")}
                </span>
              ) : null}
              {row.compatible ? null : (
                <span className="text-ui-xs text-warning">{m3("notSupported")}</span>
              )}
              {date ? (
                <span className="text-ui-xs text-foreground-subtle">
                  {m3("createdOn", { date })}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
