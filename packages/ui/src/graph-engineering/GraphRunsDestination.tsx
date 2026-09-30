import type { GraphDefinition, GraphNativeSettings, GraphWorkspaceView } from "@zcode/services";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphDesignReadiness } from "./GraphDesignReadiness.js";
import { GraphEditorSurface } from "./GraphEditorSurface.js";
import { GraphLibrary } from "./GraphLibrary.js";
import { GraphRunConfirmation } from "./GraphRunConfirmation.js";
import { GraphRunHistory } from "./GraphRunHistory.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import type { GraphRunConfirmationSnapshot, GraphSubmission } from "./graphSubmission.js";

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
  // UX-M1.4：检查保存失败属于 Checks 编辑器；返回新运行后不能显示在 Review and run 旁边。
  const admissionError = graph.errorSource === "checks" ? undefined : (graph.error ?? undefined);
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  return (
    <div
      className="grid min-w-0 gap-3 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]"
      data-testid="graph-runs-layout"
    >
      <GraphRunHistory
        runs={view.runs}
        selectedRunId={selectedRun?.id}
        newRunSelected={props.newRunPane}
        needsYouRunIds={props.needsYouRunIds}
        reveal={props.reveal}
        onNewRun={props.onNewRun}
        onSelect={props.onSelectRun}
      />
      <div className="flex min-w-0 flex-col gap-3" data-testid="graph-runs-detail">
        {confirmation ? (
          <GraphRunConfirmation
            key={`${confirmation.definition.revision}:${confirmation.provenance?.digest ?? "graph"}`}
            snapshot={confirmation}
            workspacePath={props.workspacePath}
            disabled={graph.pending}
            canConfirm={props.canConfirm}
            onClose={props.onCloseConfirmation}
            onConfirm={props.onStart}
            error={admissionError}
          />
        ) : props.newRunPane ? (
          <section className="space-y-3" data-testid="graph-new-run-pane">
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
              error={admissionError}
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
            {selectedRun.version !== undefined &&
            !selectedRun.definition.nodes.some((node) => node.type === "tool") ? (
              <p className="text-ui-sm text-foreground-subtle" data-testid="graph-run-verification">
                {u("agentLed")}
              </p>
            ) : null}
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
  );
}
