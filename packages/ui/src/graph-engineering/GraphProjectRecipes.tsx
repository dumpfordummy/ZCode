import { useEffect, useMemo, useRef, useState } from "react";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { Button } from "@/components/ui/button.js";
import { GraphRecipeJsonDetails } from "./GraphRecipeJsonDetails.js";
import { GraphDisclosure } from "./GraphDisclosure.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { GraphRecipeReadStatus } from "./GraphRecipeReadStatus.js";
import { GraphRecipeForm } from "./GraphRecipeForm.js";
import { GraphRecipeList } from "./GraphRecipeList.js";
import { GraphFailureText } from "./GraphFailureText.js";
import { GraphDotnetPreset } from "./GraphDotnetPreset.js";
import { GraphChecksSetup } from "./GraphChecksSetup.js";
import { GraphQuickDotnet } from "./GraphQuickDotnet.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import { associatedQuickChecks } from "./graphQuickDotnetModel.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { graphAdmission } from "./graphAdmission.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import {
  GraphRecipeChangeSummary,
  GraphRecipeDiscard,
  useGraphRecipeChanges,
} from "./GraphRecipeChangeSummary.js";
import { appendGraphRecipes, graphRecipeDraft } from "./graphRecipeDraftForm.js";

export function GraphProjectRecipes({
  graph,
  workspaceKey,
  disabled,
  workspacePath,
  workspaceIdentity,
  checkId,
  onRun,
}: {
  graph: ReturnType<typeof useGraphEngineering>;
  workspaceKey: string;
  disabled: boolean;
  workspacePath: string;
  workspaceIdentity?: string;
  /** UX-M1.2: the saved check to open on arrival (stable id); navigation only. */
  checkId?: string;
  onRun(runId: string): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  const s = useGraphSetupText();
  const m1 = useGraphM1Text();
  const m4 = useGraphM4Text();
  const [advanced, setAdvanced] = useState(false);
  const [requestedReview, setRequestedReview] = useState<string>();
  const changes = useGraphRecipeChanges(workspaceKey);
  const target = useMemo(
    () => ({
      workspacePath,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
    }),
    [workspacePath, workspaceIdentity],
  );
  const setup = useGraphProjectSetup(target);
  const form = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.recipes);
  const observeRecipes = useGraphDraftStore((state) => state.observeRecipes);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [openIndex, setOpenIndex] = useState(0);
  const [focusOpened, setFocusOpened] = useState(false);
  const arrivedFor = useRef<string | undefined>(undefined);
  const formRef = useRef<HTMLDivElement>(null);
  const readState = graph.recipeReadState;
  const text = form?.text ?? "[]";
  const parsed = graphRecipeDraft(text);
  const currentForm = useRef(form);
  currentForm.current = form;
  const validation = setup.state("validate", text);
  const validated =
    validation.status === "ready" && validation.result.kind === "validation"
      ? validation.result
      : undefined;
  const change = (text: string) => {
    if (form) useGraphDraftStore.getState().setRecipeDraft(workspaceKey, { ...form, text });
    setSaved(false);
  };
  const validate = () =>
    setup.invoke(
      { action: "validate", json: text },
      text,
      () => currentForm.current?.text === text && currentForm.current.digest === form?.digest,
    );
  useEffect(() => {
    if (readState.status === "not-loaded") void graph.readRecipes();
  }, [readState.status, graph.readRecipes]);
  useEffect(() => {
    if (readState.status === "ready") observeRecipes(workspaceKey, readState.snapshot);
  }, [readState, observeRecipes, workspaceKey]);
  // 从新建运行的“编辑检查”进入：按稳定 id 打开那一项检查（找不到则保持默认，不猜测别的检查）。
  useEffect(() => {
    if (!checkId || arrivedFor.current === checkId) return;
    if (readState.status !== "ready" || !form) return;
    arrivedFor.current = checkId;
    const draft = graphRecipeDraft(form.text);
    const index = draft.kind === "ready" ? draft.recipes.findIndex((r) => r.id === checkId) : -1;
    if (index < 0) return;
    setOpenIndex(index);
    setAdvanced(true);
    setFocusOpened(true);
  }, [checkId, readState.status, form]);
  // 目标检查渲染出来后再把焦点移到它的第一个字段（键盘用户从“编辑检查”落到可编辑处）。
  useEffect(() => {
    if (!focusOpened) return;
    const target = formRef.current;
    (target?.querySelector<HTMLElement>("input, textarea, [role='combobox']") ?? target)?.focus();
    target?.scrollIntoView({ block: "start" });
    setFocusOpened(false);
  }, [focusOpened, openIndex]);
  const dirty = Boolean(form && form.text !== form.baseText);
  const checksError = error || (graph.errorSource === "checks" ? graph.error : undefined);
  const conflict = Boolean(form && readState.snapshot && form.digest !== readState.snapshot.digest);
  // 图运行未结束时 Host 拒绝保存检查；这里同样禁用并说明原因（编辑仍可继续，草稿保留）。
  const occupied = graphAdmission(graph.view?.runs ?? []).blocked;
  const saveBlocked =
    disabled ||
    occupied ||
    !form ||
    readState.status !== "ready" ||
    conflict ||
    validation.status === "loading" ||
    !setup.supported;
  return (
    <section className="space-y-4" data-testid="graph-project-recipes">
      {readState.status !== "ready" ? (
        <GraphRecipeReadStatus state={readState} onRead={() => void graph.readRecipes()} />
      ) : null}
      {/* 主视图：已保存检查的紧凑列表，显示名称/类型/配置状态与编辑操作 */}
      {parsed.kind === "ready" && parsed.recipes.length ? (
        <GraphRecipeList
          recipes={parsed.kind === "ready" ? parsed.recipes : []}
          changes={changes}
          onEdit={(index) => {
            setOpenIndex(index);
            setAdvanced(true);
            formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      ) : null}
      <GraphQuickDotnet
        setup={setup}
        text={text}
        disabled={saveBlocked || graph.pending || dirty}
        onSave={async (recipes, run) => {
          if (saveBlocked || !form || dirty) return false;
          setError("");
          setSaved(false);
          const submittedText = text;
          const merged = appendGraphRecipes(text, recipes);
          const result = await setup.invoke(
            { action: "validate", json: merged },
            merged,
            () =>
              currentForm.current?.text === submittedText &&
              currentForm.current.digest === form.digest,
          );
          if (result?.kind !== "validation" || !result.recipes || result.diagnostics.length) {
            if (result?.kind === "validation")
              setError(result.diagnostics.map((item) => item.message).join("\n"));
            return false;
          }
          const snapshot = await graph.saveRecipes(result.recipes, form.digest);
          if (!snapshot) return false;
          useGraphDraftStore.getState().acceptRecipes(workspaceKey, snapshot, submittedText);
          const checks = associatedQuickChecks(recipes);
          if (checks)
            useGraphDraftStore
              .getState()
              .updateSetup(workspaceKey, { checks, checksMode: "recipes" });
          setSaved(true);
          if (run) setRequestedReview(snapshot.digest);
          return true;
        }}
      />
      {saved ? (
        <p role="status" data-testid="graph-quick-saved">
          {m4("quickSaved")}
        </p>
      ) : null}
      {checksError ? (
        <GraphFailureText
          testId="graph-recipes-save-error"
          framing="checksSaveFailed"
          message={checksError}
          className=""
        />
      ) : null}
      <GraphDisclosure
        title={m4("quickAdvanced")}
        testId="graph-checks-advanced"
        defaultOpen={advanced}
        onToggle={setAdvanced}
        className="border-y border-border"
      >
        <p className="text-ui-sm text-foreground-subtle">{u("setupHelp")}</p>
        {readState.status === "ready" ? (
          <GraphRecipeReadStatus state={readState} onRead={() => void graph.readRecipes()} />
        ) : null}
        <div ref={formRef} tabIndex={-1} className="outline-none">
          <GraphRecipeForm
            text={text}
            disabled={disabled || !form}
            onChange={change}
            openIndex={openIndex}
          />
        </div>
        {/* 主路径：未保存、冲突、校验与保存操作始终可见，避免阻塞信息仅藏在 Advanced 下 */}
        {conflict ? (
          <div className="space-y-2">
            <p role="alert" className="text-warning">
              {u("recipeConflict")}
            </p>
            <details>
              <summary className="cursor-pointer">{u("showSavedChecks")}</summary>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
                {JSON.stringify(readState.snapshot?.recipes, null, 2)}
              </pre>
            </details>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || readState.status !== "ready"}
              data-testid="graph-recipes-use-saved"
              onClick={() => {
                if (readState.status === "ready" && form)
                  useGraphDraftStore
                    .getState()
                    .acceptRecipes(workspaceKey, readState.snapshot, form.text);
              }}
            >
              {u("useSavedChecks")}
            </Button>
          </div>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          data-testid="graph-recipes-validate"
          disabled={!form || !setup.supported || validation.status === "loading"}
          onClick={() => void validate()}
        >
          {s("validate")}
        </Button>
        <div
          data-testid="graph-recipes-validation"
          data-state={validation.status}
          className="space-y-1 text-ui-sm"
        >
          {validation.status === "loading" ? <p role="status">{s("validating")}</p> : null}
          {validated?.recipes && !validated.diagnostics.length ? (
            <p role="status">{s("valid")}</p>
          ) : null}
          {validated?.diagnostics.map((issue, index) => (
            <p key={index} className="text-warning" role="alert">
              {issue.path}: {issue.message}
            </p>
          ))}
          {validation.status === "error" ? (
            <p role="alert" className="text-destructive">
              {validation.error}
            </p>
          ) : null}
        </div>
        {/* UX-M2.2：保存前说明它的完整范围（整个清单，含之前保留的编辑）以及下一次运行不使用未保存的编辑 */}
        <GraphRecipeChangeSummary
          id="graph-recipe-changes"
          changes={changes}
          loaded={readState.status === "ready"}
          conflict={conflict}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={saveBlocked}
          aria-describedby={
            [dirty ? "graph-recipe-changes" : "", saveBlocked ? "graph-recipe-save-reason" : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          data-testid="graph-save-recipes"
          onClick={() => {
            // 处理函数自身也拒绝：不依赖按钮的禁用样式（备用控件、脚本同样到不了 Host）。
            if (saveBlocked || !form) return;
            setError("");
            const submittedText = form.text;
            void validate()
              .then(async (result) => {
                if (result?.kind !== "validation" || !result.recipes || result.diagnostics.length)
                  return;
                const snapshot = await graph.saveRecipes(result.recipes, form.digest);
                if (snapshot) {
                  useGraphDraftStore
                    .getState()
                    .acceptRecipes(workspaceKey, snapshot, submittedText);
                  setSaved(true);
                }
              })
              .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
          }}
        >
          {t("saveRecipes")}
        </Button>
        {saveBlocked ? (
          <p id="graph-recipe-save-reason" role="status" className="text-foreground-subtle">
            {disabled
              ? u("creationLocked")
              : occupied
                ? m1("recipeSaveBlockedByRun")
                : u("recipeSaveBlocked")}
          </p>
        ) : null}
        {/* 冲突时沿用原有的冲突处理（“放弃编辑并使用已加载检查”），这里不再提供第二个放弃入口 */}
        {conflict ? null : (
          <GraphRecipeDiscard
            changes={changes}
            loaded={readState.status === "ready"}
            disabled={disabled || !form}
            onDiscard={() => {
              if (readState.status !== "ready" || !form || conflict) return;
              useGraphDraftStore
                .getState()
                .acceptRecipes(workspaceKey, readState.snapshot, form.text);
              if (openIndex >= readState.snapshot.recipes.length) setOpenIndex(0);
              setSaved(false);
            }}
          />
        )}
        {saved ? (
          <p role="status" data-testid="graph-recipes-saved">
            {t("recipesSaved")}
          </p>
        ) : null}
        {/* UX-M2.3：只显示检查保存/校验的失败，先说明仍然成立的事实，再原样显示诊断。
          其他操作的失败由编辑器的通用提示显示；这里不重复，也不冒充检查失败。 */}
        {/* 添加检查：项目元数据扫描与 .NET 预设只用于新增，不占据已保存检查的主视图 */}
        <GraphDotnetPreset
          workspaceKey={workspaceKey}
          setup={setup}
          text={text}
          disabled={disabled || !form}
          onChange={change}
        />
        {/* 高级：原始配方 JSON，默认收起，不暴露在主路径 */}
        <GraphRecipeJsonDetails
          text={text}
          disabled={disabled || !form}
          loading={readState.status === "loading"}
          onChange={change}
          onRead={() => void graph.readRecipes()}
        />
      </GraphDisclosure>
      <GraphChecksSetup
        workspaceKey={workspaceKey}
        workspacePath={workspacePath}
        graph={graph}
        setup={setup}
        snapshot={readState.snapshot}
        text={text}
        clean={Boolean(form && !dirty && !conflict && readState.status === "ready")}
        disabled={disabled}
        onRun={onRun}
        advanced={advanced}
        requestedReview={requestedReview}
        onReviewRequested={() => setRequestedReview(undefined)}
      />
    </section>
  );
}
