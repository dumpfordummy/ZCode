import type { GraphDefinition } from "@zcode/services";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  appendGraphApproval,
  appendGraphCondition,
  appendGraphTask,
  appendGraphTool,
  upgradeGraphDefinition,
} from "./graphEditing.js";

import { upgradeGraphRouting } from "./graphRoutingView.js";

export function GraphAddNodes({
  definition,
  disabled,
  onChange,
  onSelect,
}: {
  definition: GraphDefinition;
  disabled: boolean;
  onChange: (definition: GraphDefinition) => void;
  onSelect: (id: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  if (definition.version === undefined)
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        data-testid="graph-upgrade"
        onClick={() => onChange(upgradeGraphDefinition(definition))}
      >
        {t("upgrade")}
      </Button>
    );
  return (
    <>
      {definition.version === 5 ? (
        <Button
          variant="outline"
          size="sm"
          disabled={
            disabled || definition.nodes.filter((node) => node.type === "condition").length >= 8
          }
          data-testid="graph-add-condition"
          onClick={() => {
            const id = crypto.randomUUID();
            onChange(appendGraphCondition(definition, id, t("z5.newCondition")));
            onSelect(id);
          }}
        >
          <Plus className="size-4" />
          {t("z5.addCondition")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="graph-upgrade-routing"
          onClick={() => onChange(upgradeGraphRouting(definition))}
        >
          {t("z5.upgrade")}
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={disabled || definition.nodes.filter((node) => node.type === "tool").length >= 8}
        data-testid="graph-add-tool"
        onClick={() => {
          const id = crypto.randomUUID();
          onChange(appendGraphTool(definition, id, t("z4.newTool")));
          onSelect(id);
        }}
      >
        <Plus className="size-4" />
        {t("z4.addTool")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || definition.nodes.filter((node) => node.type === "task").length >= 8}
        data-testid="graph-add-task"
        onClick={() => {
          const id = crypto.randomUUID();
          onChange(appendGraphTask(definition, id, t("newTask")));
          onSelect(id);
        }}
      >
        <Plus className="size-4" />
        {t("addTask")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={
          disabled || definition.nodes.filter((node) => node.type === "approval").length >= 8
        }
        data-testid="graph-add-approval"
        onClick={() => {
          const id = crypto.randomUUID();
          onChange(appendGraphApproval(definition, id, t("approval.newNode")));
          onSelect(id);
        }}
      >
        <Plus className="size-4" />
        {t("approval.addNode")}
      </Button>
    </>
  );
}
