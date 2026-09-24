import { GraphRunPanel } from "./GraphRunPanel.js";
import { GraphRunHistory } from "./GraphRunHistory.js";
import { useState } from "react";
import type { GraphDefinition, GraphNativeSettings, GraphWorkspaceView } from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { Play, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useGraphEngineering, useGraphReadiness } from "@/hooks/useGraphEngineering.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { GraphCanvas } from "./GraphCanvas.js";
import { GraphConfiguration, useGraphConfiguration } from "./GraphConfiguration.js";
import { GraphNodeInspector } from "./GraphNodeInspector.js";
import {
  graphDefinitionContent,
  reconcileGraphDraft,
  type GraphPanelProps,
} from "./graphEngineeringView.js";
import { graphRunIsUnresolved, graphToolOnlySettings } from "./graphEditing.js";
import { GraphAddNodes } from "./GraphAddNodes.js";
import { GraphProjectRecipes } from "./GraphProjectRecipes.js";

import { GraphRoutingEditor } from "./GraphRoutingEditor.js";
import { GraphRunConfirmation } from "./GraphRunConfirmation.js";
import { LegacyInspector } from "./GraphLegacyInspector.js";
import { GraphLibrary } from "./GraphLibrary.js";
import { GraphNodeNavigation } from "./GraphNodeNavigation.js";
import type { GraphRunConfirmationSnapshot, GraphSubmission } from "./graphSubmission.js";

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
  const config = useGraphConfiguration(workspacePath, workspaceIdentity);
  const { settings } = useSettings();
  const openSettingsTab = useTabStore((state) => state.openSettingsTab);
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const navigation = useGraphEngineeringViewStore((state) => state.selections[workspaceKey]);
  const select = useGraphEngineeringViewStore((state) => state.select);
  const showingRuns = navigation?.mode === "runs";
  const [confirmation, setConfirmation] = useState<GraphRunConfirmationSnapshot | null>(null);
  const [editor, setEditor] = useState({ base: view.definition, draft: view.definition });
  const reconciled = reconcileGraphDraft(editor, view.definition);
  if (reconciled !== editor) setEditor(reconciled);
  const displayed = reconciled.draft;
  const conflicted = reconciled.base.revision !== view.definition.revision;
  const setDefinition = (draft: GraphDefinition) => setEditor((current) => ({ ...current, draft }));
  const dirty = graphDefinitionContent(displayed) !== graphDefinitionContent(view.definition);
  const activeRun = view.runs.find(graphRunIsUnresolved);
  const selectedRun = view.runs.find((run) => run.id === navigation?.runId) ?? view.runs[0];
  const definition = showingRuns && selectedRun ? selectedRun.definition : displayed;
  const selectedNode =
    definition.nodes.find((node) => node.id === navigation?.nodeId) ??
    definition.nodes.find((node) => node.type === "task") ??
    definition.nodes[0];
  const editableNode =
    displayed.version !== undefined
      ? displayed.nodes.find((node) => node.id === selectedNode?.id)
      : undefined;
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
  const openSettings = (section: "general" | "modelProvider") => {
    setPendingSettingsSectionIntent(section);
    openSettingsTab();
  };
  const selectNode = (nodeId: string) =>
    select(workspaceKey, { nodeId, attemptId: undefined, regionId: undefined });
  const startRun = (
    draft: GraphDefinition,
    settings: GraphNativeSettings,
    confirmed = false,
    preflight?: GraphSubmission["preflight"],
  ) =>
    void graph
      .run(
        draft,
        settings.modelSelection,
        settings.mode,
        settings.planEnabled,
        confirmed,
        preflight,
      )
      .then((runId) => {
        if (runId) {
          setConfirmation(null);
          select(workspaceKey, { mode: "runs", runId, attemptId: undefined, regionId: undefined });
        }
      });
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3"
      data-view={showingRuns ? "run" : "design"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={showingRuns ? "ghost" : "secondary"}
          data-testid="graph-view-design"
          onClick={() => select(workspaceKey, { mode: "design" })}
        >
          {t("design")}
        </Button>
        <Button
          size="sm"
          variant={showingRuns ? "secondary" : "ghost"}
          data-testid="graph-view-runs"
          onClick={() => select(workspaceKey, { mode: "runs" })}
        >
          {t("runs")}
        </Button>
        <span className="text-ui-sm text-foreground-subtle">
          {showingRuns ? t("frozenRun") : t("designHelp")}
        </span>
        {!showingRuns ? (
          <GraphLibrary
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            definition={displayed}
            dirty={dirty}
            disabled={disabled || conflicted || Boolean(activeRun)}
            recipes={graph.recipes}
            onLoadRecipes={() => void graph.readRecipes()}
            onInstantiated={(saved) => {
              setEditor({ base: saved, draft: saved });
              setConfirmation(null);
              void graph.reload();
            }}
          />
        ) : null}
      </div>
      {showingRuns ? (
        <GraphRunHistory
          runs={view.runs}
          selectedRunId={selectedRun?.id}
          onSelect={(runId) =>
            select(workspaceKey, { runId, attemptId: undefined, regionId: undefined })
          }
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-40 flex-1"
            aria-label={t("name")}
            data-testid="graph-name"
            value={displayed.name}
            disabled={disabled}
            onChange={(event) => setDefinition({ ...displayed, name: event.target.value })}
          />
          <GraphAddNodes
            definition={displayed}
            disabled={disabled}
            onChange={setDefinition}
            onSelect={selectNode}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !dirty || conflicted}
            data-testid="graph-save"
            onClick={() => void graph.save(displayed)}
          >
            <Save className="size-4" />
            {t("save")}
          </Button>
          <Button
            size="sm"
            disabled={!canRun}
            data-testid="graph-run-button"
            onClick={() => {
              if (!defaults) return;
              if (displayed.version === 5) {
                void graph.prepareRunConfirmation(displayed, defaults).then((snapshot) => {
                  if (snapshot) setConfirmation(snapshot);
                });
              } else startRun(displayed, defaults);
            }}
          >
            <Play className="size-4" />
            {t("run")}
          </Button>
          <span role="status" className="text-ui-sm text-foreground-subtle">
            {graph.pending ? t("saving") : dirty ? t("unsaved") : t("saved")}
          </span>
        </div>
      )}
      {!showingRuns ? (
        <details className="shrink-0 text-ui-sm" data-testid="graph-default-configuration">
          <summary className="cursor-pointer">{t("workspaceDefaults")}</summary>
          <div className="mt-2 space-y-2">
            <GraphConfiguration {...{ workspacePath, workspaceIdentity, config, disabled }} />
            <p className="text-foreground-subtle">{t("sharedConfiguration")}</p>
          </div>
        </details>
      ) : null}
      {!showingRuns && !modelReady ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-ui-sm text-foreground-subtle">{t("noModel")}</p>
          <Button variant="outline" size="sm" onClick={() => openSettings("modelProvider")}>
            <Settings className="size-4" />
            {t("modelSettings")}
          </Button>
        </div>
      ) : null}
      {!showingRuns && !view.availability.available ? (
        <div className="flex flex-wrap items-center gap-2 text-ui-sm">
          <p role="status" className="text-warning">
            {view.availability.reason || t("prerequisite")}
          </p>
          {settings && settings.askUserQuestionAutoResolutionEnabled !== false ? (
            <Button variant="outline" size="sm" onClick={() => openSettings("general")}>
              {t("generalSettings")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void graph.reload()}>
            {t("refresh")}
          </Button>
        </div>
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
      {conflicted && !showingRuns ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-ui-sm text-warning">
            {t("conflict")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditor({ base: view.definition, draft: view.definition })}
          >
            {t("reloadSaved")}
          </Button>
        </div>
      ) : null}
      {!showingRuns && readiness?.errors.length ? (
        <details
          className="max-h-32 shrink-0 overflow-auto text-ui-sm"
          open
          data-testid="graph-readiness-errors"
        >
          <summary className="text-warning">{t("notReady")}</summary>
          <ul className="list-disc pl-5">
            {readiness.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="shrink-0 text-ui-sm text-foreground-subtle">{t("concurrentEdits")}</p>
      {!showingRuns && displayed.version === 5 ? (
        <GraphRoutingEditor definition={displayed} disabled={disabled} onChange={setDefinition} />
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
            startRun(confirmation.definition, confirmation.settings, true, preflight)
          }
        />
      ) : null}
      {!showingRuns ? <GraphProjectRecipes graph={graph} disabled={disabled} /> : null}
      {showingRuns && !selectedRun ? null : (
        // 窄屏纵向堆叠时保留画布、节点控制和检查器的自然高度，避免 flex 压缩后内容重叠。
        <div className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:shrink lg:flex-row">
          <div className="flex min-h-80 min-w-0 shrink-0 flex-col gap-2 lg:flex-1 lg:shrink">
            <div className="h-80 shrink-0 lg:h-auto lg:min-h-80 lg:flex-1 lg:shrink">
              <GraphCanvas
                definition={definition}
                disabled={disabled || showingRuns}
                selectedId={navigation?.regionId ? undefined : selectedNode?.id}
                selectedRegionId={navigation?.regionId}
                selectedAttemptId={navigation?.attemptId}
                run={showingRuns && selectedRun?.version !== undefined ? selectedRun : undefined}
                onSelectRegion={(regionId) =>
                  select(workspaceKey, { regionId, attemptId: undefined })
                }
                onSelect={selectNode}
                onChange={setDefinition}
                attempts={
                  showingRuns && selectedRun?.version !== undefined
                    ? selectedRun.nodeAttempts
                    : undefined
                }
                approvals={
                  showingRuns && selectedRun?.version !== undefined
                    ? selectedRun.approvalAttempts
                    : undefined
                }
                tools={
                  showingRuns && selectedRun?.version !== undefined
                    ? selectedRun.toolAttempts
                    : undefined
                }
              />
            </div>
            <GraphNodeNavigation
              definition={definition}
              selectedNodeId={selectedNode?.id}
              regionId={navigation?.regionId}
              onSelect={selectNode}
              onSelectRegion={(regionId) =>
                select(workspaceKey, { regionId, attemptId: undefined })
              }
            />
            <p className="text-ui-sm text-foreground-subtlest">{t("layoutHelp")}</p>
          </div>
          <aside
            className="w-full shrink-0 space-y-4 border-t border-border p-3 lg:min-h-0 lg:w-80 lg:overflow-auto lg:border-t-0 lg:border-l"
            aria-label={t("inspector")}
          >
            {showingRuns && selectedRun ? (
              <GraphRunPanel
                selectedRun={selectedRun}
                nodeId={selectedNode?.id}
                selectedAttemptId={navigation?.attemptId}
                regionSelected={Boolean(navigation?.regionId)}
                onSelectAttempt={(attemptId) => select(workspaceKey, { attemptId })}
                onOpenConversation={onOpenConversation}
                graph={graph}
                disabled={disabled}
              />
            ) : displayed.version !== undefined && editableNode ? (
              <GraphNodeInspector
                definition={displayed}
                node={editableNode}
                onChange={setDefinition}
                disabled={disabled}
                defaults={defaults}
                workspacePath={workspacePath}
                workspaceIdentity={workspaceIdentity}
                recipes={graph.recipes}
              />
            ) : displayed.version === undefined ? (
              <LegacyInspector
                definition={displayed}
                onChange={setDefinition}
                disabled={disabled}
              />
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
