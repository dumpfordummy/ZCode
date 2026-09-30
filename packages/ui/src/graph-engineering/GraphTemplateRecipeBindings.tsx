import {
  graphRecipeCompatibility,
  type GraphPortableTemplate,
  type GraphRecipeSnapshot,
  type GraphTemplateBindings,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";
import { useGraphTemplateText } from "./graphTemplateText.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import {
  compatibleTemplateRecipes,
  setTemplatePrimaryRecipe,
  toggleTemplateTestRecipe,
} from "./graphWorkflowView.js";

export function GraphTemplateRecipeBindings({
  template,
  bindings,
  snapshot,
  disabled,
  onChange,
}: {
  template: GraphPortableTemplate;
  bindings: GraphTemplateBindings;
  snapshot: GraphRecipeSnapshot | null;
  disabled: boolean;
  onChange(update: (current: GraphTemplateBindings) => GraphTemplateBindings): void;
}) {
  const { intl } = useZCodeIntl();
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const t = useGraphSetupText();
  const display = useGraphTemplateText();
  const tools = template.graph.nodes.filter((node) => node.type === "tool");
  const buildSlots = tools.filter((node) =>
    snapshot?.recipes.some(
      (recipe) => recipe.id === bindings.recipes[node.id] && recipe.verifier.kind === "build",
    ),
  );
  return (
    <>
      {tools.map((node) => {
        const choices = compatibleTemplateRecipes(template, node.id, snapshot, bindings);
        const primary = bindings.recipes[node.id];
        const group = bindings.recipeGroups?.[node.id] ?? (primary ? [primary] : []);
        const stale = Boolean(primary && !choices.some((recipe) => recipe.id === primary));
        const sample = snapshot?.recipes[0];
        const isTest = Boolean(
          sample &&
          graphRecipeCompatibility(template.graph, node.id, sample).requiredKind === "test",
        );
        const selectedRecipe = snapshot?.recipes.find((recipe) => recipe.id === primary);
        const mapped =
          bindings.buildMappings?.[node.id] ||
          (node.verification?.kind === "test"
            ? node.verification.buildNodeId
            : selectedRecipe?.verifier.kind === "test"
              ? selectedRecipe.verifier.buildNodeId
              : "");
        return (
          <div key={node.id} className="space-y-2" id={`graph-template-field-recipe-${node.id}`}>
            <GraphSelect
              label={display.node(node.id, node.name)}
              testId={`graph-template-recipe-${node.id}`}
              disabled={disabled}
              value={stale ? "unbound" : primary || "unbound"}
              options={[
                { value: "unbound", label: u("selectCheck") },
                ...choices.map((recipe) => ({ value: recipe.id, label: recipe.name })),
              ]}
              onChange={(value) =>
                onChange((current) =>
                  setTemplatePrimaryRecipe(current, node.id, value === "unbound" ? "" : value),
                )
              }
            />
            {stale ? (
              <p role="status" className="text-ui-sm text-warning">
                {u("staleSelection")}
              </p>
            ) : null}
            {snapshot?.recipes.length && !choices.length ? (
              <p role="status" className="text-ui-sm text-warning">
                {u("incompatible")}
              </p>
            ) : null}
            {isTest ? (
              <>
                <GraphSelect
                  label={t("mappedBuild")}
                  testId={`graph-template-build-${node.id}`}
                  disabled={disabled}
                  value={buildSlots.some((slot) => slot.id === mapped) ? mapped : "unbound"}
                  options={[
                    { value: "unbound", label: t("chooseBuild") },
                    ...buildSlots
                      .filter((slot) => slot.id !== node.id)
                      .map((slot) => ({ value: slot.id, label: slot.name })),
                  ]}
                  onChange={(value) =>
                    onChange((current) => ({
                      ...current,
                      buildMappings: {
                        ...current.buildMappings,
                        [node.id]: value === "unbound" ? "" : value,
                      },
                    }))
                  }
                />
                <details
                  className="space-y-2 text-ui-sm"
                  data-testid={`graph-template-tests-${node.id}`}
                >
                  <summary className="cursor-pointer">{t("multiTests")}</summary>
                  <p className="text-foreground-subtle">{t("multiHelp")}</p>
                  {choices
                    .filter((recipe) => recipe.id !== primary)
                    .map((recipe) => (
                      <label key={recipe.id} className="flex items-center gap-2">
                        <Checkbox
                          disabled={
                            disabled ||
                            !primary ||
                            (group.length >= 8 && !group.includes(recipe.id))
                          }
                          checked={group.includes(recipe.id)}
                          data-testid={`graph-template-test-${node.id}-${recipe.id}`}
                          onCheckedChange={(value) =>
                            onChange((current) =>
                              toggleTemplateTestRecipe(current, node.id, recipe.id, value === true),
                            )
                          }
                        />
                        {recipe.name} · {recipe.id}
                      </label>
                    ))}
                  {group
                    .filter((id) => id !== primary && !choices.some((recipe) => recipe.id === id))
                    .map((id) => (
                      <div key={id} className="flex items-center gap-2 text-warning">
                        <span>
                          {id} · {u("staleSelection")}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={disabled}
                          onClick={() =>
                            onChange((current) =>
                              toggleTemplateTestRecipe(current, node.id, id, false),
                            )
                          }
                        >
                          {t("remove")}
                        </Button>
                      </div>
                    ))}
                  {group.length > 1 ? (
                    <p data-testid={`graph-template-test-order-${node.id}`} className="break-all">
                      {group.join(" → ")}
                    </p>
                  ) : null}
                </details>
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
