import type {
  GraphNode,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphBindingSource } from "./GraphBindingSource.js";

export function GraphNodeBindings({
  node,
  definition,
  disabled,
  onChange,
}: {
  node: GraphTaskNode;
  definition: GraphSequentialDefinition;
  disabled: boolean;
  onChange(next: GraphNode): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  return (
    <div className="space-y-3" data-testid="graph-bindings">
      <p className="text-ui-sm text-foreground-subtle">{t("bindingHelp")}</p>
      {node.inputs.map((binding, index) => (
        <div
          key={index}
          className="space-y-2 rounded-lg border border-border p-2"
        >
          <Input
            aria-label={`${t("bindingAlias")} ${index + 1}`}
            data-testid={`graph-binding-alias-${index}`}
            value={binding.alias}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...node,
                inputs: node.inputs.map((item, offset) =>
                  offset === index
                    ? { ...item, alias: event.target.value }
                    : item,
                ),
              })
            }
          />
          <GraphBindingSource
            source={binding.source}
            definition={definition}
            disabled={disabled}
            testId={`graph-binding-source-${index}`}
            prefix={`binding-${index}`}
            onChange={(source) => {
              if (source.kind !== "source")
                onChange({
                  ...node,
                  inputs: node.inputs.map((item, offset) =>
                    offset === index ? { ...item, source } : item,
                  ),
                });
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            data-testid={`graph-binding-remove-${index}`}
            onClick={() =>
              onChange({
                ...node,
                inputs: node.inputs.filter((_, offset) => offset !== index),
              })
            }
          >
            {t("removeBinding")}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || node.inputs.length >= 16}
        data-testid="graph-add-binding"
        onClick={() =>
          onChange({
            ...node,
            inputs: [
              ...node.inputs,
              {
                alias: `input${node.inputs.length + 1}`,
                source: { kind: "start" },
              },
            ],
          })
        }
      >
        {t("addBinding")}
      </Button>
      <p className="text-ui-sm text-foreground-subtle">
        {t("untrustedHandoff")}
      </p>
    </div>
  );
}
