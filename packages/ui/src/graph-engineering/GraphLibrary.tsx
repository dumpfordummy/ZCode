import { useEffect, useMemo, useState } from "react";
import type { GraphDefinition, GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.js";
import { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { useGraphTemplateText } from "./graphTemplateText.js";
import { GraphTemplateBindings } from "./GraphTemplateBindings.js";
import { GraphLibraryAdvanced } from "./GraphLibraryAdvanced.js";
import { GraphLibraryBlocked } from "./GraphLibraryBlocked.js";
import { GraphLibraryManage } from "./GraphLibraryManage.js";
import { GraphLibraryPicker } from "./GraphLibraryPicker.js";
import { GraphLibraryReplace } from "./GraphLibraryReplace.js";
import { useGraphLibraryReplacement } from "./useGraphLibraryReplacement.js";
import { useGraphLibrarySelection } from "./useGraphLibrarySelection.js";
import { GraphCarryReport } from "./GraphCarryReport.js";
import { GraphPinNotice } from "./GraphPinNotice.js";
import { GraphRunWorkflowVersion } from "./GraphRunWorkflowVersion.js";
import { GraphLibrarySection } from "./GraphLibrarySections.js";
import { GraphLibraryVersions } from "./GraphLibraryVersions.js";
import { GraphShare } from "./GraphShare.js";
import { GraphShareImport } from "./GraphShareImport.js";
import type { GraphMutationResult } from "./graphLibrarySave.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { designPin, libraryGates, versionRows } from "./graphLibraryView.js";
import { latestCompatibleTemplateVersion } from "./graphWorkflowView.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";

export function GraphLibrary({
  workspacePath,
  workspaceIdentity,
  definition,
  dirty,
  disabled,
  disabledReason,
  admissionReason,
  hostReadOnlyReason,
  onViewCurrentRun,
  onOpenInRuns,
  pending = false,
  error,
  errorKind,
  designError,
  recipeReadState,
  inline = false,
  onLoadRecipes,
  onOpenSetup,
  onSaveDesign,
  onInstantiated,
  onReview,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  definition: GraphDefinition;
  dirty: boolean;
  /** The design form cannot be edited (busy, read-only Host, design conflict, no model). Browsing stays available. */
  disabled: boolean;
  disabledReason?: string;
  /** UX-M1: a run occupies the workspace. The form stays editable; instantiate/save/review and every library mutation are refused. */
  admissionReason?: string;
  /** UX-M3.1: another Host owns the workspace; browsing is fine, library mutations are refused. */
  hostReadOnlyReason?: string;
  onViewCurrentRun?(): void;
  /** UX-M3.3: open Runs -> New run with the selected workflow and version. Never reviews or starts. */
  onOpenInRuns?(): void;
  pending?: boolean;
  error?: string | null;
  /** UX-M2.3: how the New-run bar frames `error` (inline only). An instantiate failure is a review failure. */
  errorKind?: "review" | "start";
  /** UX-M2.3 (inline): a failed design save, shown in the replace dialog that caused it. */
  designError?: string | null;
  recipeReadState: GraphRecipeReadState;
  inline?: boolean;
  onLoadRecipes(): void;
  onOpenSetup(checkId?: string): void;
  onSaveDesign(definition: GraphDefinition): Promise<GraphDefinition | undefined>;
  onInstantiated(definition: GraphSequentialDefinition, continuation: "review" | "save"): void;
  /** Called with the unchanged saved design when Review and run needs no new instantiation. */
  onReview?(definition: GraphDefinition): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const u = (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.preZ8.${key}` }, values);
  const m3 = useGraphM3Text();
  const target = useMemo(
    () => ({ workspacePath, ...(workspaceIdentity ? { workspaceIdentity } : {}) }),
    [workspacePath, workspaceIdentity],
  );
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const display = useGraphTemplateText();
  const workflow = useGraphWorkflow(target);
  const choose = useGraphDraftStore((state) => state.selectLibrary);
  const [open, setOpen] = useState(false);
  // UX-M3.2：最近一次创建/新版本/复制的结果，来自服务返回的列表；用户改选后清除。
  const [saved, setSaved] = useState<GraphMutationResult | "unknown" | null>(null);
  const entries = workflow.view?.entries ?? [];
  const { entry, version, status, carryReport, continueWithOffered, dismissCarryReport } =
    useGraphLibrarySelection(entries, Boolean(workflow.view), workspaceKey);
  useEffect(() => {
    if (inline) void workflow.read();
  }, [inline, workflow.read]);
  const locked = disabled || workflow.pending;
  // 表单编辑只受 locked 限制；创建/替换/审阅这类准入动作还受占用限制。
  const actionsLocked = locked || Boolean(admissionReason);
  // UX-M3.1：浏览与预览始终可用；库的所有修改在占用、只读 Host 或忙碌时被拒绝并说明原因。
  const gates = libraryGates({
    occupiedReason: admissionReason ? m3("blockedBrowse") : undefined,
    hostReadOnlyReason,
    busyReason: workflow.pending ? u("busy") : undefined,
    exportOccupiedReason: m3("blockedExport"),
  });
  const blockedId = "graph-library-blocked-reason";
  const { replacement, setReplacement, replacementError, apply, requestInstantiate } =
    useGraphLibraryReplacement({
      workspaceKey,
      definition,
      dirty,
      entry,
      version,
      actionsLocked,
      workflow,
      onSaveDesign,
      onInstantiated,
      onReview,
      onDone: () => setOpen(false),
    });
  const operationPending = pending || workflow.pending;
  const select = (id: string, versionNumber?: number) => {
    const next = entries.find((item) => item.id === id);
    const chosen =
      next?.versions.find((item) => item.version === versionNumber) ??
      (next ? (latestCompatibleTemplateVersion(next) ?? next.versions.at(-1)) : undefined);
    if (next && chosen) choose(workspaceKey, { id: next.id, version: chosen.version });
    setReplacement(null);
    setSaved(null);
  };
  // 保存/复制成功后选中服务返回列表里的结果；无法唯一确定时不猜，只说明资料库已更新。
  const onSaved = (result: GraphMutationResult | undefined) => {
    if (result) choose(workspaceKey, { id: result.entryId, version: result.version });
    setReplacement(null);
    setSaved(result ?? "unknown");
  };
  const rows = entry ? versionRows(entry, designPin(definition)) : [];
  // 对话框里点“查看当前运行”要先关掉对话框，否则被查看的页面被遮住。
  const viewCurrentRun = onViewCurrentRun
    ? () => {
        setOpen(false);
        onViewCurrentRun();
      }
    : undefined;
  // UX-M3.3：选择指向库里不再提供的版本时，只显示说明，不在它的位置显示别的版本的表单。
  const pin =
    status.kind === "offered" ? null : (
      <GraphPinNotice
        status={status}
        onContinue={status.kind === "workflow-missing" ? undefined : continueWithOffered}
      />
    );
  const bindings =
    pin ??
    (version && entry ? (
      <>
        {carryReport ? (
          <GraphCarryReport report={carryReport} onDismiss={dismissCarryReport} />
        ) : null}
        <GraphTemplateBindings
          key={`${entry.id}:${version.version}`}
          version={version}
          workspaceKey={workspaceKey}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          templateKey={`${entry.id}:${version.version}`}
          recipeReadState={recipeReadState}
          disabled={locked || entry.archived}
          disabledReason={entry.archived ? u("noCompatibleVersion") : disabledReason}
          admissionReason={admissionReason}
          onViewCurrentRun={viewCurrentRun}
          error={inline ? workflow.error || error || undefined : undefined}
          errorKind={workflow.error ? "review" : errorKind}
          onLoadRecipes={onLoadRecipes}
          onOpenSetup={(checkId) => {
            setOpen(false);
            onOpenSetup(checkId);
          }}
          allowReview={inline && Boolean(onReview)}
          onInstantiate={requestInstantiate}
        />
      </>
    ) : workflow.view ? (
      <p role="status" className="text-ui-sm text-warning">
        {u("noCompatibleVersion")}
      </p>
    ) : (
      <p role="status" className="text-ui-sm">
        {intl.formatMessage({ id: "graph.loading" })}
      </p>
    ));
  const description =
    version && entry ? (
      <p className="whitespace-pre-wrap text-ui-sm text-foreground-subtle">
        {display.description(entry.id, version.template.description)}
      </p>
    ) : null;
  const picker = (
    <GraphLibraryPicker
      entries={entries}
      entry={entry}
      disabled={workflow.pending}
      onSelect={(id) => select(id)}
    />
  );
  const content = inline ? (
    <div className="space-y-4">
      {picker}
      {description}
      {entry && version ? (
        <GraphRunWorkflowVersion
          entry={entry}
          version={version}
          rows={rows}
          disabled={workflow.pending}
          onSelect={(next) => select(entry.id, next)}
        />
      ) : null}
      {bindings}
    </div>
  ) : (
    <div className="space-y-5">
      <p
        className="break-all font-mono text-ui-sm text-foreground-subtle"
        data-testid="graph-library-workspace"
      >
        {workspacePath}
      </p>
      {workflow.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2"
          data-testid="graph-library-error"
        >
          <p className="min-w-0 flex-1 break-words text-ui-sm text-destructive">{workflow.error}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={workflow.pending}
            data-testid="graph-library-error-refresh"
            onClick={() => void workflow.read()}
          >
            {t("refresh")}
          </Button>
        </div>
      ) : null}
      {saved ? (
        <p role="status" className="text-ui-sm font-medium" data-testid="graph-library-result">
          {saved === "unknown"
            ? m3("savedUnknown")
            : m3("saved", { name: saved.name, version: saved.version })}
        </p>
      ) : null}
      {admissionReason ? (
        <GraphLibraryBlocked
          id={blockedId}
          reason={m3("blockedBrowse")}
          onViewCurrentRun={viewCurrentRun}
        />
      ) : gates.mutation ? (
        <GraphLibraryBlocked id={blockedId} reason={gates.mutation} />
      ) : null}
      <GraphLibrarySection id="workflow" title={m3("sectionWorkflow")}>
        {picker}
        {description}
      </GraphLibrarySection>
      {entry ? (
        <GraphLibrarySection id="versions" title={m3("sectionVersions")}>
          <GraphLibraryVersions
            entry={entry}
            rows={rows}
            selected={version?.version}
            disabled={workflow.pending}
            onSelect={(next) => select(entry.id, next)}
          />
          <GraphLibraryManage
            key={entry.id}
            workflow={workflow}
            entry={entry}
            version={version?.version}
            mutationBlocked={gates.mutation}
            blockedId={blockedId}
            onSaved={onSaved}
          />
        </GraphLibrarySection>
      ) : null}
      <GraphLibrarySection id="use" title={m3("sectionUse")}>
        {bindings}
        {onOpenInRuns ? (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="graph-library-open-runs-row"
          >
            <Button
              size="sm"
              variant="outline"
              disabled={!entry || !version || entry.archived}
              data-testid="graph-library-open-runs"
              onClick={() => {
                setOpen(false);
                onOpenInRuns();
              }}
            >
              {m3("openInRuns")}
            </Button>
            <p className="text-ui-xs text-foreground-subtle">{m3("openInRunsHelp")}</p>
          </div>
        ) : null}
      </GraphLibrarySection>
      <details className="space-y-3" data-testid="graph-library-share">
        <summary className="cursor-pointer text-ui-sm font-medium">{m3("sectionShare")}</summary>
        {workflow.view ? (
          <GraphShare
            workflow={workflow}
            view={workflow.view}
            definition={definition}
            dirty={dirty}
            entry={entry}
            version={version?.version}
            mutationBlocked={gates.mutation}
            exportBlocked={gates.exportToDisk}
            blockedId={blockedId}
            target={target}
            onSaved={onSaved}
          />
        ) : null}
      </details>
      <GraphLibraryAdvanced workflow={workflow} digest={version?.digest} entry={entry}>
        {workflow.view ? (
          <GraphShareImport
            manual
            workflow={workflow}
            view={workflow.view}
            mutationBlocked={gates.mutation}
            blockedId={blockedId}
            target={target}
            onSaved={onSaved}
          />
        ) : null}
      </GraphLibraryAdvanced>
    </div>
  );
  return (
    <>
      {inline ? (
        <section className="space-y-4" data-testid="graph-library-dialog">
          <h3 className="text-ui-base font-medium">{u("useWorkflow")}</h3>
          <p className="text-ui-sm text-foreground-subtle">{u("workflowHelp")}</p>
          {content}
        </section>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={!workflow.supported}
            data-testid="graph-library-open"
            onClick={() => {
              setOpen(true);
              void workflow.read();
            }}
          >
            {t("library")}
          </Button>
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!workflow.pending && !replacement) setOpen(value);
            }}
          >
            <DialogContent
              className="graph-ui max-h-[90vh] overflow-auto sm:max-w-3xl"
              data-testid="graph-library-dialog"
            >
              <DialogHeader>
                <DialogTitle>{t("library")}</DialogTitle>
                <DialogDescription>{u("workflowHelp")}</DialogDescription>
              </DialogHeader>
              {content}
            </DialogContent>
          </Dialog>
        </>
      )}
      <GraphLibraryReplace
        open={Boolean(replacement)}
        error={replacementError || workflow.error || error || designError}
        actionsLocked={actionsLocked}
        operationPending={operationPending}
        onSave={() => replacement && void apply(replacement, "save")}
        onDiscard={() => replacement && void apply(replacement, "discard")}
        onCancel={() => setReplacement(null)}
      />
    </>
  );
}
