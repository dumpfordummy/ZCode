import { useEffect, useMemo, useState } from "react";
import type {
  GraphDefinition,
  GraphSequentialDefinition,
} from "@zcode/services";
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
import {
  useGraphLibraryReplacement,
  type ReplacementIntent,
} from "./useGraphLibraryReplacement.js";
import { GraphRunWorkflowVersion } from "./GraphRunWorkflowVersion.js";
import { GraphLibrarySection } from "./GraphLibrarySections.js";
import { GraphLibraryVersions } from "./GraphLibraryVersions.js";
import { GraphTemplateTransfer } from "./GraphTemplateTransfer.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { graphDefinitionContent } from "./graphEngineeringView.js";
import {
  designPin,
  libraryGates,
  resolveLibrarySelection,
  versionRows,
} from "./graphLibraryView.js";
import { latestCompatibleTemplateVersion } from "./graphWorkflowView.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";
import {
  graphInstantiationFingerprint,
  isRememberedGraphInstantiation,
} from "./graphInstantiationMemo.js";

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
  const selection = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.librarySelection);
  const choose = useGraphDraftStore((state) => state.selectLibrary);
  const [open, setOpen] = useState(false);
  const entries = workflow.view?.entries ?? [];
  const { entry, version, defaultId, defaultVersion } = resolveLibrarySelection(entries, selection);
  useEffect(() => {
    // 默认选择只在新建意图首次读取后固定；刷新库不能让正在填写的表单自动漂移到新版本。
    if (!selection && defaultId && defaultVersion !== undefined)
      choose(workspaceKey, { id: defaultId, version: defaultVersion });
  }, [selection, defaultId, defaultVersion, choose, workspaceKey]);
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
  const {
    replacement,
    setReplacement,
    replacementError,
    setReplacementError,
    apply,
    formFingerprint,
  } = useGraphLibraryReplacement({
    workspaceKey,
    definition,
    entry,
    version,
    actionsLocked,
    workflow,
    onSaveDesign,
    onInstantiated,
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
  };
  const rows = entry ? versionRows(entry, designPin(definition)) : [];
  // 对话框里点“查看当前运行”要先关掉对话框，否则被查看的页面被遮住。
  const viewCurrentRun = onViewCurrentRun
    ? () => {
        setOpen(false);
        onViewCurrentRun();
      }
    : undefined;
  const bindings =
    version && entry ? (
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
        onInstantiate={(parameters, bindingValues, continuation) => {
          if (actionsLocked) return;
          const instantiation = graphInstantiationFingerprint({
            id: entry.id,
            version: version.version,
            digest: version.digest,
            parameters,
            bindings: bindingValues,
          });
          // 表单与已保存设计没有变化：直接进入审阅，不再次创建定义，也不因重复点击产生新修订。
          if (
            continuation === "review" &&
            !dirty &&
            definition.version === 5 &&
            isRememberedGraphInstantiation(
              workspaceKey,
              instantiation,
              graphDefinitionContent(definition),
            )
          ) {
            onReview?.(definition);
            return;
          }
          const intent: ReplacementIntent = {
            continuation,
            instantiation,
            parameters: structuredClone(parameters),
            bindings: structuredClone(bindingValues),
            definition: structuredClone(definition),
            entryId: entry.id,
            version: version.version,
            digest: version.digest,
            formFingerprint: formFingerprint(entry.id, version.version),
          };
          if (dirty) {
            setReplacementError("");
            setReplacement(intent);
          } else void apply(intent, "discard");
        }}
      />
    ) : workflow.view ? (
      <p role="status" className="text-ui-sm text-warning">
        {u("noCompatibleVersion")}
      </p>
    ) : (
      <p role="status" className="text-ui-sm">
        {intl.formatMessage({ id: "graph.loading" })}
      </p>
    );
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
          />
        </GraphLibrarySection>
      ) : null}
      <GraphLibrarySection id="use" title={m3("sectionUse")}>
        {bindings}
      </GraphLibrarySection>
      <details className="space-y-3" data-testid="graph-library-share">
        <summary className="cursor-pointer text-ui-sm font-medium">{m3("sectionShare")}</summary>
        <p className="text-ui-sm text-foreground-subtle">{m3("shareIntro")}</p>
        {workflow.view ? (
          <GraphTemplateTransfer
            key={`${entry?.id ?? "new"}:${version?.version ?? "none"}`}
            workflow={workflow}
            definition={definition}
            entry={entry}
            version={version?.version}
            revision={workflow.view.revision}
            disabled={workflow.pending}
            mutationBlocked={gates.mutation}
            exportBlocked={gates.exportToDisk}
            blockedId={blockedId}
            target={target}
          />
        ) : null}
      </details>
      <GraphLibraryAdvanced workflow={workflow} digest={version?.digest} entry={entry} />
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
              className="max-h-[90vh] overflow-auto sm:max-w-3xl"
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
