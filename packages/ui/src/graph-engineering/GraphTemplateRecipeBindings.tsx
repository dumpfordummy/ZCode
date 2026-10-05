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
import { GraphSelectedChecks } from "./GraphSelectedChecks.js";
import { GraphWarningNote } from "./GraphWarningNote.js";
import { useGraphM2Text } from "./GraphM2Text.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import type { GraphRecipeChanges } from "./graphRecipeChanges.js";
import { graphCheckSelection } from "./graphCheckSelection.js";
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
  changes = { kind: "clean" },
  onChange,
  onOpenChecks,
}: {
  template: GraphPortableTemplate;
  bindings: GraphTemplateBindings;
  snapshot: GraphRecipeSnapshot | null;
  disabled: boolean;
  /** UX-M2.2: unsaved edits in Checks. Disclosed only; the saved snapshot stays what is shown and used. */
  changes?: GraphRecipeChanges;
  onChange(update: (current: GraphTemplateBindings) => GraphTemplateBindings): void;
  /** Open the existing Checks editor (optionally on one saved check) without leaving the draft. */
  onOpenChecks(checkId?: string): void;
}) {
  const { intl } = useZCodeIntl();
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const t = useGraphSetupText();
  const display = useGraphTemplateText();
  const m2 = useGraphM2Text();
  const m4 = useGraphM4Text();
  const tools = template.graph.nodes.filter((node) => node.type === "tool");
  const steps = graphCheckSelection(template, bindings, snapshot);
  const buildSlots = tools.filter((node) =>
    snapshot?.recipes.some(
      (recipe) => recipe.id === bindings.recipes[node.id] && recipe.verifier.kind === "build",
    ),
  );
  return (
    <>
      {tools.length && changes.kind !== "clean" ? (
        <GraphWarningNote
          role="status"
          className="text-ui-sm"
          data-testid="graph-new-run-unsaved-checks"
          data-kind={changes.kind}
        >
          {m2(changes.kind === "changes" ? "newRunUnsaved" : "newRunUnsavedUnlisted")}
        </GraphWarningNote>
      ) : null}
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
            {/* 已选检查的名称/类型/状态；缺失或不兼容时显示存储的 id 与原因，不替用户改选 */}
            <GraphSelectedChecks
              step={steps.find((item) => item.nodeId === node.id)!}
              label={display.node(node.id, node.name)}
              changes={changes}
              onOpenChecks={onOpenChecks}
            />
            {snapshot?.recipes.length && !choices.length ? (
              <p role="status" className="text-ui-sm text-warning">
                {u("incompatible")}
              </p>
            ) : null}
            {isTest ? (
              <>
                {buildSlots.some((slot) => slot.id === mapped) ? (
                  <p className="text-ui-sm text-foreground-subtle">
                    {m4("quickMapped", {
                      name: buildSlots.find((slot) => slot.id === mapped)!.name,
                    })}
                  </p>
                ) : null}
                <details open={!buildSlots.some((slot) => slot.id === mapped) || undefined}>
                  <summary className="min-h-7 cursor-pointer text-ui-sm">
                    {m4("quickAdvanced")}
                  </summary>
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
                </details>
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
