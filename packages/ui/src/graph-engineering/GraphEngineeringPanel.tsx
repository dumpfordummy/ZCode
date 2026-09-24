import { useState } from "react";
import type { GraphDefinition, GraphWorkspaceView } from "@zcode/services";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { ArrowLeft, Play, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { setPendingSettingsSectionIntent } from "@/lib/settingsNavigation.js";
import { GraphCanvas } from "./GraphCanvas.js";
import { GraphConfiguration, useGraphConfiguration } from "./GraphConfiguration.js";
import { GraphRunDetails } from "./GraphRunDetails.js";
import { reconcileGraphDraft } from "./graphEngineeringView.js";

interface GraphPanelProps {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string | null;
  remoteTarget?: unknown;
  readOnlyReason?: string;
  onBack: () => void;
  onOpenConversation: (
    workspacePath: string,
    sessionId: string,
    workspaceIdentity?: string,
  ) => void;
}

export default function GraphEngineeringPanel(props: GraphPanelProps) {
  const graph = useGraphEngineering(props);
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  return (
    <main
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
      data-testid="graph-engineering-panel"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3 [app-region:no-drag]">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          <ArrowLeft className="size-4" />
          {t("backToChat")}
        </Button>
        <h2 className="text-ui-base font-medium">{t("title")}</h2>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!graph.local ? (
          <p role="status" className="text-ui-base">
            {t("localOnly")}
          </p>
        ) : !graph.supported ? (
          <p role="status" className="text-ui-base">
            {t("unavailableHost")}
          </p>
        ) : graph.loading ? (
          <p role="status" className="text-ui-base">
            {t("loading")}
          </p>
        ) : graph.view ? (
          <GraphEditor
            key={props.workspaceIdentity?.trim() || props.workspacePath}
            {...props}
            graph={graph}
            view={graph.view}
          />
        ) : (
          <div className="space-y-3">
            <p role="alert" className="text-ui-base text-destructive">
              {graph.error}
            </p>
            <Button variant="outline" onClick={() => void graph.reload()}>
              {t("refresh")}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

function GraphEditor({
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
  const questionSetupRequired = Boolean(
    settings && settings.askUserQuestionAutoResolutionEnabled !== false,
  );
  const openSettingsTab = useTabStore((state) => state.openSettingsTab);
  const [editor, setEditor] = useState({ base: view.definition, draft: view.definition });
  const reconciled = reconcileGraphDraft(editor, view.definition);
  if (reconciled !== editor) setEditor(reconciled);
  const displayed = reconciled.draft;
  const conflicted = reconciled.base.revision !== view.definition.revision;
  const setDefinition = (draft: GraphDefinition) => setEditor((current) => ({ ...current, draft }));
  const dirty = JSON.stringify(displayed) !== JSON.stringify(view.definition);
  const activeRun = view.runs.find(
    (run) => !["Completed", "Failed", "Cancelled"].includes(run.status),
  );
  const selection = config.draftConfig.modelSelection;
  const mode = submissionModeSchema.safeParse(config.draftConfig.mode);
  const modelReady = config.modelSelectionRead.state.status === "ready" && Boolean(selection);
  const disabled = graph.pending || Boolean(readOnlyReason) || view.readOnly === true;
  const canRun =
    !disabled &&
    !conflicted &&
    !activeRun &&
    view.availability.available &&
    modelReady &&
    mode.success &&
    Boolean(displayed.instructions.trim());
  const openSettings = (section: "general" | "modelProvider") => {
    setPendingSettingsSectionIntent(section);
    openSettingsTab();
  };
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <p className="text-ui-sm text-foreground-subtle">{t("scope")}</p>
      <label className="space-y-1 text-ui-sm text-foreground-subtle">
        <span>{t("name")}</span>
        <Input
          aria-label={t("name")}
          data-testid="graph-name"
          value={displayed.name}
          disabled={disabled}
          onChange={(event) => setDefinition({ ...displayed, name: event.target.value })}
        />
      </label>
      <GraphCanvas
        definition={displayed}
        disabled={disabled}
        onChange={(next) => {
          if (!disabled) setDefinition(next);
        }}
      />
      <p className="text-ui-sm text-foreground-subtle">{t("layoutHelp")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <label className="block space-y-1 text-ui-sm text-foreground-subtle">
            <span>{t("taskName")}</span>
            <Input
              aria-label={t("taskName")}
              value={displayed.taskName}
              disabled={disabled}
              onChange={(event) => setDefinition({ ...displayed, taskName: event.target.value })}
            />
          </label>
          <label className="block space-y-1 text-ui-sm text-foreground-subtle">
            <span>{t("instructions")}</span>
            <Textarea
              aria-label={t("instructions")}
              data-testid="graph-instructions"
              rows={6}
              value={displayed.instructions}
              disabled={disabled}
              onChange={(event) =>
                setDefinition({ ...displayed, instructions: event.target.value })
              }
            />
          </label>
        </section>
        <section className="space-y-3">
          <h3 className="text-ui-base font-medium">{t("configuration")}</h3>
          <p className="break-all font-mono text-ui-sm text-foreground-subtle">{workspacePath}</p>
          <GraphConfiguration
            workspacePath={workspacePath}
            workspaceIdentity={workspaceIdentity}
            config={config}
            disabled={disabled}
          />
          <p className="text-ui-sm text-foreground-subtle">{t("sharedConfiguration")}</p>
          {!modelReady ? (
            <div className="space-y-2">
              <p role="status" className="text-ui-sm text-foreground-subtle">
                {t("noModel")}
              </p>
              <Button variant="outline" size="sm" onClick={() => openSettings("modelProvider")}>
                <Settings className="size-4" />
                {t("modelSettings")}
              </Button>
            </div>
          ) : null}
          {!view.availability.available ? (
            <div className="space-y-2">
              <p role="status" className="text-ui-sm text-warning">
                {view.availability.reason || t("prerequisite")}
              </p>
              {questionSetupRequired ? (
                <>
                  <p className="text-ui-sm text-foreground-subtle">{t("prerequisite")}</p>
                  <Button variant="outline" size="sm" onClick={() => openSettings("general")}>
                    {t("generalSettings")}
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => void graph.reload()}>
                {t("refresh")}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
      {readOnlyReason ? (
        <p role="status" className="text-ui-sm text-warning">
          {readOnlyReason}
        </p>
      ) : null}
      {graph.error ? (
        <p role="alert" className="break-words text-ui-sm text-destructive">
          {graph.error}
        </p>
      ) : null}
      {conflicted ? (
        <div className="space-y-2">
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={disabled || !dirty || conflicted}
          data-testid="graph-save"
          onClick={() => void graph.save(displayed)}
        >
          <Save className="size-4" />
          {t("save")}
        </Button>
        <Button
          disabled={!canRun}
          data-testid="graph-run-button"
          onClick={() => {
            if (selection && mode.success)
              void graph.run(
                displayed,
                selection,
                mode.data,
                config.draftConfig.planEnabled ?? false,
              );
          }}
        >
          <Play className="size-4" />
          {t("run")}
        </Button>
        <span role="status" className="text-ui-sm text-foreground-subtle">
          {graph.pending ? t("saving") : dirty ? t("unsaved") : t("saved")}
        </span>
      </div>
      <section className="space-y-3" aria-label={t("runs")}>
        <h3 className="text-ui-base font-medium">{t("runs")}</h3>
        {view.runs.length ? (
          view.runs.map((run) => (
            <GraphRunDetails
              key={run.id}
              run={run}
              disabled={disabled}
              onCancel={(runId) => void graph.cancel(runId)}
              onOpenConversation={onOpenConversation}
            />
          ))
        ) : (
          <p className="text-ui-sm text-foreground-subtle">{t("noRuns")}</p>
        )}
      </section>
    </div>
  );
}
