import type {
  GraphNativeSettings,
  GraphNode,
  GraphSequentialDefinition,
  GraphTaskNode,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphNodeConfiguration } from "./GraphNodeConfiguration.js";
import { GraphSelect } from "./GraphSelect.js";
import { connectGraphNodes, removeGraphTask } from "./graphEditing.js";

export function GraphNodeInspector({
  definition,
  node,
  onChange,
  disabled,
  defaults,
  workspacePath,
  workspaceIdentity,
}: {
  definition: GraphSequentialDefinition;
  node: GraphNode;
  onChange: (definition: GraphSequentialDefinition) => void;
  disabled: boolean;
  defaults: GraphNativeSettings | null;
  workspacePath: string;
  workspaceIdentity?: string;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const update = (next: GraphNode) => {
    if (!disabled)
      onChange({
        ...definition,
        nodes: definition.nodes.map((current) => (current.id === next.id ? next : current)),
      });
  };
  const tasks = definition.nodes.filter((item): item is GraphTaskNode => item.type === "task");
  const label = (item: GraphNode) => (item.type === "task" ? item.name : t(`node.${item.type}`));
  return (
    <section className="space-y-4" data-testid="graph-node-inspector" data-node-id={node.id}>
      <h3 className="text-ui-base font-medium">{label(node)}</h3>
      <p className="break-all font-mono text-ui-xs text-foreground-subtlest">{node.id}</p>
      {node.type === "start" ? (
        <label className="block space-y-1 text-ui-sm text-foreground-subtle">
          <span>{t("startInput")}</span>
          <Textarea
            data-testid="graph-start-input"
            aria-label={t("startInput")}
            rows={8}
            value={node.request}
            disabled={disabled}
            onChange={(event) => update({ ...node, request: event.target.value })}
          />
          <span>{t("startHelp")}</span>
        </label>
      ) : null}
      {node.type === "end" ? (
        <GraphSelect
          label={t("endOutput")}
          testId="graph-end-output"
          value={node.outputNodeId ?? "none"}
          disabled={disabled}
          options={[
            { value: "none", label: t("selectOutput") },
            ...tasks.map((task) => ({ value: task.id, label: task.name })),
            ...(node.outputNodeId && !tasks.some((task) => task.id === node.outputNodeId)
              ? [{ value: node.outputNodeId, label: `${t("missingSource")}: ${node.outputNodeId}` }]
              : []),
          ]}
          onChange={(value) => update({ ...node, outputNodeId: value === "none" ? null : value })}
        />
      ) : null}
      {node.type === "task" ? (
        <>
          <label className="block space-y-1 text-ui-sm text-foreground-subtle">
            <span>{t("taskName")}</span>
            <Input
              data-testid="graph-node-name"
              aria-label={t("taskName")}
              value={node.name}
              disabled={disabled}
              onChange={(event) => update({ ...node, name: event.target.value })}
            />
          </label>
          <GraphSelect
            label={t("instructionMode")}
            testId="graph-instruction-mode"
            value={node.instructionMode}
            disabled={disabled}
            options={[
              { value: "literal", label: t("literal") },
              { value: "bound", label: t("bound") },
            ]}
            onChange={(value) =>
              update({ ...node, instructionMode: value === "bound" ? "bound" : "literal" })
            }
          />
          <label className="block space-y-1 text-ui-sm text-foreground-subtle">
            <span>{t("instructions")}</span>
            <Textarea
              data-testid="graph-instructions"
              aria-label={t("instructions")}
              rows={8}
              value={node.instructions}
              disabled={disabled}
              onChange={(event) => update({ ...node, instructions: event.target.value })}
            />
          </label>
          {node.instructionMode === "bound" ? (
            <div className="space-y-3" data-testid="graph-bindings">
              <p className="text-ui-sm text-foreground-subtle">{t("bindingHelp")}</p>
              {node.inputs.map((binding, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border p-2">
                  <Input
                    aria-label={`${t("bindingAlias")} ${index + 1}`}
                    data-testid={`graph-binding-alias-${index}`}
                    value={binding.alias}
                    disabled={disabled}
                    onChange={(event) =>
                      update({
                        ...node,
                        inputs: node.inputs.map((item, offset) =>
                          offset === index ? { ...item, alias: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  <GraphSelect
                    label={t("bindingSource")}
                    testId={`graph-binding-source-${index}`}
                    disabled={disabled}
                    value={
                      binding.source.kind === "start" ? "start" : `node:${binding.source.nodeId}`
                    }
                    options={[
                      { value: "start", label: t("startInput") },
                      ...tasks.map((task) => ({ value: `node:${task.id}`, label: task.name })),
                      ...(binding.source.kind === "node" &&
                      !tasks.some(
                        (task) =>
                          binding.source.kind === "node" && task.id === binding.source.nodeId,
                      )
                        ? [
                            {
                              value: `node:${binding.source.nodeId}`,
                              label: `${t("missingSource")}: ${binding.source.nodeId}`,
                            },
                          ]
                        : []),
                    ]}
                    onChange={(value) =>
                      update({
                        ...node,
                        inputs: node.inputs.map((item, offset) =>
                          offset === index
                            ? {
                                ...item,
                                source:
                                  value === "start"
                                    ? { kind: "start" }
                                    : { kind: "node", nodeId: value.slice(5) },
                              }
                            : item,
                        ),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    data-testid={`graph-binding-remove-${index}`}
                    onClick={() =>
                      update({
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
                  update({
                    ...node,
                    inputs: [
                      ...node.inputs,
                      { alias: `input${node.inputs.length + 1}`, source: { kind: "start" } },
                    ],
                  })
                }
              >
                {t("addBinding")}
              </Button>
              <p className="text-ui-sm text-foreground-subtle">{t("untrustedHandoff")}</p>
            </div>
          ) : (
            <p className="text-ui-sm text-foreground-subtle">{t("literalHelp")}</p>
          )}
          <GraphNodeConfiguration
            key={node.id}
            {...{ workspacePath, workspaceIdentity, defaults, disabled }}
            node={node}
            onChange={update}
          />
        </>
      ) : null}
      {node.type !== "end" ? (
        <GraphSelect
          label={t("nextNode")}
          testId={`graph-next-node-${node.id}`}
          disabled={disabled}
          value={definition.edges.find((edge) => edge.source === node.id)?.target ?? "none"}
          options={[
            { value: "none", label: t("disconnected") },
            ...definition.nodes
              .filter((item) => item.id !== node.id && item.type !== "start")
              .map((item) => ({ value: item.id, label: label(item) })),
          ]}
          onChange={(value) =>
            onChange(connectGraphNodes(definition, node.id, value === "none" ? null : value))
          }
        />
      ) : null}
      {node.type === "task" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="graph-delete-node"
          onClick={() => onChange(removeGraphTask(definition, node.id))}
        >
          {t("deleteNode")}
        </Button>
      ) : null}
    </section>
  );
}
