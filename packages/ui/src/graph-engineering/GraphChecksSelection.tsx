import type { GraphChecksSelection as ChecksSelection, GraphRecipe } from "@zcode/services";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Button } from "@/components/ui/button.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphSetupField, useGraphSetupText } from "./GraphSetupFields.js";

export function GraphChecksSelection({
  selection,
  recipes,
  disabled,
  onChange,
}: {
  selection: ChecksSelection;
  recipes: GraphRecipe[];
  disabled: boolean;
  onChange(value: ChecksSelection): void;
}) {
  const t = useGraphSetupText();
  if (selection.kind === "dotnet-probe")
    return (
      <div className="space-y-3">
        <p className="text-ui-sm text-foreground-subtle">{t("probeHelp")}</p>
        <GraphSetupField
          name="executable"
          value={selection.executable}
          disabled={disabled}
          testId="graph-dotnet-probe-executable"
          onChange={(value) => onChange({ ...selection, executable: String(value ?? "") })}
        />
        <GraphSetupField
          name="cwd"
          value={selection.cwd}
          disabled={disabled}
          testId="graph-dotnet-probe-cwd"
          onChange={(value) => onChange({ ...selection, cwd: String(value ?? "") })}
        />
        <pre className="break-all whitespace-pre-wrap text-ui-xs font-mono">
          {JSON.stringify([selection.executable, "--version"])}
        </pre>
      </div>
    );
  return (
    <div className="space-y-3" data-testid="graph-check-selection">
      <p className="text-ui-sm text-foreground-subtle">{t("selectionOrder")}</p>
      {recipes.map((recipe) => (
        <div className="space-y-2 text-ui-sm" key={recipe.id}>
          <label className="flex items-center gap-2">
            <Checkbox
              disabled={disabled}
              checked={selection.recipeIds.includes(recipe.id)}
              data-testid={`graph-check-select-${recipe.id}`}
              onCheckedChange={(checked) =>
                onChange({
                  ...selection,
                  recipeIds:
                    checked === true
                      ? [...selection.recipeIds, recipe.id]
                      : selection.recipeIds.filter((id) => id !== recipe.id),
                })
              }
            />
            {recipe.name} · {recipe.verifier.kind}
            {selection.recipeIds.includes(recipe.id)
              ? ` · ${selection.recipeIds.indexOf(recipe.id) + 1}`
              : ""}
          </label>
          {recipe.verifier.kind === "test" && selection.recipeIds.includes(recipe.id) ? (
            <GraphSelect
              label={t("mappedBuild")}
              disabled={disabled}
              testId={`graph-check-build-${recipe.id}`}
              value={
                recipes.some(
                  (item) =>
                    item.id === selection.buildMappings[recipe.id] &&
                    item.verifier.kind === "build" &&
                    selection.recipeIds.includes(item.id),
                )
                  ? (selection.buildMappings[recipe.id] ?? "unbound")
                  : "unbound"
              }
              options={[
                { value: "unbound", label: t("chooseBuild") },
                ...recipes
                  .filter(
                    (item) =>
                      item.verifier.kind === "build" && selection.recipeIds.includes(item.id),
                  )
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(value) =>
                onChange({
                  ...selection,
                  buildMappings: {
                    ...selection.buildMappings,
                    [recipe.id]: value === "unbound" ? "" : value,
                  },
                })
              }
            />
          ) : null}
        </div>
      ))}
      {selection.recipeIds
        .filter((id) => !recipes.some((recipe) => recipe.id === id))
        .map((id) => (
          <div
            key={id}
            className="flex flex-wrap items-center gap-2 text-ui-sm text-warning"
            role="status"
          >
            <span>
              {id} · {t("missingSavedCheck")}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              data-testid={`graph-check-remove-missing-${id}`}
              onClick={() =>
                onChange({
                  ...selection,
                  recipeIds: selection.recipeIds.filter((selected) => selected !== id),
                })
              }
            >
              {t("remove")}
            </Button>
          </div>
        ))}
    </div>
  );
}
