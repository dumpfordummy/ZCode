import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";
import { GraphTemplateRecipeBindings } from "./GraphTemplateRecipeBindings.js";
import { useGraphRecipeChanges } from "./GraphRecipeChangeSummary.js";
import { GraphRecipeReadStatus } from "./GraphRecipeReadStatus.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";
import { initialTemplateParameters, templateBindingErrors } from "./graphWorkflowView.js";
import { GraphContextSection } from "./GraphContextSection.js";
import { GraphNewRunActions } from "./GraphNewRunActions.js";
import { useGraphTemplateText } from "./graphTemplateText.js";
import { useGraphM1Text } from "./GraphM1Text.js";

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
  admissionReason,
  onViewCurrentRun,
  error,
  errorKind,
  onLoadRecipes,
  onOpenSetup,
  allowReview = false,
  actionsHost,
  onInstantiate,
}: {
  version: GraphTemplateVersion;
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  templateKey: string;
  recipeReadState: GraphRecipeReadState;
  /** The form cannot be edited. */
  disabled: boolean;
  disabledReason?: string;
  /** UX-M1: a run occupies the workspace. The form stays editable; every admission action is refused. */
  admissionReason?: string;
  onViewCurrentRun?(): void;
  /** Failure of the last instantiate/preflight, shown beside the primary action. */
  error?: string;
  /** UX-M2.3: how the New-run bar frames `error`. */
  errorKind?: "review" | "start";
  onLoadRecipes(): void;
  onOpenSetup(checkId?: string): void;
  /** "review" = Review and run; "save" = create the workflow only (explicit, no preflight). */
  allowReview?: boolean;
  /** UX-M4: the library dialog's fixed footer. The one action bar is rendered there instead of after the form. */
  actionsHost?: HTMLElement | null;
  onInstantiate(
    parameters: Record<string, GraphParameterValue>,
    bindings: TemplateBindings,
    continuation: "review" | "save",
  ): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const m1 = useGraphM1Text();
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
  // “供哪些节点使用”显示节点名称（UI 自有标签映射），不改写 role.nodeIds。
  const nodeNames = Object.fromEntries(
    template.graph.nodes.flatMap((node) =>
      "name" in node ? [[node.id, display.node(node.id, node.name)] as const] : [],
    ),
  );
  const tools = template.graph.nodes.filter((node) => node.type === "tool");
  const hasTools = tools.length > 0;
  const recipes = recipeReadState.status === "ready" ? recipeReadState.snapshot : null;
  const errors = templateBindingErrors(template, parameters, bindings, recipes);
  const readBlocked = hasTools && recipeReadState.status !== "ready";
  const recipeChanges = useGraphRecipeChanges(workspaceKey);
  // 准入类动作（Review and run、Save as workflow only）：编辑锁、占用、检查未读、字段未补全时一律拒绝。
  // 处理函数自身也检查，不依赖按钮的禁用样式。
  const occupied = Boolean(admissionReason);
  const actionsBlocked = disabled || occupied || readBlocked || errors.length > 0;
  const blockedReason = disabled
    ? disabledReason || u("creationLocked")
    : occupied
      ? admissionReason
      : readBlocked
        ? u("readChecksFirst")
        : errors.length
          ? m1("fieldsNeedAttention", { count: errors.length })
          : undefined;
  const blockedBy = disabled
    ? "draft-lock"
    : occupied
      ? "run-active"
      : readBlocked
        ? "checks"
        : errors.length
          ? "fields"
          : undefined;
  useEffect(() => {
    if (hasTools && recipeReadState.status === "not-loaded") onLoadRecipes();
  }, [hasTools, recipeReadState.status, onLoadRecipes]);
  // UX-M1.3：从运行或检查编辑器返回草稿时，一次性把焦点交回发起的控件（没有则回到请求输入框）。
  // 表单在库加载后才挂载，所以由这里的挂载副作用消费请求，而不是在导航处用定时器猜时机。
  const root = useRef<HTMLElement>(null);
  const focusRequest = useGraphEngineeringViewStore(
    (state) => state.selections[workspaceKey]?.focus,
  );
  useEffect(() => {
    if (!focusRequest || focusRequest === "run") return;
    const origin =
      typeof focusRequest === "object"
        ? root.current?.querySelector<HTMLElement>(
            `[data-check-id="${CSS.escape(focusRequest.checkId)}"] button`,
          )
        : null;
    (
      origin ??
      root.current?.querySelector<HTMLElement>(
        "#graph-template-field-parameter-request textarea, input",
      )
    )?.focus();
    useGraphEngineeringViewStore.getState().select(workspaceKey, { focus: undefined });
  }, [focusRequest, workspaceKey]);
  // [模板原文标签, 字段 id, 界面显示名]：定位仍按原文标签，显示走已有的模板显示映射（zh-CN 才翻译）。
  const fields: Array<[string, string, string]> = [
    ...template.parameters.map<[string, string, string]>((item) => [
      item.label,
      `parameter-${item.id}`,
      display.parameter(item.id, item.label),
    ]),
    ...template.references.map<[string, string, string]>((item) => [
      item.label,
      `reference-${item.id}`,
      display.reference(item.id, item.label),
    ]),
    ...tools.map<[string, string, string]>((node) => [
      node.name,
      `recipe-${node.id}`,
      display.node(node.id, node.name),
    ]),
    ["sourcePaths", "source-paths", t("sourcePaths")],
  ];
  const issueLabel = (label: string) => fields.find(([name]) => name === label)?.[2] ?? label;
  const focusIssue = (label: string) => {
    const id = fields.find(([name]) => name === label)?.[1];
    const field = id ? document.getElementById(`graph-template-field-${id}`) : null;
    const disclosure = field?.closest("details");
    if (disclosure) disclosure.open = true;
    field?.querySelector<HTMLElement>("input,textarea,button")?.focus();
  };
  const actionBar = (
    <GraphNewRunActions
      allowReview={allowReview}
      blocked={actionsBlocked}
      reason={blockedReason}
      blockedBy={blockedBy}
      onReview={() => onInstantiate(parameters, normalizedBindings(bindings), "review")}
      onSave={() => onInstantiate(parameters, normalizedBindings(bindings), "save")}
      onViewCurrentRun={onViewCurrentRun}
      error={error}
      errorKind={errorKind}
      onGoToFirstField={errors[0] ? () => focusIssue(errors[0]!) : undefined}
    />
  );
  return (
    <section ref={root} className="space-y-5" data-testid="graph-template-bindings">
      {template.parameters.map((parameter) => (
        <label
          className="block space-y-1.5 text-ui-base"
          key={parameter.id}
          id={`graph-template-field-parameter-${parameter.id}`}
        >
          <span className="font-medium">
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
              rows={5}
              className="text-ui-base"
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
      <p className="text-ui-sm text-foreground-subtle" data-testid="graph-template-verification">
        {u(hasTools ? "configuredChecks" : "agentLed")}
      </p>
      <GraphContextSection
        target={{ workspacePath, workspaceIdentity }}
        contextKey={`${workspaceKey}\u0000${templateKey}`}
        roles={template.references}
        bindings={bindings}
        disabled={disabled}
        nodeNames={nodeNames}
        onChange={(update) =>
          change((current) => ({ ...current, bindings: update(current.bindings) }))
        }
      />
      {hasTools ? (
        <div
          className="space-y-1 border-t border-border pt-5"
          data-testid="graph-template-checks-heading"
        >
          <h4 className="text-ui-base font-semibold">{u("checksHeading")}</h4>
        </div>
      ) : null}
      {hasTools ? (
        <GraphRecipeReadStatus
          state={recipeReadState}
          onRead={onLoadRecipes}
          onSetup={() => onOpenSetup()}
        />
      ) : null}
      <GraphTemplateRecipeBindings
        template={template}
        bindings={bindings}
        snapshot={recipes}
        changes={recipeChanges}
        disabled={disabled || readBlocked}
        onOpenChecks={onOpenSetup}
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
      <div
        className="space-y-1.5 border-t border-border pt-5 text-ui-base"
        data-testid="graph-template-step-preview"
      >
        <p className="font-semibold">{u("workflowPreview")}</p>
        <p className="text-foreground-subtle">
          {template.graph.nodes
            .filter((node) => "name" in node)
            .map((node) => ("name" in node ? display.node(node.id, node.name) : ""))
            .join(" → ")}
        </p>
      </div>
      {errors.length ? (
        <div
          className="space-y-1 text-ui-base text-warning"
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
                {issueLabel(error)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {actionsHost ? createPortal(actionBar, actionsHost) : actionBar}
    </section>
  );
}
