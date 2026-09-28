import { GraphRunHistory } from "./GraphRunHistory.js";
import { useEffect } from "react";
import type {
  GraphDefinition,
  GraphNativeSettings,
  GraphWorkspaceView,
} from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { Button } from "@/components/ui/button.js";
import {
  useGraphEngineering,
  useGraphReadiness,
} from "@/hooks/useGraphEngineering.js";
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
import { graphRunIsUnresolved, graphToolOnlySettings } from "./graphEditing.js";
import { GraphRunConfirmation } from "./GraphRunConfirmation.js";
import { GraphLibrary } from "./GraphLibrary.js";
import { GraphSetupPanel } from "./GraphSetupPanel.js";
import { GraphWorkflowSummary } from "./GraphWorkflowSummary.js";
import { graphFocusClass } from "./graphFocus.js";
import { useGraphRunActions } from "./useGraphRunActions.js";

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
  const config = useGraphConfiguration(workspacePath, workspaceIdentity);
  const { settings } = useSettings();
  const openSettingsTab = useTabStore((state) => state.openSettingsTab);
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const navigation = useGraphEngineeringViewStore(
    (state) => state.selections[workspaceKey],
  );
  const select = useGraphEngineeringViewStore((state) => state.select);
  const destination = navigation?.mode ?? "design";
  const showingRuns = destination === "runs";
  const showingDesign = destination === "design";
  const showingWorkflows = destination === "workflows";
  const showingSetup = destination === "setup";
  const retainedEditor = useGraphDraftStore(
    (state) => state.workspaces[workspaceKey]?.definition,
  );
  const observeDefinition = useGraphDraftStore(
    (state) => state.observeDefinition,
  );
  const acceptDefinition = useGraphDraftStore(
    (state) => state.acceptDefinition,
  );
  const editor = retainedEditor ?? {
    base: view.definition,
    draft: view.definition,
  };
  const reconciled = reconcileGraphDraft(editor, view.definition);
  useEffect(
    () => observeDefinition(workspaceKey, view.definition),
    [observeDefinition, workspaceKey, view.definition],
  );
  useEffect(() => {
    if (showingWorkflows && graph.recipeReadState.status === "not-loaded")
      void graph.readRecipes();
  }, [showingWorkflows, graph.recipeReadState.status, graph.readRecipes]);
  const displayed = reconciled.draft;
  const conflicted = reconciled.base.revision !== view.definition.revision;
  const setDefinition = (draft: GraphDefinition) =>
    useGraphDraftStore
      .getState()
      .editDefinition(workspaceKey, draft, reconciled.base);
  const dirty =
    graphDefinitionContent(displayed) !==
    graphDefinitionContent(view.definition);
  const activeRun = view.runs.find(graphRunIsUnresolved);
  const selectedRun =
    view.runs.find((run) => run.id === navigation?.runId) ?? view.runs[0];
  const definition =
    showingRuns && selectedRun ? selectedRun.definition : displayed;
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
    toolOnly ||
    (config.modelSelectionRead.state.status === "ready" && Boolean(selection));
  const defaults: GraphNativeSettings | null = toolOnly
    ? graphToolOnlySettings()
    : selection && mode.success
      ? {
          modelSelection: selection,
          mode: mode.data,
          planEnabled: config.draftConfig.planEnabled ?? false,
        }
      : null;
  const disabled =
    graph.pending || Boolean(readOnlyReason) || view.readOnly === true;
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
  const creationReason = graph.pending
    ? u("busy")
    : (readOnlyReason ??
      (view.readOnly
        ? t("readOnlyHost")
        : conflicted
          ? t("conflict")
          : activeRun
            ? u("existingRun")
            : undefined));
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
  const showGeneralSettingsButton =
    settings != null && settings.askUserQuestionAutoResolutionEnabled !== false;
  const openSettings = (section: "general" | "modelProvider") => {
    setPendingSettingsSectionIntent(section);
    openSettingsTab();
  };
  const selectNode = (nodeId: string) =>
    select(workspaceKey, { nodeId, attemptId: undefined, regionId: undefined });
  const { confirmation, setConfirmation, startRun, handleRun } =
    useGraphRunActions({
      graph,
      displayed,
      defaults,
      workspaceKey,
      select,
    });
  return (
    <div
      className={`${graphFocusClass} flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3`}
      data-view={showingRuns ? "run" : destination}
    >
      <GraphEditorNavigation
        name={
          showingRuns && selectedRun
            ? selectedRun.definition.name
            : displayed.name
        }
        destination={destination}
        dirty={dirty}
        conflicted={conflicted}
        onSelect={(mode) => select(workspaceKey, { mode })}
      />
      {showingDesign || showingWorkflows ? (
        <GraphLibrary
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          definition={displayed}
          dirty={dirty}
          disabled={disabled || conflicted || Boolean(activeRun)}
          inline={showingWorkflows}
          disabledReason={creationReason}
          pending={graph.pending}
          error={graph.error}
          recipeReadState={graph.recipeReadState}
          onLoadRecipes={graph.readRecipes}
          onOpenSetup={() =>
            select(workspaceKey, { mode: "setup", returnToWorkflow: true })
          }
          onSaveDesign={graph.save}
          onInstantiated={(saved) => {
            acceptDefinition(workspaceKey, saved);
            setConfirmation(null);
            select(workspaceKey, { mode: "design", returnToWorkflow: false });
            void graph.reload();
          }}
        />
      ) : null}
      {showingWorkflows ? (
        <GraphWorkflowSummary
          definition={displayed}
          recipeReadState={graph.recipeReadState}
          readinessErrors={readiness?.errors ?? []}
          canRun={canRun}
          runReason={runReason}
          activeRunId={activeRun?.id}
          onEditChecks={() =>
            select(workspaceKey, { mode: "setup", returnToWorkflow: true })
          }
          onOpenRun={(runId) => select(workspaceKey, { mode: "runs", runId })}
          onRun={handleRun}
        />
      ) : null}
      {showingRuns ? (
        <GraphRunHistory
          runs={view.runs}
          selectedRunId={selectedRun?.id}
          onSelect={(runId) =>
            select(workspaceKey, {
              runId,
              attemptId: undefined,
              regionId: undefined,
            })
          }
        />
      ) : null}
      {showingDesign ? (
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
          onRun={handleRun}
          onSave={() => void graph.save(displayed)}
          onOpenSettings={openSettings}
          onReload={() => void graph.reload()}
          onOpenRun={(runId) => select(workspaceKey, { mode: "runs", runId })}
        />
      ) : null}
      {graph.error ? (
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
      {showingDesign || showingRuns ? (
        <p className="shrink-0 text-ui-sm text-foreground-subtle">
          {t("concurrentEdits")}
        </p>
      ) : null}
      {confirmation ? (
        <GraphRunConfirmation
          key={`${confirmation.definition.revision}:${confirmation.provenance?.digest ?? "graph"}`}
          snapshot={confirmation}
          workspacePath={workspacePath}
          disabled={graph.pending}
          canConfirm={!disabled && !activeRun && !conflicted}
          onClose={() => setConfirmation(null)}
          onConfirm={(preflight) =>
            startRun(
              confirmation.definition,
              confirmation.settings,
              true,
              preflight,
            )
          }
        />
      ) : null}
      {showingSetup ? (
        <GraphSetupPanel
          graph={graph}
          workspaceKey={workspaceKey}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          disabled={disabled}
          returnToWorkflow={navigation?.returnToWorkflow}
          onReturn={() =>
            select(workspaceKey, {
              mode: "workflows",
              returnToWorkflow: false,
            })
          }
          onRun={(runId) =>
            select(workspaceKey, {
              mode: "runs",
              runId,
              attemptId: undefined,
              regionId: undefined,
            })
          }
        />
      ) : null}
      {showingRuns &&
      selectedRun?.version !== undefined &&
      !selectedRun.definition.nodes.some((node) => node.type === "tool") ? (
        <p
          className="text-ui-sm text-foreground-subtle"
          data-testid="graph-run-verification"
        >
          {u("agentLed")}
        </p>
      ) : null}
      {(!showingDesign && !showingRuns) ||
      (showingRuns && !selectedRun) ? null : (
        <GraphEditorSurface
          definition={definition}
          displayed={displayed}
          showingRuns={showingRuns}
          selectedRun={selectedRun}
          selectedNodeId={selectedNode?.id}
          regionId={navigation?.regionId}
          attemptId={navigation?.attemptId}
          defaults={defaults}
          graph={graph}
          disabled={disabled}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          onSelectNode={selectNode}
          onSelectRegion={(regionId) =>
            select(workspaceKey, { regionId, attemptId: undefined })
          }
          onSelectAttempt={(attemptId) => select(workspaceKey, { attemptId })}
          onChange={setDefinition}
          onOpenConversation={onOpenConversation}
        />
      )}
    </div>
  );
}
