import type { GraphLibraryEntry, GraphTemplateVersion } from "@zcode/services";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { useGraphWorkflowLabel } from "./GraphLibraryPicker.js";
import type { GraphVersionRow } from "./graphLibraryView.js";

/**
 * UX-M3.1: on New run, which workflow and version the next instance will use, read from the same
 * resolution that instantiates it. A picker appears only when the workflow offers several versions.
 */
export function GraphRunWorkflowVersion({
  entry,
  version,
  rows,
  disabled,
  onSelect,
}: {
  entry: GraphLibraryEntry;
  version: GraphTemplateVersion;
  rows: readonly GraphVersionRow[];
  disabled: boolean;
  onSelect(version: number): void;
}) {
  const m3 = useGraphM3Text();
  const label = useGraphWorkflowLabel();
  return (
    <div className="space-y-2" data-testid="graph-new-run-version">
      <p className="text-ui-sm font-medium" data-testid="graph-new-run-version-line">
        {m3("runWillUse", {
          name: label.name(entry),
          version: version.version,
          kind: label.kind(entry),
        })}
      </p>
      {rows.length > 1 ? (
        <GraphSelect
          label={m3("runVersionLabel")}
          testId="graph-new-run-version-select"
          value={String(version.version)}
          disabled={disabled}
          options={rows.map((row) => ({
            value: String(row.version),
            label: `${m3("versionLabel", { version: row.version })}${row.latest ? ` · ${m3("latest")}` : ""}`,
            disabled: !row.compatible,
          }))}
          onChange={(value) => onSelect(Number(value))}
        />
      ) : null}
    </div>
  );
}
