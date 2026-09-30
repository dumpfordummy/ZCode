import type { GraphDefinition, GraphNativeSettings, GraphWorkspaceView } from "@zcode/services";
import { useEffect, useRef, useState } from "react";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { GraphPanelProps } from "./graphEngineeringView.js";
import { GraphCanvas } from "./GraphCanvas.js";
import { GraphNodeNavigation } from "./GraphNodeNavigation.js";
import { GraphRunPanel } from "./GraphRunPanel.js";
import { GraphRunOverview } from "./GraphRunOverview.js";
import type { GraphRunInspection } from "./GraphRunActions.js";
import { GraphNodeInspector } from "./GraphNodeInspector.js";
import { LegacyInspector } from "./GraphLegacyInspector.js";
import { GraphEditorMode } from "./GraphEditorMode.js";
import { GraphEdgeActions } from "./GraphEdgeActions.js";
import { GraphRunTrail } from "./GraphRunTrail.js";
import { useGraphRunText } from "./GraphRunText.js";
import { Button } from "@/components/ui/button.js";
import { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";

export function GraphEditorSurface({
  definition,
  displayed,
  showingRuns,
  selectedRun,
  selectedNodeId,
  regionId,
  attemptId,
  defaults,
  graph,
  disabled,
  workspacePath,
  workspaceIdentity,
  onSelectNode,
  onSelectRegion,
  onSelectAttempt,
  onChange,
  onOpenConversation,
  onRunAgain,
}: {
  onRunAgain?(run: GraphWorkspaceView["runs"][number]): void;
  definition: GraphDefinition;
  displayed: GraphDefinition;
  showingRuns: boolean;
  selectedRun?: GraphWorkspaceView["runs"][number];
  selectedNodeId?: string;
  regionId?: string;
  attemptId?: string;
  defaults: GraphNativeSettings | null;
  graph: ReturnType<typeof useGraphEngineering>;
  disabled: boolean;
  workspacePath: string;
  workspaceIdentity?: string;
  onSelectNode(nodeId: string): void;
  onSelectRegion(regionId: string): void;
  onSelectAttempt(attemptId: string): void;
  onChange(definition: GraphDefinition): void;
  onOpenConversation: GraphPanelProps["onOpenConversation"];
}) {
  const { intl } = useZCodeIntl();
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const edgeKey = useGraphEngineeringViewStore((state) => state.selections[workspaceKey]?.edgeKey);
  const runGraph = useGraphEngineeringViewStore(
    (state) => state.selections[workspaceKey]?.runGraph === true,
  );
  const u = useGraphRunText();
  const onSelectEdge = (value: string) =>
    useGraphEngineeringViewStore.getState().select(workspaceKey, { edgeKey: value });
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const editableNode =
    displayed.version !== undefined
      ? displayed.nodes.find((node) => node.id === selectedNodeId)
      : undefined;
  const run = showingRuns && selectedRun?.version !== undefined ? selectedRun : undefined;
  const inspectorRef = useRef<HTMLElement>(null);
  const [inspection, setInspection] = useState<{ runId: string; request: GraphRunInspection }>();
  const onInspect = (request: GraphRunInspection) => {
    if (!selectedRun) return;
    if (request.kind === "node") {
      onSelectNode(request.nodeId);
      if (request.attemptId) onSelectAttempt(request.attemptId);
    }
    setInspection({ runId: selectedRun.id, request });
  };
  useEffect(() => {
    if (!inspection || inspection.runId !== selectedRun?.id) return;
    const selector =
      inspection.request.kind === "checkpoint"
        ? "graph-region-inspector"
        : inspection.request.kind === "recovery"
          ? "graph-recovery"
          : "graph-node-inspector";
    const element =
      inspectorRef.current?.querySelector<HTMLElement>(`[data-testid="${selector}"]`) ??
      inspectorRef.current;
    // 导航只在选择提交后的当前检查器定位，不创建输入，也不用延时猜测节点渲染顺序。
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [inspection, selectedRun?.id]);
  const inspector = (
    <aside
      ref={inspectorRef}
      tabIndex={-1}
      className={
        showingRuns
          ? "w-full shrink-0 space-y-4 border-t border-border pt-3"
          : "w-full shrink-0 space-y-4 border-t border-border p-3 lg:min-h-0 lg:w-96 lg:overflow-auto lg:border-t-0 lg:border-l"
      }
      aria-label={t("inspector")}
    >
      {showingRuns && selectedRun ? (
        <GraphRunPanel
          selectedRun={selectedRun}
          nodeId={selectedNodeId}
          selectedAttemptId={attemptId}
          regionSelected={Boolean(regionId)}
          onSelectAttempt={onSelectAttempt}
          onOpenConversation={onOpenConversation}
          graph={graph}
          disabled={disabled}
        />
      ) : displayed.version !== undefined && editableNode ? (
        <GraphNodeInspector
          definition={displayed}
          node={editableNode}
          onChange={onChange}
          disabled={disabled}
          defaults={defaults}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          recipes={graph.recipes}
        />
      ) : displayed.version === undefined ? (
        <LegacyInspector definition={displayed} onChange={onChange} disabled={disabled} />
      ) : null}
    </aside>
  );
  const canvas = (
    <div className="flex min-w-0 shrink-0 flex-col gap-2 lg:min-h-80 lg:flex-1 lg:shrink">
      {!showingRuns && displayed.version !== undefined ? (
        <>
          <GraphEditorMode workspaceKey={workspaceKey} />
          <GraphEdgeActions
            definition={displayed}
            selected={edgeKey}
            {...{ disabled, onChange, onSelectNode }}
            onSelect={onSelectEdge}
          />
        </>
      ) : null}
      <div className="h-80 shrink-0 lg:h-auto lg:min-h-80 lg:flex-1 lg:shrink">
        <GraphCanvas
          definition={definition}
          selectedEdgeKey={edgeKey}
          onSelectEdge={onSelectEdge}
          disabled={disabled || showingRuns}
          selectedId={regionId ? undefined : selectedNodeId}
          selectedRegionId={regionId}
          selectedAttemptId={attemptId}
          run={run}
          onSelectRegion={onSelectRegion}
          onSelect={onSelectNode}
          onChange={onChange}
          attempts={run?.nodeAttempts}
          approvals={run?.approvalAttempts}
          tools={run?.toolAttempts}
        />
      </div>
      <GraphNodeNavigation
        definition={definition}
        selectedNodeId={selectedNodeId}
        regionId={regionId}
        onSelect={onSelectNode}
        onSelectRegion={onSelectRegion}
      />
      <p className="text-ui-sm text-foreground-subtlest">{t("layoutHelp")}</p>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showingRuns && selectedRun ? (
        <GraphRunOverview
          key={selectedRun.id}
          run={selectedRun}
          disabled={disabled}
          onCancel={(id) => void graph.cancel(id)}
          {...{ onInspect, onOpenConversation, onRunAgain }}
        />
      ) : null}
      {showingRuns && selectedRun ? (
        // 步骤轨迹是 Runs 的主视图；冻结运行定义的只读图可按需切换，且不改变任何选择。
        <div
          className="grid min-w-0 gap-3 min-[1600px]:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]"
          data-testid="graph-run-steps"
        >
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-ui-base font-medium">{u("steps")}</h4>
              <Button
                size="sm"
                variant={runGraph ? "secondary" : "outline"}
                aria-pressed={runGraph}
                data-testid="graph-run-graph-toggle"
                onClick={() =>
                  useGraphEngineeringViewStore
                    .getState()
                    .select(workspaceKey, { runGraph: !runGraph })
                }
              >
                {u(runGraph ? "hideRunGraph" : "viewRunGraph")}
              </Button>
            </div>
            {run && !runGraph ? (
              <GraphRunTrail
                run={run}
                selectedNodeId={selectedNodeId}
                selectedAttemptId={attemptId}
                onSelect={(nodeId, nextAttemptId) => {
                  onSelectNode(nodeId);
                  if (nextAttemptId) onSelectAttempt(nextAttemptId);
                }}
              />
            ) : (
              canvas
            )}
          </div>
          {inspector}
        </div>
      ) : (
        // 窄屏纵向堆叠时保留画布、节点控制和检查器的自然高度，避免 flex 压缩后内容重叠。
        <div className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:shrink lg:flex-row">
          {canvas}
          {inspector}
        </div>
      )}
    </div>
  );
}
