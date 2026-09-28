import { Button } from "@/components/ui/button.js";
import {
  GraphSetupField,
  GraphSetupList,
  useGraphSetupText,
} from "./GraphSetupFields.js";
import { GraphRecipeVerifierForm } from "./GraphRecipeVerifierForm.js";
import {
  appendGraphRecipes,
  graphRecipeDraft,
  graphRecipeGuidedIssue,
  recipeVerifierKind,
  updateGraphRecipeField,
  type GraphRecipeDraftObject,
} from "./graphRecipeDraftForm.js";

export function GraphRecipeForm({
  text,
  disabled,
  onChange,
  openIndex = 0,
}: {
  text: string;
  disabled: boolean;
  onChange(text: string): void;
  openIndex?: number;
}) {
  const t = useGraphSetupText();
  const parsed = graphRecipeDraft(text);
  // 收集所有 Build 检查供 Test 配方的 buildNodeId 映射选择，避免手填原始 ID。
  // Radix Select 不允许 Select.Item 的 value 为空字符串，需过滤无 ID 的 Build。
  const buildOptions =
    parsed.kind === "ready"
      ? parsed.recipes
          .filter(
            (recipe) =>
              recipeVerifierKind(recipe) === "build" &&
              recipe.id != null &&
              String(recipe.id) !== "",
          )
          .map((recipe) => ({
            value: String(recipe.id),
            label: String(recipe.name ?? recipe.id),
          }))
      : [];
  return (
    <details
      open
      className="space-y-3 text-ui-sm"
      data-testid="graph-recipes-guided"
    >
      <summary className="cursor-pointer">{t("guided")}</summary>
      {parsed.kind === "invalid" ? (
        <p role="status" className="text-warning">
          {t("invalidDraft")}
        </p>
      ) : (
        <>
          {parsed.recipes.map((recipe, index) => {
            const issue = graphRecipeGuidedIssue(recipe);
            return (
              <details
                key={index}
                open={index === openIndex}
                className="space-y-3 rounded-lg border border-border p-3"
                data-testid="graph-guided-recipe"
                data-recipe-id={String(recipe.id ?? "")}
              >
                <summary className="cursor-pointer">
                  {String(recipe.name ?? recipe.id ?? index + 1)}
                </summary>
                {issue ? (
                  <p className="text-warning" role="status">
                    {t("advancedOnly")}
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {["name", "executable", "cwd", "timeoutMs"].map(
                        (field) => (
                          <GraphSetupField
                            key={field}
                            name={field}
                            value={recipe[field]}
                            disabled={disabled}
                            numeric={field === "timeoutMs"}
                            testId={`graph-recipe-field-${index}-${field}`}
                            onChange={(value) =>
                              onChange(
                                updateGraphRecipeField(
                                  text,
                                  index,
                                  [field],
                                  value,
                                ),
                              )
                            }
                          />
                        ),
                      )}
                    </div>
                    {/* 高级字段：配方 ID 供跨检查引用（如测试的 buildNodeId），正常路径无需编辑 */}
                    <details>
                      <summary className="cursor-pointer">
                        {t("advancedFields")}
                      </summary>
                      <GraphSetupField
                        name="id"
                        value={recipe["id"]}
                        disabled={disabled}
                        testId={`graph-recipe-field-${index}-id`}
                        onChange={(value) =>
                          onChange(
                            updateGraphRecipeField(text, index, ["id"], value),
                          )
                        }
                      />
                    </details>
                    {[
                      "args",
                      "sourcePaths",
                      "expectedOutputs",
                      "redactEnvironmentVariables",
                    ].map((field) => (
                      <GraphSetupList
                        key={field}
                        name={field}
                        values={(recipe[field] ?? []) as string[]}
                        disabled={disabled}
                        testId={`graph-recipe-field-${index}-${field}`}
                        max={field === "args" ? 64 : 32}
                        onChange={(value) =>
                          onChange(
                            updateGraphRecipeField(text, index, [field], value),
                          )
                        }
                      />
                    ))}
                    <GraphRecipeVerifierForm
                      index={index}
                      verifier={recipe.verifier as GraphRecipeDraftObject}
                      buildOptions={buildOptions}
                      disabled={disabled}
                      onChange={(path, value) =>
                        onChange(
                          updateGraphRecipeField(text, index, path, value),
                        )
                      }
                    />
                  </>
                )}
              </details>
            );
          })}
          <div className="flex flex-wrap gap-2">
            {(["command", "build", "test"] as const).map((kind) => (
              <Button
                key={kind}
                size="sm"
                variant="outline"
                disabled={disabled || parsed.recipes.length >= 32}
                data-testid={`graph-recipe-add-${kind}`}
                onClick={() => {
                  let next = parsed.recipes.length + 1;
                  while (
                    parsed.recipes.some(
                      (recipe) => recipe.id === `check-${next}`,
                    )
                  )
                    next += 1;
                  onChange(
                    appendGraphRecipes(text, [
                      {
                        id: `check-${next}`,
                        name: t(kind),
                        executable: "dotnet",
                        args: [],
                        cwd: ".",
                        timeoutMs: 120000,
                        sourcePaths: [],
                        expectedOutputs: [],
                        verifier:
                          kind === "test"
                            ? {
                                kind,
                                format: "zcode-json-v1",
                                reportPath: "results.json",
                                minimumTests: 1,
                                requiredTests: [],
                                buildNodeId: "build",
                              }
                            : { kind },
                      },
                    ]),
                  );
                }}
              >
                {t("addCheck")} · {t(kind)}
              </Button>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
