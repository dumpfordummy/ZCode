import type { GraphDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { graphNodeLabel } from "./graphEditing.js";

export function GraphNodeNavigation({
  definition,
  selectedNodeId,
  regionId,
  onSelect,
  onSelectRegion,
}: {
  definition: GraphDefinition;
  selectedNodeId?: string;
  regionId?: string;
  onSelect(id: string): void;
  onSelectRegion(id: string): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.${key}` });
  const region = definition.version === 5 ? definition.routing?.region : undefined;
  return (
    <div
      className="flex max-h-20 shrink-0 flex-wrap gap-1 overflow-auto"
      aria-label={t("selectNode")}
    >
      {region ? (
        <Button
          size="sm"
          variant={regionId ? "secondary" : "ghost"}
          data-testid="graph-region-select"
          onClick={() => onSelectRegion(region.id)}
        >
          {region.name}
        </Button>
      ) : null}
      {definition.nodes.map((node) => (
        <Button
          key={node.id}
          size="sm"
          variant={node.id === selectedNodeId ? "secondary" : "ghost"}
          data-testid={`graph-select-node-${node.id}`}
          onClick={() => onSelect(node.id)}
        >
          {graphNodeLabel(node, definition, t)}
        </Button>
      ))}
    </div>
  );
}
