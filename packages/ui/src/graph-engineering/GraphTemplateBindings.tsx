import { useEffect, useMemo } from "react";
import { Play } from "lucide-react";
import type {
  GraphParameterValue,
  GraphTemplateBindings as TemplateBindings,
  GraphTemplateVersion,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore, type GraphTemplateFormDraft } from "@/store/graphDraftStore.js";
import { GraphTemplateRecipeBindings } from "./GraphTemplateRecipeBindings.js";
import { GraphRecipeReadStatus } from "./GraphRecipeReadStatus.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";
import { initialTemplateParameters, templateBindingErrors } from "./graphWorkflowView.js";
import { GraphReferenceBindings } from "./GraphReferenceBindings.js";
import { useGraphTemplateText } from "./graphTemplateText.js";

const normalizedBindings = (bindings: TemplateBindings): TemplateBindings => ({
  ...bindings,
  sourcePaths: bindings.sourcePaths.map((path) => path.trim()).filter(Boolean),
});

export function GraphTemplateBindings({
  version,
  workspaceKey,
  workspacePath,
  workspaceIdentity,
  templateKey,
  recipeReadState,
  disabled,
  disabledReason,
  onLoadRecipes,
  onOpenSetup,
  allowReview = false,
  onInstantiate,
}: {
  version: GraphTemplateVersion;
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  templateKey: string;
  recipeReadState: GraphRecipeReadState;
  disabled: boolean;
  disabledReason?: string;
  onLoadRecipes(): void;
  onOpenSetup(): void;
  /** "review" = Review and run; "save" = create the workflow only (explicit, no preflight). */
  allowReview?: boolean;
  onInstantiate(
    parameters: Record<string, GraphParameterValue>,
    bindings: TemplateBindings,
    continuation: "review" | "save",
  ): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const template = version.template;
  const display = useGraphTemplateText();
  const initial = useMemo<GraphTemplateFormDraft>(
    () => ({
      parameters: initialTemplateParameters(template),
      bindings: { references: {}, recipes: {}, sourcePaths: [] },
    }),
    [template],
  );
  const retained = useGraphDraftStore(
    (state) => state.workspaces[workspaceKey]?.templates[templateKey],
  );
  const { parameters, bindings } = retained ?? initial;
  const change = (update: (current: GraphTemplateFormDraft) => GraphTemplateFormDraft) => {
    const store = useGraphDraftStore.getState();
    store.setTemplateDraft(
      workspaceKey,
      templateKey,
      update(store.workspaces[workspaceKey]?.templates[templateKey] ?? initial),
    );
  };
  const tools = template.graph.nodes.filter((node) => node.type === "tool");
  const hasTools = tools.length > 0;
  const recipes = recipeReadState.status === "ready" ? recipeReadState.snapshot : null;
  const errors = templateBindingErrors(template, parameters, bindings, recipes);
  const readBlocked = hasTools && recipeReadState.status !== "ready";
  useEffect(() => {
    if (hasTools && recipeReadState.status === "not-loaded") onLoadRecipes();
  }, [hasTools, recipeReadState.status, onLoadRecipes]);
  const fields = [
    ...template.parameters.map((item) => [item.label, `parameter-${item.id}`]),
    ...template.references.map((item) => [item.label, `reference-${item.id}`]),
    ...tools.map((node) => [node.name, `recipe-${node.id}`]),
    ["sourcePaths", "source-paths"],
  ];
  const focusIssue = (label: string) => {
    const id = fields.find(([name]) => name === label)?.[1];
    const field = id ? document.getElementById(`graph-template-field-${id}`) : null;
    const disclosure = field?.closest("details");
    if (disclosure) disclosure.open = true;
    field?.querySelector<HTMLElement>("input,textarea,button")?.focus();
  };
  return (
    <section className="space-y-3" data-testid="graph-template-bindings">
      <p className="rounded-lg bg-surface p-3 text-ui-sm" data-testid="graph-template-verification">
        {u(hasTools ? "configuredChecks" : "agentLed")}
      </p>
      {template.parameters.map((parameter) => (
        <label
          className="block space-y-1 text-ui-sm"
          key={parameter.id}
          id={`graph-template-field-parameter-${parameter.id}`}
        >
          <span>
            {display.parameter(parameter.id, parameter.label)}
            {parameter.required ? " *" : ""}
          </span>
          {parameter.type === "boolean" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                aria-label={parameter.label}
                data-testid={`graph-template-parameter-${parameter.id}`}
                disabled={disabled}
                checked={
                  parameters[parameter.id] === undefined
                    ? "indeterminate"
                    : parameters[parameter.id] === true
                }
                onCheckedChange={(value) =>
                  change((current) => ({
                    ...current,
                    parameters: { ...current.parameters, [parameter.id]: value === true },
                  }))
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
          ) : parameter.type === "string" && parameter.id === "request" ? (
            <Textarea
              rows={4}
              data-testid={`graph-template-parameter-${parameter.id}`}
              disabled={disabled}
              value={String(parameters[parameter.id] ?? "")}
              onChange={(event) =>
                change((current) => ({
                  ...current,
                  parameters: { ...current.parameters, [parameter.id]: event.target.value },
                }))
              }
            />
          ) : (
            <Input
              data-testid={`graph-template-parameter-${parameter.id}`}
              disabled={disabled}
              type={parameter.type === "number" ? "number" : "text"}
              value={parameters[parameter.id] === undefined ? "" : String(parameters[parameter.id])}
              onChange={(event) => {
                const text = event.target.value;
                change((current) => {
                  const next = { ...current.parameters };
                  if (!text) delete next[parameter.id];
                  else next[parameter.id] = parameter.type === "number" ? Number(text) : text;
                  return { ...current, parameters: next };
                });
              }}
            />
          )}
        </label>
      ))}
      <GraphReferenceBindings
        target={{ workspacePath, workspaceIdentity }}
        roles={template.references}
        bindings={bindings}
        disabled={disabled}
        onChange={(bindings) => change((current) => ({ ...current, bindings }))}
      />
      {hasTools ? (
        <div className="space-y-1" data-testid="graph-template-checks-heading">
          <h4 className="text-ui-base font-medium">{u("checksHeading")}</h4>
          <p className="text-ui-sm text-foreground-subtle">{u("savedChecksNotRun")}</p>
        </div>
      ) : null}
      {hasTools ? (
        <GraphRecipeReadStatus
          state={recipeReadState}
          onRead={onLoadRecipes}
          onSetup={onOpenSetup}
        />
      ) : null}
      <GraphTemplateRecipeBindings
        template={template}
        bindings={bindings}
        snapshot={recipes}
        disabled={disabled || readBlocked}
        onChange={(update) =>
          change((current) => ({ ...current, bindings: update(current.bindings) }))
        }
      />
      {template.graph.routing?.region ? (
        <label className="block space-y-1 text-ui-sm" id="graph-template-field-source-paths">
          <span>{t("sourcePaths")}</span>
          <Textarea
            rows={3}
            data-testid="graph-template-source-paths"
            value={bindings.sourcePaths.join("\n")}
            disabled={disabled}
            onChange={(event) =>
              change((current) => ({
                ...current,
                bindings: { ...current.bindings, sourcePaths: event.target.value.split("\n") },
              }))
            }
          />
        </label>
      ) : null}
      <div className="space-y-1 text-ui-sm" data-testid="graph-template-step-preview">
        <p className="font-medium">{u("workflowPreview")}</p>
        <p className="text-foreground-subtle">
          {template.graph.nodes
            .filter((node) => "name" in node)
            .map((node) => ("name" in node ? display.node(node.id, node.name) : ""))
            .join(" → ")}
        </p>
      </div>
      {errors.length ? (
        <div
          className="space-y-1 text-ui-sm text-warning"
          data-testid="graph-template-unresolved"
          role="status"
        >
          <p>{u("correctFields")}</p>
          <div className="flex flex-wrap gap-2">
            {errors.map((error, index) => (
              <Button
                key={`${error}:${index}`}
                variant="ghost"
                size="sm"
                onClick={() => focusIssue(error)}
              >
                {error === "sourcePaths" ? t("sourcePaths") : error}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {disabled || readBlocked ? (
        <p id="graph-template-create-reason" role="status" className="text-ui-sm text-warning">
          {disabled ? disabledReason || u("creationLocked") : u("readChecksFirst")}
        </p>
      ) : null}
      <div
        className={`${allowReview ? "sticky bottom-0 z-10 -mx-3 border-t border-border bg-background px-3 py-2 " : ""}flex flex-wrap items-center gap-2`}
        data-testid="graph-new-run-actions"
      >
        {allowReview ? (
          <Button
            size="lg"
            disabled={disabled || readBlocked || errors.length > 0}
            aria-describedby="graph-template-create-reason"
            data-testid="graph-review-run"
            onClick={() => onInstantiate(parameters, normalizedBindings(bindings), "review")}
          >
            <Play className="size-4" />
            {u("reviewAndRun")}
          </Button>
        ) : null}
        <Button
          size={allowReview ? "sm" : "default"}
          variant={allowReview ? "outline" : "default"}
          disabled={disabled || readBlocked || errors.length > 0}
          aria-describedby="graph-template-create-reason"
          data-testid="graph-library-instantiate"
          onClick={() => onInstantiate(parameters, normalizedBindings(bindings), "save")}
        >
          {u(allowReview ? "saveAsWorkflow" : "createWorkflow")}
        </Button>
      </div>
    </section>
  );
}
