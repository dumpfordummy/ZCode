import type { GraphNativeSettings, GraphNode, GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphNodeConfiguration } from "./GraphNodeConfiguration.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphBindingSource } from "./GraphBindingSource.js";
import { GraphStructuredOutput } from "./GraphStructuredOutput.js";
import { GraphToolEditor } from "./GraphToolEditor.js";
import type { GraphRecipeSnapshot } from "@zcode/services";
import { GraphConditionEditor } from "./GraphConditionEditor.js";
import { GraphApprovalEditor } from "./GraphApprovalEditor.js";
import { connectGraphNodes, updateGraphNode } from "./graphEditing.js";
import { useGraphEditorMode } from "./GraphEditorMode.js";
import { GraphGuidedTask } from "./GraphGuidedTask.js";
import { GraphDeleteNode } from "./GraphDeleteNode.js";
import { GraphGuidedCondition } from "./GraphGuidedCondition.js";
import { GraphReferenceBindings } from "./GraphReferenceBindings.js";

export function GraphNodeInspector({
  definition,
  node,
  onChange,
  disabled,
  defaults,
  workspacePath,
  workspaceIdentity,
  recipes,
}: {
  definition: GraphSequentialDefinition;
  node: GraphNode;
  onChange: (definition: GraphSequentialDefinition) => void;
  disabled: boolean;
  defaults: GraphNativeSettings | null;
  workspacePath: string;
  workspaceIdentity?: string;
  recipes: GraphRecipeSnapshot | null;
}) {
  const { intl } = useZCodeIntl();
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const editorMode = useGraphEditorMode(workspaceKey);
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const update = (next: GraphNode) => {
    if (!disabled) onChange(updateGraphNode(definition, next));
  };
  const outputs = definition.nodes.filter((item) => item.type === "task" || item.type === "tool");
  const label = (item: GraphNode) =>
    item.type === "task" ||
    item.type === "approval" ||
    item.type === "tool" ||
    item.type === "condition"
      ? item.name
      : t(`node.${item.type}`);
  return (
    <section className="space-y-4" data-testid="graph-node-inspector" data-node-id={node.id}>
      <h3 className="text-ui-base font-medium">{label(node)}</h3>
      <p className="break-all font-mono text-ui-xs text-foreground-subtlest">{node.id}</p>
      {definition.template ? (
        <GraphReferenceBindings
          key={`references:${node.id}`}
          contextKey={JSON.stringify(definition)}
          target={{ workspacePath, workspaceIdentity }}
          roles={definition.template.references.filter((reference) =>
            reference.nodeIds.includes(node.id),
          )}
          bindings={definition.template.bindings}
          disabled={disabled}
          onChange={(bindings) =>
            onChange({ ...definition, template: { ...definition.template!, bindings } })
          }
        />
      ) : null}
      {/* 原生回归复现条件编辑器与删除控件共用 node ID key 后遗留重复表单；同级 key 必须同时区分角色和节点。 */}
      {node.type === "condition" ? (
        editorMode === "advanced" ? (
          <GraphConditionEditor
            key={`condition-advanced:${node.id}`}
            {...{ node, disabled, workspaceKey }}
            onChange={update}
          />
        ) : (
          <GraphGuidedCondition
            key={`condition-guided:${node.id}`}
            {...{ node, definition, disabled, workspaceKey, onChange }}
          />
        )
      ) : null}
      {node.type === "approval" ? (
        <GraphApprovalEditor {...{ node, definition, disabled }} onChange={update} />
      ) : null}
      {node.type === "tool" ? (
        <GraphToolEditor {...{ node, disabled, recipes }} onChange={update} />
      ) : null}
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
            ...outputs.map((task) => ({ value: task.id, label: task.name })),
            ...(node.outputNodeId && !outputs.some((task) => task.id === node.outputNodeId)
              ? [{ value: node.outputNodeId, label: `${t("missingSource")}: ${node.outputNodeId}` }]
              : []),
          ]}
          onChange={(value) => update({ ...node, outputNodeId: value === "none" ? null : value })}
        />
      ) : null}
      {node.type === "task" && editorMode === "guided" ? (
        <>
          <GraphGuidedTask
            key={`task-guided:${node.id}`}
            {...{ definition, node, disabled, recipes, workspaceKey, onChange }}
          />
          <GraphNodeConfiguration
            key={`settings:${node.id}`}
            {...{ workspacePath, workspaceIdentity, defaults, disabled, node }}
            onChange={update}
          />
        </>
      ) : null}
      {node.type === "task" && editorMode === "advanced" ? (
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
                  <GraphBindingSource
                    source={binding.source}
                    definition={definition}
                    disabled={disabled}
                    testId={`graph-binding-source-${index}`}
                    prefix={`binding-${index}`}
                    onChange={(source) => {
                      if (source.kind !== "source")
                        update({
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
          {/* 同级编辑器不能复用 key；原生回归显示重复 key 会在切换节点后遗留输出面板。 */}
          <GraphStructuredOutput
            key={`output:${node.id}`}
            {...{ node, disabled, workspaceKey }}
            onChange={update}
          />
          <GraphNodeConfiguration
            key={`settings:${node.id}`}
            {...{ workspacePath, workspaceIdentity, defaults, disabled }}
            node={node}
            onChange={update}
          />
        </>
      ) : null}
      {node.type === "condition"
        ? [...new Set([...node.branches.map((branch) => branch.exit), node.defaultExit])].map(
            (exit) => (
              <GraphSelect
                key={exit}
                label={`${t("z5.exit")}: ${exit}`}
                testId={`graph-next-node-${node.id}-${exit}`}
                disabled={disabled}
                value={
                  definition.edges.find(
                    (edge) => edge.source === node.id && edge.sourcePort === exit,
                  )?.target ?? "none"
                }
                options={[
                  { value: "none", label: t("disconnected") },
                  ...definition.nodes
                    .filter((item) => item.id !== node.id && item.type !== "start")
                    .map((item) => ({ value: item.id, label: label(item) })),
                ]}
                onChange={(value) =>
                  onChange(
                    connectGraphNodes(definition, node.id, value === "none" ? null : value, exit),
                  )
                }
              />
            ),
          )
        : null}
      {node.type !== "end" && node.type !== "condition" ? (
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
      {node.type === "task" ||
      node.type === "approval" ||
      node.type === "tool" ||
      node.type === "condition" ? (
        <GraphDeleteNode key={`delete:${node.id}`} {...{ definition, node, disabled, onChange }} />
      ) : null}
    </section>
  );
}
