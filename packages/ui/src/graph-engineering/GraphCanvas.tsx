import { memo, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type NodePositionChange,
} from "@xyflow/react";
import type { GraphDefinition } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import "@xyflow/react/dist/style.css";
import "./GraphCanvas.css";

type CanvasNode = Node<{ label: string; kind: "start" | "task" | "end" }, "graph">;

const GraphNode = memo(function GraphNode({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div
      className={`min-w-32 max-w-64 rounded-lg border bg-card px-4 py-3 text-ui-base text-foreground ${selected ? "border-input-border-focused" : "border-card-border"}`}
    >
      {data.kind !== "start" ? (
        <Handle type="target" position={Position.Left} isConnectable={false} />
      ) : null}
      <span className="block break-words font-medium">{data.label}</span>
      {data.kind !== "end" ? (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      ) : null}
    </div>
  );
});
const nodeTypes = { graph: GraphNode };

export function GraphCanvas({
  definition,
  onChange,
  disabled,
}: {
  definition: GraphDefinition;
  onChange: (definition: GraphDefinition) => void;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodes = useMemo<CanvasNode[]>(
    () =>
      definition.nodes.map((node) => ({
        id: node.id,
        type: "graph",
        position: node.position,
        selected: node.id === selectedId,
        data: {
          kind: node.type,
          label:
            node.type === "task"
              ? definition.taskName
              : intl.formatMessage({ id: `graph.node.${node.type}` }),
        },
      })),
    [definition.nodes, definition.taskName, intl, selectedId],
  );
  const edges = useMemo(
    () =>
      definition.edges.map((edge, index) => ({
        ...edge,
        id: `graph-edge-${index}`,
        style: { stroke: "var(--color-foreground-subtlest)" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-foreground-subtlest)" },
      })),
    [definition.edges],
  );
  return (
    <div
      className="graph-engineering-canvas h-64 min-h-64 overflow-hidden rounded-xl border border-border bg-background-alt"
      data-testid="graph-canvas"
    >
      <ReactFlow<CanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        nodesDraggable={!disabled}
        nodesFocusable={!disabled}
        elementsSelectable={!disabled}
        edgesReconnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: false }}
        onNodesChange={(changes) => {
          if (disabled) return;
          const selection = changes.find((change) => change.type === "select" && change.selected);
          if (selection?.type === "select") setSelectedId(selection.id);
          const positions = changes.filter(
            (change): change is NodePositionChange =>
              change.type === "position" && Boolean(change.position),
          );
          if (!positions.length) return;
          onChange({
            ...definition,
            nodes: definition.nodes.map((node) => {
              const changed = positions.find((change) => change.id === node.id);
              return changed?.type === "position" && changed.position
                ? { ...node, position: changed.position }
                : node;
            }),
          });
        }}
      >
        <Background color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
