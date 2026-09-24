import { GraphRunHistory } from "./GraphRunHistory.js";
import { useState } from "react";
import type { GraphDefinition, GraphNativeSettings, GraphWorkspaceView } from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { Play, Plus, Save, Settings } from "lucide-react";
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
import { GraphRunDetails } from "./GraphRunDetails.js";
import { GraphRunInspector } from "./GraphRunInspector.js";
import { GraphRecovery } from "./GraphRecovery.js";
import { GraphNodeInspector } from "./GraphNodeInspector.js";
import {
  graphDefinitionContent,
  reconcileGraphDraft,
  type GraphPanelProps,
} from "./graphEngineeringView.js";
import { appendGraphTask, graphRunIsUnresolved, upgradeGraphDefinition } from "./graphEditing.js";

import { LegacyInspector } from "./GraphLegacyInspector.js";

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
    displayed.version === 2
      ? displayed.nodes.find((node) => node.id === selectedNode?.id)
      : undefined;
  const selection = config.draftConfig.modelSelection;
  const mode = submissionModeSchema.safeParse(config.draftConfig.mode);
  const modelReady = config.modelSelectionRead.state.status === "ready" && Boolean(selection);
  const defaults: GraphNativeSettings | null =
    selection && mode.success
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
  const selectNode = (nodeId: string) => select(workspaceKey, { nodeId });
  const nodeLabel = (node: (typeof definition.nodes)[number]) =>
    node.type !== "task"
      ? t(`node.${node.type}`)
      : "name" in node
        ? node.name
        : definition.version !== 2
          ? definition.taskName
          : "";
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
      </div>
      {showingRuns ? (
        <GraphRunHistory
          runs={view.runs}
          selectedRunId={selectedRun?.id}
          onSelect={(runId) => select(workspaceKey, { runId })}
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
          {displayed.version === 2 ? (
            <Button
              variant="outline"
              size="sm"
              disabled={
                disabled || displayed.nodes.filter((node) => node.type === "task").length >= 8
              }
              data-testid="graph-add-task"
              onClick={() => {
                const id = crypto.randomUUID();
                setDefinition(appendGraphTask(displayed, id, t("newTask")));
                selectNode(id);
              }}
            >
              <Plus className="size-4" />
              {t("addTask")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              data-testid="graph-upgrade"
              onClick={() => setDefinition(upgradeGraphDefinition(displayed))}
            >
              {t("upgrade")}
            </Button>
          )}
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
              void graph
                .run(displayed, defaults.modelSelection, defaults.mode, defaults.planEnabled)
                .then((runId) => {
                  if (runId) select(workspaceKey, { mode: "runs", runId });
                });
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
      {showingRuns && !selectedRun ? null : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="flex min-h-80 min-w-0 flex-1 flex-col gap-2">
            <div className="min-h-80 flex-1">
              <GraphCanvas
                definition={definition}
                disabled={disabled || showingRuns}
                selectedId={selectedNode?.id}
                onSelect={selectNode}
                onChange={setDefinition}
                attempts={
                  showingRuns && selectedRun?.version === 2 ? selectedRun.nodeAttempts : undefined
                }
              />
            </div>
            <div
              className="flex max-h-20 shrink-0 flex-wrap gap-1 overflow-auto"
              aria-label={t("selectNode")}
            >
              {definition.nodes.map((node) => (
                <Button
                  key={node.id}
                  size="sm"
                  variant={node.id === selectedNode?.id ? "secondary" : "ghost"}
                  data-testid={`graph-select-node-${node.id}`}
                  onClick={() => selectNode(node.id)}
                >
                  {nodeLabel(node)}
                </Button>
              ))}
            </div>
            <p className="text-ui-sm text-foreground-subtlest">{t("layoutHelp")}</p>
          </div>
          <aside
            className="min-h-0 w-full space-y-4 overflow-auto border-t border-border p-3 lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-l"
            aria-label={t("inspector")}
          >
            {showingRuns && selectedRun ? (
              <>
                <p className="break-all font-mono text-ui-xs text-foreground-subtlest">
                  {selectedRun.id}
                </p>
                <p role="status" className="text-ui-sm">
                  {t(`status.${selectedRun.status}`)}
                </p>
                {selectedRun.version === 2 &&
                selectedRun.message &&
                selectedRun.status !== "Completed" ? (
                  <p className="break-words text-ui-sm text-foreground-subtle">
                    {selectedRun.message}
                  </p>
                ) : null}
                {selectedRun.version === 2 && selectedRun.status === "Completed" ? (
                  <p className="text-ui-sm text-foreground-subtle">{t("completionMeaning")}</p>
                ) : null}
                {graphRunIsUnresolved(selectedRun) &&
                (["Starting", "Running", "WaitingForPermission", "WaitingForUser"].includes(
                  selectedRun.status,
                ) ||
                  selectedRun.recovery?.state === "active") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    data-testid="graph-cancel"
                    onClick={() => void graph.cancel(selectedRun.id)}
                  >
                    {t("cancel")}
                  </Button>
                ) : null}
                {selectedRun.version === 2 ? (
                  <GraphRunInspector
                    run={selectedRun}
                    nodeId={selectedNode?.id}
                    onOpenConversation={onOpenConversation}
                  />
                ) : (
                  <GraphRunDetails
                    run={selectedRun}
                    disabled={disabled}
                    onCancel={(id) => void graph.cancel(id)}
                    onOpenConversation={onOpenConversation}
                  />
                )}
                <GraphRecovery
                  key={selectedRun.id}
                  run={selectedRun}
                  disabled={disabled}
                  onInspect={(id) => void graph.inspectRecovery(id)}
                  onRelease={(id, reason) => void graph.releaseInterrupted(id, reason)}
                />
              </>
            ) : displayed.version === 2 && editableNode ? (
              <GraphNodeInspector
                definition={displayed}
                node={editableNode}
                onChange={setDefinition}
                disabled={disabled}
                defaults={defaults}
                workspacePath={workspacePath}
                workspaceIdentity={workspaceIdentity}
              />
            ) : displayed.version !== 2 ? (
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
