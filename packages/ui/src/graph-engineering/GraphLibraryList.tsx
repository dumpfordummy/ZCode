import type { GraphLibraryEntry } from "@zcode/services";
import { useGraphM3Text } from "./GraphM3Text.js";
import { useGraphWorkflowLabel } from "./GraphLibraryPicker.js";

/**
 * UX-M4: the master list of the workflow library. A radio group, so arrow keys, focus and the
 * selected state are native; grouped Yours / Built-in, the kind is always stated in words and an
 * archived workflow says so. Selecting only changes which workflow the detail shows.
 */
export function GraphLibraryList({
  entries,
  selected,
  disabled,
  onSelect,
}: {
  entries: readonly GraphLibraryEntry[];
  selected?: string;
  disabled: boolean;
  onSelect(id: string): void;
}) {
  const m3 = useGraphM3Text();
  const label = useGraphWorkflowLabel();
  const groups = [
    { kind: "yours", title: m3("kindYours"), items: entries.filter((item) => !item.builtin) },
    { kind: "builtin", title: m3("kindBuiltin"), items: entries.filter((item) => item.builtin) },
  ].filter((group) => group.items.length);
  return (
    <fieldset
      className="min-w-0 space-y-4"
      disabled={disabled}
      data-testid="graph-library-list"
    >
      <legend className="sr-only">{m3("sectionWorkflow")}</legend>
      {groups.map((group) => (
        <div key={group.kind} className="space-y-1" data-kind={group.kind}>
          <p className="px-2 text-ui-sm font-medium text-foreground-subtle">{group.title}</p>
          {group.items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border-l-2 border-transparent px-2 py-2 text-ui-base transition-colors hover:bg-surface-hover has-[:checked]:border-brand has-[:checked]:bg-selected has-[:focus-visible]:border-brand has-[:focus-visible]:bg-accent has-[:disabled]:cursor-default"
              data-testid="graph-library-entry-option"
              data-value={item.id}
              data-kind={group.kind}
            >
              <input
                type="radio"
                className="sr-only"
                name="graph-library-entry"
                value={item.id}
                checked={selected === item.id}
                onChange={() => onSelect(item.id)}
              />
              <span className="min-w-0 flex-1 break-words">{label.name(item)}</span>
              {item.archived ? (
                <span className="shrink-0 text-ui-sm text-foreground-subtle">
                  {m3("archivedTag")}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
