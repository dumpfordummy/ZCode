import { useEffect, useMemo } from "react";
import type { GraphDefinition, GraphNativeSettings, GraphWorkspaceView } from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@/components/ui/button.js";
import { useGraphEngineering, useGraphReadiness } from "@/hooks/useGraphEngineering.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { useGraphConfiguration } from "./GraphConfiguration.js";
import { GraphDesignPanel } from "./GraphDesignPanel.js";
import { GraphEditorNavigation } from "./GraphEditorNavigation.js";
import { GraphEditorSurface } from "./GraphEditorSurface.js";
import {
  graphDefinitionContent,
  reconcileGraphDraft,
  type GraphPanelProps,
} from "./graphEngineeringView.js";
import { graphToolOnlySettings } from "./graphEditing.js";
import { graphAdmission } from "./graphAdmission.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import { GraphDesignOrigin } from "./GraphDesignOrigin.js";
import { GraphLibrary } from "./GraphLibrary.js";
import { GraphContextBar } from "./GraphContextBar.js";
import { GraphNeedsYou } from "./GraphNeedsYou.js";
import { GraphRunsDestination } from "./GraphRunsDestination.js";
import { GraphSetupPanel } from "./GraphSetupPanel.js";
import { graphFocusClass } from "./graphFocus.js";
import { graphNeedsYou } from "./graphNeedsYouQueue.js";
import { graphRunAgainDraft } from "./graphRunAgain.js";
import { useGraphRunActions } from "./useGraphRunActions.js";
import { useGraphRunFocus } from "./useGraphFocusRequest.js";
import { useGraphEditorNavigation } from "./useGraphEditorNavigation.js";

