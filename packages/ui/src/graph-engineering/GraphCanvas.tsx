import { memo, useMemo } from "react";
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
import type { GraphDefinition, GraphNodeAttempt } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { connectGraphNodes } from "./graphEditing.js";
import "@xyflow/react/dist/style.css";
import "./GraphCanvas.css";

type CanvasNode = Node<
  { label: string; kind: "start" | "task" | "end"; status?: string; editable: boolean },
  "graph"
>;
const GraphNode = memo(function GraphNode({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <div
      className={`min-w-32 max-w-64 rounded-lg border bg-card px-4 py-3 text-ui-base text-foreground ${selected ? "border-input-border-focused" : "border-card-border"}`}
    >
      {data.kind !== "start" ? (
        <Handle type="target" position={Position.Left} isConnectable={data.editable} />
      ) : null}
      <span className="block break-words font-medium">{data.label}</span>
      {data.status ? (
        <span className="mt-1 block text-ui-sm text-foreground-subtle">{data.status}</span>
      ) : null}
      {data.kind !== "end" ? (
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
}: {
  definition: GraphDefinition;
  onChange: (definition: GraphDefinition) => void;
  disabled: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  attempts?: GraphNodeAttempt[];
}) {
  const { intl } = useZCodeIntl();
  const editable = !disabled && definition.version === 2;
  const nodes = useMemo<CanvasNode[]>(
    () =>
      definition.nodes.map((node) => {
        const attempt = attempts?.find((candidate) => candidate.nodeId === node.id);
        return {
          id: node.id,
          type: "graph",
          position: node.position,
          selected: node.id === selectedId,
          data: {
            kind: node.type,
            editable,
            label:
              node.type === "task"
                ? "name" in node
                  ? node.name
                  : definition.version !== 2
                    ? definition.taskName
                    : ""
                : intl.formatMessage({ id: `graph.node.${node.type}` }),
            status: attempt
              ? intl.formatMessage({ id: `graph.status.${attempt.status}` })
              : undefined,
          },
        };
      }),
    [definition, selectedId, attempts, editable, intl],
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
        onNodeClick={(_, node) => onSelect(node.id)}
        onConnect={(connection) => {
          if (editable && definition.version === 2 && connection.source && connection.target)
            onChange(connectGraphNodes(definition, connection.source, connection.target));
        }}
        onReconnect={(oldEdge, connection) => {
          if (!editable || definition.version !== 2 || !connection.source || !connection.target)
            return;
          const previous = definition.edges[edges.findIndex((edge) => edge.id === oldEdge.id)];
          onChange(
            connectGraphNodes(
              { ...definition, edges: definition.edges.filter((edge) => edge !== previous) },
              connection.source,
              connection.target,
            ),
          );
        }}
        onNodesChange={(changes) => {
          const selection = changes.find((change) => change.type === "select" && change.selected);
          if (selection?.type === "select") onSelect(selection.id);
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
