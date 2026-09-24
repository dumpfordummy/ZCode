import { memo, useMemo, useEffect } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
  type NodePositionChange,
} from "@xyflow/react";
import type {
  GraphDefinition,
  GraphNodeAttempt,
  GraphApprovalAttempt,
  GraphToolAttempt,
  GraphSequentialRun,
} from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphSelectedAttempt } from "./graphRoutingView.js";
import { connectGraphNodes } from "./graphEditing.js";
import "@xyflow/react/dist/style.css";
import "./GraphCanvas.css";

type CanvasNode = Node<
  {
    label: string;
    kind: "start" | "task" | "end" | "approval" | "tool" | "condition" | "repair-group";
    exits?: string[];
    role?: string;
    status?: string;
    editable: boolean;
  },
  "graph"
>;
const GraphNode = memo(function GraphNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const updateNodeInternals = useUpdateNodeInternals(),
    exitKey = JSON.stringify(data.exits);
  // 命名端口编辑后刷新连线几何；仅更新画布投影，不触发 Host 工作。
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, exitKey, updateNodeInternals]);
  if (data.kind === "repair-group")
    return (
      <div
        className={`h-full w-full rounded-xl border-2 border-dashed p-3 text-ui-sm ${selected ? "border-input-border-focused" : "border-border"}`}
        data-testid="graph-repair-container"
      >
        {data.label}
      </div>
    );
  return (
    <div
      className={`min-w-32 max-w-64 rounded-lg border bg-card px-4 py-3 text-ui-base text-foreground ${selected ? "border-input-border-focused" : "border-card-border"}`}
    >
      {data.kind !== "start" ? (
        <Handle type="target" position={Position.Left} isConnectable={data.editable} />
      ) : null}
      {data.role ? (
        <span className="mb-1 block text-ui-xs text-foreground-subtle">{data.role}</span>
      ) : null}
      <span className="block break-words font-medium">{data.label}</span>
      {data.status ? (
        <span className="mt-1 block text-ui-sm text-foreground-subtle">{data.status}</span>
      ) : null}
      {data.kind === "condition" ? (
        <div className="mt-2 space-y-1 text-right text-ui-xs text-foreground-subtle">
          {data.exits?.map((exit) => (
            <div key={exit} className="relative pr-2">
              {exit}
              <Handle
                id={exit}
                type="source"
                position={Position.Right}
                isConnectable={data.editable}
              />
            </div>
          ))}
        </div>
      ) : null}
      {data.kind !== "end" && data.kind !== "condition" ? (
        <Handle type="source" position={Position.Right} isConnectable={data.editable} />
      ) : null}
    </div>
  );
});
const nodeTypes = { graph: GraphNode };

