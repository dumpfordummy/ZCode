import { useState } from "react";
import type {
  GraphParameterValue,
  GraphTemplateBindings as TemplateBindings,
  GraphTemplateVersion,
  GraphRecipeSnapshot,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";
import { initialTemplateParameters, templateBindingErrors } from "./graphWorkflowView.js";

export function GraphTemplateBindings({
  version,
  recipes,
  disabled,
  dirty,
  onLoadRecipes,
  onInstantiate,
}: {
  version: GraphTemplateVersion;
  recipes: GraphRecipeSnapshot | null;
  disabled: boolean;
  dirty: boolean;
  onLoadRecipes(): void;
  onInstantiate(parameters: Record<string, GraphParameterValue>, bindings: TemplateBindings): void;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const template = version.template;
  const [parameters, setParameters] = useState(() => initialTemplateParameters(template));
  const [bindings, setBindings] = useState<TemplateBindings>({
    references: {},
    recipes: {},
    sourcePaths: [],
  });
  const [replace, setReplace] = useState(false);
  const errors = templateBindingErrors(template, parameters, bindings);
  return (
    <section className="space-y-3" data-testid="graph-template-bindings">
      <p className="text-ui-sm text-foreground-subtle">{t("bindingHelp")}</p>
      {template.parameters.map((parameter) => (
        <label className="block space-y-1 text-ui-sm" key={parameter.id}>
          <span>
            {parameter.label}
            {parameter.required ? " *" : ""}
          </span>
          {parameter.type === "boolean" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                aria-label={parameter.label}
                data-testid={`graph-template-parameter-${parameter.id}`}
                disabled={disabled}
                // 未提供默认值的布尔参数仍需显式选择；不能把未选择误标为已排除。
                checked={
                  parameters[parameter.id] === undefined
                    ? "indeterminate"
                    : parameters[parameter.id] === true
                }
                onCheckedChange={(value) =>
                  setParameters((current) => ({ ...current, [parameter.id]: value === true }))
                }
              />
              <span>
                {parameters[parameter.id] === undefined
                  ? t("unselected")
                  : parameters[parameter.id] === true
                    ? t("included")
                    : t("excluded")}
              </span>
            </div>
          ) : (
            <Input
              data-testid={`graph-template-parameter-${parameter.id}`}
              disabled={disabled}
              type={parameter.type === "number" ? "number" : "text"}
              value={parameters[parameter.id] === undefined ? "" : String(parameters[parameter.id])}
              onChange={(event) => {
                const text = event.target.value;
                setParameters((current) => {
                  const next = { ...current };
                  if (text === "") delete next[parameter.id];
                  else next[parameter.id] = parameter.type === "number" ? Number(text) : text;
                  return next;
                });
              }}
            />
          )}
        </label>
      ))}
      {template.references.map((reference) => (
        <label className="block space-y-1 text-ui-sm" key={reference.id}>
          <span>
            {reference.label}
            {reference.required ? " *" : ""} · {reference.kind}
          </span>
          <Input
            data-testid={`graph-template-reference-${reference.id}`}
            disabled={disabled}
            placeholder={t(reference.kind === "skill" ? "skillId" : "relativePath")}
            value={bindings.references[reference.id] ?? ""}
            onChange={(event) =>
              setBindings((current) => ({
                ...current,
                references: { ...current.references, [reference.id]: event.target.value },
              }))
            }
          />
          <span className="block text-foreground-subtle">
            {t("appliesTo")}: {reference.nodeIds.join(", ")}
          </span>
        </label>
      ))}
      {template.graph.nodes.some((node) => node.type === "tool") ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onLoadRecipes}
          data-testid="graph-template-load-recipes"
        >
          {t("loadRecipes")}
        </Button>
      ) : null}
      {template.graph.nodes
        .filter((node) => node.type === "tool")
        .map((node) => (
          <GraphSelect
            key={node.id}
            label={`${node.name} · ${node.id}`}
            testId={`graph-template-recipe-${node.id}`}
            disabled={disabled}
            value={bindings.recipes[node.id] || "unbound"}
            options={[
              { value: "unbound", label: t("unresolved") },
              ...(recipes?.recipes ?? []).map((recipe) => ({
                value: recipe.id,
                label: `${recipe.name} · ${recipe.id}`,
              })),
            ]}
            onChange={(value) =>
              setBindings((current) => ({
                ...current,
                recipes: { ...current.recipes, [node.id]: value === "unbound" ? "" : value },
              }))
            }
          />
        ))}
      {template.graph.routing?.region ? (
        <label className="block space-y-1 text-ui-sm">
          <span>{t("sourcePaths")}</span>
          <Textarea
            rows={3}
            data-testid="graph-template-source-paths"
            value={bindings.sourcePaths.join("\n")}
            disabled={disabled}
            onChange={(event) =>
              setBindings((current) => ({
                ...current,
                sourcePaths: event.target.value.split("\n"),
              }))
            }
          />
        </label>
      ) : null}
      {dirty ? (
        <label className="flex items-start gap-2 text-ui-sm text-warning">
          <Checkbox
            checked={replace}
            disabled={disabled}
            onCheckedChange={(value) => setReplace(value === true)}
            data-testid="graph-template-replace-draft"
          />
          {t("replaceDirty")}
        </label>
      ) : null}
      {errors.length ? (
        <p
          role="status"
          className="text-ui-sm text-warning"
          data-testid="graph-template-unresolved"
        >
          {t("required")}: {errors.join(", ")}
        </p>
      ) : null}
      <Button
        size="sm"
        disabled={disabled || errors.length > 0 || (dirty && !replace)}
        data-testid="graph-library-instantiate"
        onClick={() =>
          onInstantiate(parameters, {
            ...bindings,
            sourcePaths: bindings.sourcePaths.map((path) => path.trim()).filter(Boolean),
          })
        }
      >
        {t("instantiate")}
      </Button>
    </section>
  );
}
