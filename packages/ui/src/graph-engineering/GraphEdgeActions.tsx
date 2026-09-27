import { useState } from "react";
import type { GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { GraphSelect } from "./GraphSelect.js";
import { graphEdgeKey, insertGraphTaskOnEdge } from "./graphEditorGuidance.js";
import { useGraphEditorText } from "./GraphEditorMode.js";

export function GraphEdgeActions({
  definition,
  selected,
  disabled,
  onSelect,
  onChange,
  onSelectNode,
}: {
  definition: GraphSequentialDefinition;
  selected?: string;
  disabled: boolean;
  onSelect(value: string): void;
  onChange(value: GraphSequentialDefinition): void;
  onSelectNode(id: string): void;
}) {
  const t = useGraphEditorText(),
    [error, setError] = useState("");
  const edge = definition.edges.find((item) => graphEdgeKey(item) === selected);
  const label = (id: string) => {
    const node = definition.nodes.find((item) => item.id === id);
    return node && "name" in node ? node.name : id;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <GraphSelect
          label={t("edge")}
          testId="graph-edge-select"
          value={edge ? selected! : "none"}
          disabled={disabled}
          options={[
            { value: "none", label: t("selectEdge") },
            ...definition.edges.map((item) => ({
              value: graphEdgeKey(item),
              label: `${label(item.source)}${item.sourcePort ? ` (${item.sourcePort})` : ""} → ${label(item.target)}`,
            })),
          ]}
          onChange={onSelect}
        />
        <Button
          data-testid="graph-insert-on-edge"
          disabled={disabled || !edge}
          variant="outline"
          size="sm"
          onClick={() => {
            if (!edge) return;
            try {
              const id = crypto.randomUUID();
              const next = insertGraphTaskOnEdge(definition, edge, id, t("newTask"));
              onChange(next);
              onSelectNode(id);
              onSelect("none");
              setError("");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
        >
          {t("insert")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
