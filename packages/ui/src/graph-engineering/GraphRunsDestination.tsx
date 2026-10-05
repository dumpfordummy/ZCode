import type { GraphDefinition, GraphNativeSettings, GraphWorkspaceView } from "@zcode/services";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphDesignReadiness } from "./GraphDesignReadiness.js";
import { GraphEditorSurface } from "./GraphEditorSurface.js";
import { GraphLibrary } from "./GraphLibrary.js";
import { GraphRunConfirmation } from "./GraphRunConfirmation.js";
import { GraphRunHistory } from "./GraphRunHistory.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { graphAdmissionFailure } from "./graphActionFailure.js";
import type { GraphRunConfirmationSnapshot, GraphSubmission } from "./graphSubmission.js";
import { Button } from "@/components/ui/button.js";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import "./GraphRunLayout.css";

type Run = GraphWorkspaceView["runs"][number];

/**
 * Runs destination: the run list beside either the inline review, the new-run form or the selected
 * run. It only composes existing pieces; every action is passed in from the editor, which owns the
 * navigation selection, the draft store and the run/save operations.
 */
export function GraphRunsDestination(props: {
  view: GraphWorkspaceView;
  graph: ReturnType<typeof useGraphEngineering>;
  workspacePath: string;
  workspaceIdentity?: string;
  displayed: GraphDefinition;
  definition: GraphDefinition;
  dirty: boolean;
  disabled: boolean;
  canConfirm: boolean;
  /** The form cannot be edited (operation in flight, other Host, conflict, unavailable, no model). */
  draftLockReason?: string;
  /** A run occupies the workspace: the draft stays editable, admission is refused. */
  occupiedReason?: string;
  activeRunId?: string;
  needsYouRunIds: ReadonlySet<string>;
  /** UX-M2.1: the view store's reveal counter (explicit navigation to a run). */
  reveal?: number;
  newRunPane: boolean;
  selectedRun?: Run;
  selectedNodeId?: string;
  regionId?: string;
  attemptId?: string;
  defaults: GraphNativeSettings | null;
  confirmation: GraphRunConfirmationSnapshot | null;
  onNewRun(): void;
  onSelectRun(runId: string): void;
  /** UX-M1.3: open a run because the user asked to view it (focus follows), unlike a history row. */
  onViewRun(runId: string): void;
  onCloseConfirmation(): void;
  onStart(preflight?: GraphSubmission["preflight"]): void;
  onOpenSetup(checkId?: string): void;
  onReview(definition: GraphDefinition): void;
  onInstantiated(saved: GraphDefinition, continuation: "review" | "save"): void;
  onSelectNode(nodeId: string): void;
  onSelectRegion(regionId: string): void;
  onSelectAttempt(attemptId: string): void;
  onChange(definition: GraphDefinition): void;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
  onRunAgain(run: Run): void;
}) {
  const { view, graph, confirmation, selectedRun } = props;
  const workspaceKey = props.workspaceIdentity?.trim() || props.workspacePath;
  const historyCollapsed = useGraphEngineeringViewStore(
    (state) => state.selections[workspaceKey]?.runHistoryCollapsed === true,
  );
  const m4 = useGraphM4Text();
  // UX-M1.4：检查保存失败属于 Checks 编辑器；返回新运行后不能显示在 Review and run 旁边。
  // UX-M2.3：更进一步，这两个操作栏只显示准入路径（预检、Start）的失败，其他操作的失败留在各自页面。
  const admission = graphAdmissionFailure(graph.error, graph.errorSource);
  // 设计保存失败（替换对话框里的“保存并替换”）仍显示在那个对话框中。
  const designError = graph.errorSource === "design" ? graph.error : undefined;
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  return (
    <div className="graph-runs-layout min-w-0 space-y-2" data-testid="graph-runs-layout">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={!historyCollapsed}
        aria-controls="graph-runs-history-pane"
        data-testid="graph-run-history-toggle"
        onClick={() =>
          useGraphEngineeringViewStore.getState().select(workspaceKey, {
            runHistoryCollapsed: !historyCollapsed,
          })
        }
      >
        {m4(historyCollapsed ? "showHistory" : "hideHistory")}
      </Button>
      <div className="graph-runs-columns" data-history-collapsed={historyCollapsed}>
        <div id="graph-runs-history-pane" hidden={historyCollapsed}>
          <GraphRunHistory
            runs={view.runs}
            selectedRunId={selectedRun?.id}
            newRunSelected={props.newRunPane}
            needsYouRunIds={props.needsYouRunIds}
            reveal={props.reveal}
            onNewRun={props.onNewRun}
            onSelect={props.onSelectRun}
          />
        </div>
        <div className="mx-auto flex w-full min-w-0 flex-col gap-4" data-testid="graph-runs-detail">
          {confirmation ? (
            <GraphRunConfirmation
              key={`${confirmation.definition.revision}:${confirmation.provenance?.digest ?? "graph"}`}
              snapshot={confirmation}
              workspacePath={props.workspacePath}
              disabled={graph.pending}
              canConfirm={props.canConfirm}
              onClose={props.onCloseConfirmation}
              onConfirm={props.onStart}
              error={admission?.message}
              errorKind={admission?.kind}
            />
          ) : props.newRunPane ? (
            <section
              className="mx-auto w-full max-w-3xl space-y-4"
              data-testid="graph-new-run-pane"
            >
              <GraphDesignReadiness
                reason={props.draftLockReason}
                errors={[]}
                onOpenRun={props.onSelectRun}
              />
              <GraphLibrary
                workspacePath={props.workspacePath}
                workspaceIdentity={props.workspaceIdentity}
                definition={props.displayed}
                dirty={props.dirty}
                disabled={props.draftLockReason !== undefined}
                inline
                disabledReason={props.draftLockReason}
                admissionReason={props.occupiedReason}
                onViewCurrentRun={
                  props.activeRunId ? () => props.onViewRun(props.activeRunId!) : undefined
                }
                pending={graph.pending}
                error={admission?.message}
                errorKind={admission?.kind}
                designError={designError}
                recipeReadState={graph.recipeReadState}
                onLoadRecipes={graph.readRecipes}
                onOpenSetup={props.onOpenSetup}
                onSaveDesign={graph.save}
                onReview={props.onReview}
                onInstantiated={props.onInstantiated}
              />
            </section>
          ) : selectedRun ? (
            <>
              <GraphEditorSurface
                definition={props.definition}
                displayed={props.displayed}
                showingRuns
                selectedRun={selectedRun}
                selectedNodeId={props.selectedNodeId}
                regionId={props.regionId}
                attemptId={props.attemptId}
                defaults={props.defaults}
                graph={graph}
                disabled={props.disabled}
                workspacePath={props.workspacePath}
                workspaceIdentity={props.workspaceIdentity}
                onSelectNode={props.onSelectNode}
                onSelectRegion={props.onSelectRegion}
                onSelectAttempt={props.onSelectAttempt}
                onChange={props.onChange}
                onOpenConversation={props.onOpenConversation}
                onRunAgain={props.onRunAgain}
              />
            </>
          ) : (
            <p className="text-ui-sm text-foreground-subtle" role="status">
              {view.runs.length ? u("selectRun") : t("noRuns")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