export function GraphEditor({
  workspacePath,
  workspaceIdentity,
  readOnlyReason,
  onOpenConversation,
  graph,
  view,
}: GraphPanelProps & {
  graph: ReturnType<typeof useGraphEngineering>;
  view: GraphWorkspaceView;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  const m1 = useGraphM1Text();
  const config = useGraphConfiguration(workspacePath, workspaceIdentity);
  const { settings } = useSettings();
  const openSettingsTab = useTabStore((state) => state.openSettingsTab);
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const navigation = useGraphEngineeringViewStore((state) => state.selections[workspaceKey]);
  const select = useGraphEngineeringViewStore((state) => state.select);
  const selectRun = useGraphEngineeringViewStore((state) => state.selectRun);
  // 没有已存选择的工作区进入“运行 / 新建运行”，而不是空白设计草稿。
  const destination = navigation?.mode ?? "runs";
  const showingRuns = destination === "runs";
  const showingDesign = destination === "design";
  const showingSetup = destination === "setup";
  const newRunPane = showingRuns && (navigation ? navigation.pane === "new" : true);
  const retainedEditor = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.definition);
  const observeDefinition = useGraphDraftStore((state) => state.observeDefinition);
  const acceptDefinition = useGraphDraftStore((state) => state.acceptDefinition);
  const editor = retainedEditor ?? {
    base: view.definition,
    draft: view.definition,
  };
  const reconciled = reconcileGraphDraft(editor, view.definition);
  useEffect(
    () => observeDefinition(workspaceKey, view.definition),
    [observeDefinition, workspaceKey, view.definition],
  );
  // 上下文栏、新建运行与 Checks 都依赖已保存检查的只读快照；读取是只读的，不执行任何东西。
  useEffect(() => {
    if (graph.recipeReadState.status === "not-loaded") void graph.readRecipes();
  }, [graph.recipeReadState.status, graph.readRecipes]);
  const displayed = reconciled.draft;
  const conflicted = reconciled.base.revision !== view.definition.revision;
  const setDefinition = (draft: GraphDefinition) =>
    useGraphDraftStore.getState().editDefinition(workspaceKey, draft, reconciled.base);
  const dirty = graphDefinitionContent(displayed) !== graphDefinitionContent(view.definition);
  // UX-M1：占用工作区的未解决运行只锁「准入」，不再锁定新建运行表单的编辑。
  const admission = graphAdmission(view.runs);
  const activeRun = admission.blocked
    ? view.runs.find((run) => run.id === admission.runId)
    : undefined;
  const selectedRun =
    showingRuns && !newRunPane ? view.runs.find((run) => run.id === navigation?.runId) : undefined;
  const definition = selectedRun ? selectedRun.definition : displayed;
  const selectedNode =
    definition.nodes.find((node) => node.id === navigation?.nodeId) ??
    definition.nodes.find((node) => node.type === "task") ??
    definition.nodes[0];
  const selection = config.draftConfig.modelSelection;
  const toolOnly =
    displayed.version !== undefined &&
    displayed.version >= 4 &&
    !displayed.nodes.some((node) => node.type === "task");
  const mode = submissionModeSchema.safeParse(config.draftConfig.mode);
  const modelReady =
    toolOnly || (config.modelSelectionRead.state.status === "ready" && Boolean(selection));
  const defaults: GraphNativeSettings | null = toolOnly
    ? graphToolOnlySettings()
    : selection && mode.success
      ? {
          modelSelection: selection,
          mode: mode.data,
          planEnabled: config.draftConfig.planEnabled ?? false,
        }
      : null;
  const disabled = graph.pending || Boolean(readOnlyReason) || view.readOnly === true;
  const readiness = useGraphReadiness(displayed, graph.validate);
  const canRun =
    !disabled &&
    !conflicted &&
    !activeRun &&
    view.availability.available &&
    modelReady &&
    defaults !== null &&
    readiness !== null &&
    readiness.errors.length === 0;
  // 设计表单的编辑锁原因（不含“有运行占用”：占用只锁准入，浏览与预览资料库始终可用）。
  const designLockReason = graph.pending
    ? u("busy")
    : (readOnlyReason ??
      (view.readOnly ? t("readOnlyHost") : conflicted ? t("conflict") : undefined));
  const creationReason = designLockReason ?? (activeRun ? u("existingRun") : undefined);
  const runReason =
    creationReason ??
    (!view.availability.available
      ? view.availability.reason || t("prerequisite")
      : !modelReady || !defaults
        ? t("noModel")
        : !readiness
          ? u("checking")
          : readiness.errors.length
            ? u("designIssues")
            : undefined);
  // 编辑锁（表单不可编辑）：操作进行中、其他 Host 拥有、修订冲突、不可用、没有模型。
  // 有未解决的运行不在其中：那只锁准入（occupiedReason），草稿仍可编辑。
  const draftLockReason = graph.pending
    ? u("busy")
    : (readOnlyReason ??
      (view.readOnly
        ? t("readOnlyHost")
        : conflicted
          ? t("conflict")
          : !view.availability.available
            ? view.availability.reason || t("prerequisite")
            : !modelReady || !defaults
              ? t("noModel")
              : undefined));
  const occupiedReason = admission.blocked ? m1("admissionBlocked") : undefined;
  const showGeneralSettingsButton =
    settings != null && settings.askUserQuestionAutoResolutionEnabled !== false;
  const openSettings = (section: "general" | "modelProvider") => {
    setPendingSettingsSectionIntent(section);
    openSettingsTab();
  };
  const selectNode = (nodeId: string) =>
    select(workspaceKey, { nodeId, attemptId: undefined, regionId: undefined });
  const { confirmation, dismissConfirmation, startRun, handleRun } = useGraphRunActions({
    graph,
    displayed,
    defaults,
    workspaceKey,
    selectRun,
    admission,
  });
  const focusRoot = useGraphRunFocus(workspaceKey, Boolean(selectedRun));
  const go = useGraphEditorNavigation({
    workspaceKey,
    newRunPane,
    checkId: navigation?.checkId,
    dismissConfirmation,
  });
  // Pending human actions come from the complete run list, never from the visible history page.
  const needsYou = useMemo(() => graphNeedsYou(view.runs), [view.runs]);
  const needsYouRunIds = useMemo(() => new Set(needsYou.map((item) => item.runId)), [needsYou]);
  /** Review always happens inline in Runs, whichever destination asked for it. */
  const reviewAndRun = (target: GraphDefinition) => {
    select(workspaceKey, { mode: "runs", pane: "new", returnToWorkflow: false });
    handleRun(target);
  };
  const runAgain = (run: GraphWorkspaceView["runs"][number]) => {
    const seed = graphRunAgainDraft(run);
    if (!seed) return;
    const drafts = useGraphDraftStore.getState();
    drafts.selectLibrary(workspaceKey, seed.selection);
    drafts.setTemplateDraft(workspaceKey, seed.templateKey, seed.form);
    dismissConfirmation();
    select(workspaceKey, { mode: "runs", pane: "new", returnToWorkflow: false });
  };
  return (
    <div
      ref={focusRoot}
      className={`${graphFocusClass} flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3`}
      data-view={selectedRun ? "run" : destination}
    >
      <GraphEditorNavigation
        name={selectedRun ? selectedRun.definition.name : displayed.name}
        destination={destination}
        dirty={dirty}
        conflicted={conflicted}
        runSelected={Boolean(selectedRun)}
        onSelect={go.destination}
      />
      <GraphContextBar
        modelSelection={selection}
        mode={config.draftConfig.mode}
        recipeReadState={graph.recipeReadState}
        onOpenChecks={() => go.destination("setup")}
      />
      <GraphNeedsYou
        items={needsYou}
        onGoToRun={go.goToRun}
        onOpenConversation={(item) => {
          if (item.sessionId) onOpenConversation(workspacePath, item.sessionId, workspaceIdentity);
        }}
      />
      {showingRuns ? (
        <GraphRunsDestination
          view={view}
          graph={graph}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          displayed={displayed}
          definition={definition}
          dirty={dirty}
          disabled={disabled}
          canConfirm={!disabled && !activeRun && !conflicted}
          draftLockReason={draftLockReason}
          occupiedReason={occupiedReason}
          activeRunId={activeRun?.id}
          needsYouRunIds={needsYouRunIds}
          reveal={navigation?.reveal}
          newRunPane={newRunPane}
          selectedRun={selectedRun}
          selectedNodeId={selectedNode?.id}
          regionId={navigation?.regionId}
          attemptId={navigation?.attemptId}
          defaults={defaults}
          confirmation={confirmation}
          onNewRun={go.newRun}
          onSelectRun={go.selectRun}
          onViewRun={go.viewRun}
          onCloseConfirmation={() => dismissConfirmation()}
          onStart={(preflight) =>
            confirmation &&
            !admission.blocked &&
            startRun(confirmation.definition, confirmation.settings, true, preflight)
          }
          onOpenSetup={go.openCheckSetup}
          onReview={reviewAndRun}
          onInstantiated={(saved, continuation) => {
            acceptDefinition(workspaceKey, saved);
            dismissConfirmation();
            void graph.reload();
            if (continuation === "review") reviewAndRun(saved);
            else select(workspaceKey, { mode: "design", returnToWorkflow: false });
          }}
          onSelectNode={selectNode}
          onSelectRegion={(regionId) => select(workspaceKey, { regionId, attemptId: undefined })}
          onSelectAttempt={(attemptId) => select(workspaceKey, { attemptId })}
          onChange={setDefinition}
          onOpenConversation={onOpenConversation}
          onRunAgain={runAgain}
        />
      ) : null}
      {showingDesign ? (
        <>
          <GraphDesignOrigin definition={displayed} />
          <GraphLibrary
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            definition={displayed}
            dirty={dirty}
            disabled={disabled || conflicted}
            disabledReason={designLockReason}
            admissionReason={occupiedReason}
            hostReadOnlyReason={readOnlyReason ?? (view.readOnly ? t("readOnlyHost") : undefined)}
            onViewCurrentRun={activeRun ? () => go.viewRun(activeRun.id) : undefined}
            pending={graph.pending}
            error={graph.error}
            recipeReadState={graph.recipeReadState}
            onLoadRecipes={graph.readRecipes}
            onOpenSetup={go.openCheckSetup}
            onSaveDesign={graph.save}
            onInstantiated={(saved) => {
              acceptDefinition(workspaceKey, saved);
              dismissConfirmation();
              select(workspaceKey, { mode: "design", returnToWorkflow: false });
              void graph.reload();
            }}
          />
          <GraphDesignPanel
            displayed={displayed}
            disabled={disabled}
            dirty={dirty}
            conflicted={conflicted}
            canRun={canRun}
            runReason={runReason}
            pending={graph.pending}
            modelReady={modelReady}
            availability={view.availability}
            showGeneralSettingsButton={showGeneralSettingsButton}
            readinessErrors={readiness?.errors ?? []}
            activeRunId={activeRun?.id}
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            config={config}
            workspaceKey={workspaceKey}
            onChange={setDefinition}
            onSelectNode={selectNode}
            onRun={() => reviewAndRun(displayed)}
            onSave={() => void graph.save(displayed)}
            onOpenSettings={openSettings}
            onReload={() => void graph.reload()}
            onOpenRun={(runId) => selectRun(workspaceKey, runId)}
          />
        </>
      ) : null}
      {/* 新建运行/审阅中的失败显示在主操作旁；其余位置仍用这里的通用提示，避免同一条错误出现两次。 */}
      {graph.error &&
      !(showingRuns && (newRunPane || confirmation)) &&
      // UX-M2.3：检查保存失败已由 Checks 编辑器在“保存检查”旁说明，这里不再重复同一条消息。
      !(showingSetup && graph.errorSource === "checks") ? (
        <p role="alert" className="break-words text-ui-sm text-destructive">
          {graph.error}
        </p>
      ) : null}
      {readOnlyReason || view.readOnly ? (
        <p role="status" className="text-ui-sm text-warning">
          {readOnlyReason ?? t("readOnlyHost")}
        </p>
      ) : null}
      {conflicted && showingDesign ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-ui-sm text-warning">
            {t("conflict")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => acceptDefinition(workspaceKey, view.definition)}
          >
            {t("reloadSaved")}
          </Button>
        </div>
      ) : null}
      {showingDesign || (showingRuns && selectedRun && !confirmation) ? (
        <p className="shrink-0 text-ui-sm text-foreground-subtle">{t("concurrentEdits")}</p>
      ) : null}
      {showingSetup ? (
        <GraphSetupPanel
          graph={graph}
          workspaceKey={workspaceKey}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          disabled={disabled}
          returnToWorkflow={navigation?.returnToWorkflow}
          checkId={navigation?.checkId}
          onReturn={go.returnToDraft}
          onRun={(runId) => selectRun(workspaceKey, runId)}
        />
      ) : null}
      {showingDesign ? (
        <GraphEditorSurface
          definition={definition}
          displayed={displayed}
          showingRuns={false}
          selectedRun={undefined}
          selectedNodeId={selectedNode?.id}
          regionId={navigation?.regionId}
          attemptId={navigation?.attemptId}
          defaults={defaults}
          graph={graph}
          disabled={disabled}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          onSelectNode={selectNode}
          onSelectRegion={(regionId) => select(workspaceKey, { regionId, attemptId: undefined })}
          onSelectAttempt={(attemptId) => select(workspaceKey, { attemptId })}
          onChange={setDefinition}
          onOpenConversation={onOpenConversation}
        />
      ) : null}
    </div>
  );
}
