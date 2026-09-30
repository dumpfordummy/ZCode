import type { GraphLibraryEntry } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { libraryKind } from "./graphLibraryView.js";
import { useGraphTemplateText } from "./graphTemplateText.js";

/** UX-M3.1: the label of a workflow everywhere it is chosen: name, Built-in or Yours, and Archived. */
export function useGraphWorkflowLabel() {
  const m3 = useGraphM3Text();
  const display = useGraphTemplateText();
  return {
    kind: (entry: Pick<GraphLibraryEntry, "builtin">) =>
      m3(libraryKind(entry) === "builtin" ? "kindBuiltin" : "kindYours"),
    name: (entry: Pick<GraphLibraryEntry, "id" | "name">) => display.entry(entry.id, entry.name),
  };
}

/** The Workflow section: choose one workflow; the kind is part of every option, not a hidden detail. */
export function GraphLibraryPicker({
  entries,
  entry,
  disabled,
  onSelect,
}: {
  entries: readonly GraphLibraryEntry[];
  entry?: GraphLibraryEntry;
  disabled: boolean;
  onSelect(id: string): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  const label = useGraphWorkflowLabel();
  return (
    <div className="space-y-2">
      <GraphSelect
        label={t("workflow")}
        testId="graph-library-entry"
        value={entry?.id ?? "none"}
        disabled={disabled}
        options={[
          ...(!entry ? [{ value: "none", label: t("chooseWorkflow") }] : []),
          ...entries.map((item) => ({
            value: item.id,
            label: `${label.name(item)} · ${label.kind(item)}${item.archived ? ` · ${m3("archivedTag")}` : ""}`,
          })),
        ]}
        onChange={(id) => id !== "none" && onSelect(id)}
      />
      {entry?.archived ? (
        <p role="status" className="text-ui-sm text-warning">
          {m3("archivedNote")}
        </p>
      ) : null}
    </div>
  );
}