export function GraphCanvas({
  definition,
  onChange,
  disabled,
  selectedId,
  onSelect,
  attempts,
  approvals,
  tools,
  run,
  selectedAttemptId,
  selectedRegionId,
  onSelectRegion,
}: {
  definition: GraphDefinition;
  onChange: (definition: GraphDefinition) => void;
  disabled: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  attempts?: GraphNodeAttempt[];
  approvals?: GraphApprovalAttempt[];
  tools?: GraphToolAttempt[];
  run?: GraphSequentialRun;
  selectedAttemptId?: string;
  selectedRegionId?: string;
  onSelectRegion?: (id: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const editable = !disabled && definition.version !== undefined;
  const nodes = useMemo<CanvasNode[]>(() => {
    const rendered = definition.nodes.map((node): CanvasNode => {
      const attempt = run
        ? graphSelectedAttempt(run, node.id, node.id === selectedId ? selectedAttemptId : undefined)
        : (attempts?.find((candidate) => candidate.nodeId === node.id) ??
          approvals?.find((candidate) => candidate.nodeId === node.id) ??
          tools?.find((candidate) => candidate.nodeId === node.id));
      return {
        id: node.id,
        type: "graph",
        position: node.position,
        selected: node.id === selectedId,
        data: {
          kind: node.type,
          exits:
            node.type === "condition"
              ? [...new Set([...node.branches.map((branch) => branch.exit), node.defaultExit])]
              : undefined,
          role:
            node.type === "approval"
              ? intl.formatMessage({ id: "graph.node.approval" })
              : undefined,
          editable,
          label:
            node.type === "task" ||
            node.type === "approval" ||
            node.type === "tool" ||
            node.type === "condition"
              ? "name" in node
                ? node.name
                : definition.version === undefined
                  ? definition.taskName
                  : ""
              : intl.formatMessage({ id: `graph.node.${node.type}` }),
          status: attempt
            ? intl.formatMessage({ id: `graph.status.${attempt.status}` })
            : undefined,
        },
      };
    });
    const region = definition.version === 5 ? definition.routing?.region : undefined;
    const body = region
      ? definition.nodes.filter((node) => region.bodyNodeIds.includes(node.id))
      : [];
    if (region && body.length) {
      const left = Math.min(...body.map((node) => node.position.x)) - 32,
        top = Math.min(...body.map((node) => node.position.y)) - 48;
      rendered.unshift({
        id: `repair-group:${region.id}`,
        type: "graph",
        position: { x: left, y: top },
        style: {
          width: Math.max(...body.map((node) => node.position.x)) + 280 - left,
          height: Math.max(...body.map((node) => node.position.y)) + 180 - top,
        },
        zIndex: -1,
        draggable: false,
        selectable: true,
        selected: selectedRegionId === region.id,
        data: { kind: "repair-group", label: region.name, editable: false },
      });
    }
    return rendered;
  }, [
    definition,
    selectedId,
    attempts,
    approvals,
    tools,
    editable,
    intl,
    run,
    selectedAttemptId,
    selectedRegionId,
  ]);
  const edges = useMemo(
    () =>
      definition.edges.map((edge, index) => {
        const port = "sourcePort" in edge ? edge.sourcePort : undefined;
        const condition = run?.routing?.conditionAttempts.find(
          (item) =>
            item.attemptId ===
            graphSelectedAttempt(
              run,
              edge.source,
              edge.source === selectedId ? selectedAttemptId : undefined,
            )?.attemptId,
        );
        const chosen = Boolean(port && condition?.selectedExit === port);
        const color = chosen ? "var(--color-foreground)" : "var(--color-foreground-subtlest)";
        return {
          ...edge,
          id: `graph-edge-${index}`,
          sourceHandle: port,
          label: port,
          style: {
            stroke: color,
            strokeWidth: chosen ? 3 : 1,
            opacity: condition?.selectedExit && !chosen ? 0.35 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      }),
    [definition.edges, run, selectedId, selectedAttemptId],
  );
  const selectCanvasNode = (id: string) =>
    id.startsWith("repair-group:") ? onSelectRegion?.(id.slice(13)) : onSelect(id);

  return (
    <div
      className="graph-engineering-canvas h-full min-h-80 overflow-hidden rounded-xl border border-border bg-background-alt"
      data-testid="graph-canvas"
    >
      <ReactFlow<CanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesConnectable={editable}
        nodesDraggable={!disabled}
        nodesFocusable
        elementsSelectable
        edgesReconnectable={editable}
        deleteKeyCode={null}
        fitView
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => selectCanvasNode(node.id)}
        onConnect={(connection) => {
          if (
            editable &&
            definition.version !== undefined &&
            connection.source &&
            connection.target
          )
            onChange(
              connectGraphNodes(
                definition,
                connection.source,
                connection.target,
                connection.sourceHandle ?? undefined,
              ),
            );
        }}
        onReconnect={(oldEdge, connection) => {
          if (
            !editable ||
            definition.version === undefined ||
            !connection.source ||
            !connection.target
          )
            return;
          const previous = definition.edges[edges.findIndex((edge) => edge.id === oldEdge.id)];
          onChange(
            connectGraphNodes(
              { ...definition, edges: definition.edges.filter((edge) => edge !== previous) },
              connection.source,
              connection.target,
              connection.sourceHandle ?? undefined,
            ),
          );
        }}
        onNodesChange={(changes) => {
          const selection = changes.find((change) => change.type === "select" && change.selected);
          if (selection?.type === "select") selectCanvasNode(selection.id);
          if (disabled) return;
          const positions = changes.filter(
            (change): change is NodePositionChange =>
              change.type === "position" && Boolean(change.position),
          );
          if (!positions.length) return;
          onChange({
            ...definition,
            nodes: definition.nodes.map((node) => {
              const changed = positions.find((change) => change.id === node.id);
              return changed?.position ? { ...node, position: changed.position } : node;
            }),
          } as GraphDefinition);
        }}
      >
        <Background color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
