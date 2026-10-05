import { useEffect, useMemo, useState } from "react";
import type { GraphDefinition, GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Dialog, DialogContent } from "@/components/ui/dialog.js";
import { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { useGraphTemplateText } from "./graphTemplateText.js";
import { GraphTemplateBindings } from "./GraphTemplateBindings.js";
import { GraphLibraryPicker } from "./GraphLibraryPicker.js";
import { GraphLibraryDialogContent } from "./GraphLibraryDialogContent.js";
import { GraphLibraryReplace } from "./GraphLibraryReplace.js";
import { useGraphLibraryReplacement } from "./useGraphLibraryReplacement.js";
import { useGraphLibrarySelection } from "./useGraphLibrarySelection.js";
import { GraphCarryReport } from "./GraphCarryReport.js";
import { GraphPinNotice } from "./GraphPinNotice.js";
import { GraphRunWorkflowVersion } from "./GraphRunWorkflowVersion.js";
import type { GraphMutationResult } from "./graphLibrarySave.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { designPin, libraryGates, versionRows } from "./graphLibraryView.js";
import { latestCompatibleTemplateVersion } from "./graphWorkflowView.js";
import type { GraphRecipeReadState } from "./graphRecipeRead.js";
import { GraphDisclosure } from "./GraphDisclosure.js";
import { useGraphM4Text } from "./GraphM4Text.js";

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
  const m4 = useGraphM4Text();
  const target = useMemo(
    () => ({ workspacePath, ...(workspaceIdentity ? { workspaceIdentity } : {}) }),
    [workspacePath, workspaceIdentity],
  );
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const display = useGraphTemplateText();
  const workflow = useGraphWorkflow(target);
  const choose = useGraphDraftStore((state) => state.selectLibrary);
  const [open, setOpen] = useState(false);
  // UX-M4：对话框固定页脚的承载节点；使用标签里的操作栏通过 portal 渲染到这里。
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  // UX-M4：对话框的当前标签由这里持有，页脚里的“打开使用”才能切换到“使用”标签。
  const [libraryTab, setLibraryTab] = useState("versions");
  // UX-M3.2：最近一次创建/新版本/复制的结果，来自服务返回的列表；用户改选后清除。
  const [saved, setSaved] = useState<GraphMutationResult | "unknown" | null>(null);
  const entries = workflow.view?.entries ?? [];
  const { entry, version, status, carryReport, continueWithOffered, dismissCarryReport } =
    useGraphLibrarySelection(entries, Boolean(workflow.view), workspaceKey);
  useEffect(() => {
    if (inline) void workflow.read();
  }, [inline, workflow.read]);
  // UX-M4：新的库操作一开始就清除上一次的成功提示，失败与成功不会同时竞争注意力。
  useEffect(() => {
    if (workflow.pending) setSaved(null);
  }, [workflow.pending]);
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
          onViewCurrentRun={inline ? viewCurrentRun : undefined}
          error={inline ? workflow.error || error || undefined : undefined}
          errorKind={workflow.error ? "review" : errorKind}
          onLoadRecipes={onLoadRecipes}
          onOpenSetup={(checkId) => {
            setOpen(false);
            onOpenSetup(checkId);
          }}
          allowReview={inline && Boolean(onReview)}
          actionsHost={inline ? null : actionsHost}
          onOpenUse={inline || libraryTab === "use" ? undefined : () => setLibraryTab("use")}
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
  const inlineContent = (
    <div className="space-y-5">
      <div className="space-y-2">
        {picker}
        {description ? (
          <GraphDisclosure title={m4("workflowDetails")}>{description}</GraphDisclosure>
        ) : null}
      </div>
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
  );
  // UX-M4：一个较新的失败不能和旧的成功提示并排；新操作开始时旧结果也已清除（见上面的 effect）。
  const shownSaved = saved && !workflow.error ? saved : null;
  return (
    <>
      {inline ? (
        <section className="space-y-5" data-testid="graph-library-dialog">
          <header className="space-y-1">
            <h3 className="text-ui-xl font-semibold">
              {intl.formatMessage({ id: "graph.run.newRun" })}
            </h3>
          </header>
          {inlineContent}
        </section>
      ) : (
        <>
          <Button
            variant="outline"
            className="self-start"
            disabled={!workflow.supported}
            data-testid="graph-library-open"
            onClick={() => {
              setLibraryTab("versions");
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
              className="graph-ui h-[min(88vh,46rem)] max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-5xl"
              data-testid="graph-library-dialog"
            >
              <GraphLibraryDialogContent
                workspacePath={workspacePath}
                target={target}
                entries={entries}
                entry={entry}
                version={version}
                rows={rows}
                workflow={workflow}
                gates={gates}
                admissionReason={admissionReason}
                blockedId={blockedId}
                saved={shownSaved}
                definition={definition}
                dirty={dirty}
                description={description}
                bindings={bindings}
                select={select}
                onSaved={onSaved}
                viewCurrentRun={viewCurrentRun}
                onOpenInRuns={
                  onOpenInRuns
                    ? () => {
                        setOpen(false);
                        onOpenInRuns();
                      }
                    : undefined
                }
                setActionsHost={setActionsHost}
                tab={libraryTab}
                onTabChange={setLibraryTab}
              />
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
