import type {
  GraphDefinition,
  GraphLibraryEntry,
  GraphLibraryView,
  GraphTemplateVersion,
  GraphWorkspaceTarget,
} from "@zcode/services";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphLibraryAdvanced } from "./GraphLibraryAdvanced.js";
import { GraphLibraryBlocked } from "./GraphLibraryBlocked.js";
import { GraphLibraryDialogBody } from "./GraphLibraryDialogBody.js";
import { GraphLibraryList } from "./GraphLibraryList.js";
import { GraphLibraryManage } from "./GraphLibraryManage.js";
import { useGraphWorkflowLabel } from "./GraphLibraryPicker.js";
import { GraphLibraryVersions } from "./GraphLibraryVersions.js";
import { GraphShare } from "./GraphShare.js";
import { GraphShareImport } from "./GraphShareImport.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import type { GraphMutationResult } from "./graphLibrarySave.js";
import type { GraphVersionRow } from "./graphLibraryView.js";

/**
 * UX-M4: the content of the library dialog. GraphLibrary owns the selection, the workflow hook and
 * every rule (gates, replacement, draft store); this only arranges them into the master-detail
 * layout: list, selected workflow, notices beside the tabs, tab panels and the fixed footer.
 */
export function GraphLibraryDialogContent({
  workspacePath,
  target,
  entries,
  entry,
  version,
  rows,
  workflow,
  gates,
  admissionReason,
  blockedId,
  saved,
  definition,
  dirty,
  description,
  bindings,
  select,
  onSaved,
  viewCurrentRun,
  onOpenInRuns,
  setActionsHost,
}: {
  workspacePath: string;
  target: GraphWorkspaceTarget;
  entries: readonly GraphLibraryEntry[];
  entry?: GraphLibraryEntry;
  version?: GraphTemplateVersion;
  rows: readonly GraphVersionRow[];
  workflow: ReturnType<typeof useGraphWorkflow>;
  gates: { mutation?: string; exportToDisk?: string };
  admissionReason?: string;
  blockedId: string;
  /** The latest success, already filtered so it never sits beside a newer failure. */
  saved: GraphMutationResult | "unknown" | null;
  definition: GraphDefinition;
  dirty: boolean;
  description: ReactNode;
  bindings: ReactNode;
  select(id: string, version?: number): void;
  onSaved(
    result: GraphMutationResult | undefined,
    before?: GraphLibraryView,
    after?: GraphLibraryView,
  ): void;
  viewCurrentRun?(): void;
  onOpenInRuns?(): void;
  setActionsHost(node: HTMLElement | null): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const m3 = useGraphM3Text();
  const label = useGraphWorkflowLabel();
  const shownSaved = saved;
  return (
    <GraphLibraryDialogBody
      title={t("library")}
      help={u("workflowHelp")}
      workspacePath={workspacePath}
      list={
        <GraphLibraryList
          entries={entries}
          selected={entry?.id}
          disabled={workflow.pending}
          onSelect={(id) => select(id)}
        />
      }
      detail={
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3
              className="min-w-0 break-words text-ui-xl font-semibold"
              data-testid="graph-library-entry"
            >
              {entry ? label.name(entry) : t("chooseWorkflow")}
              {entry ? (
                <span className="text-ui-base font-normal text-foreground-subtle">
                  {` · ${label.kind(entry)}`}
                  {entry.archived ? ` · ${m3("archivedTag")}` : ""}
                </span>
              ) : null}
            </h3>
          </div>
          {entry?.archived ? (
            <p role="status" className="text-ui-sm text-warning">
              {m3("archivedNote")}
            </p>
          ) : null}
          {description}
        </div>
      }
      notices={
        <>
          {admissionReason ? (
            <GraphLibraryBlocked
              id={blockedId}
              reason={m3("blockedBrowse")}
              onViewCurrentRun={viewCurrentRun}
            />
          ) : gates.mutation ? (
            <GraphLibraryBlocked id={blockedId} reason={gates.mutation} />
          ) : null}
          {workflow.error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2"
              data-testid="graph-library-error"
            >
              <p className="min-w-0 flex-1 break-words text-ui-base">{workflow.error}</p>
              <Button
                variant="outline"
                disabled={workflow.pending}
                data-testid="graph-library-error-refresh"
                onClick={() => void workflow.read()}
              >
                {t("refresh")}
              </Button>
            </div>
          ) : null}
          {shownSaved ? (
            <p
              role="status"
              className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-ui-base font-medium"
              data-testid="graph-library-result"
            >
              {shownSaved === "unknown"
                ? m3("savedUnknown")
                : m3("saved", { name: shownSaved.name, version: shownSaved.version })}
            </p>
          ) : null}
        </>
      }
      panels={{
        versions: entry ? (
          <div className="space-y-4">
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
          </div>
        ) : (
          <p role="status" className="text-ui-base text-foreground-subtle">
            {t("chooseWorkflow")}
          </p>
        ),
        use: bindings,
        share: workflow.view ? (
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
        ) : null,
        advanced: (
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
        ),
      }}
      footer={
        <>
          {onOpenInRuns ? (
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="graph-library-open-runs-row"
            >
              <Button
                disabled={!entry || !version || entry.archived}
                data-testid="graph-library-open-runs"
                onClick={onOpenInRuns}
              >
                {m3("openInRuns")}
              </Button>
            </div>
          ) : null}
          {/* 「载入设计」的操作栏由使用标签里的表单渲染到这里；占用、未填写等原因与失败就在它旁边。 */}
          <div ref={setActionsHost} className="contents" data-testid="graph-library-actions-host" />
          {onOpenInRuns ? (
            <p className="basis-full text-ui-sm text-foreground-subtle">{m3("openInRunsHelp")}</p>
          ) : null}
        </>
      }
    />
  );
}
