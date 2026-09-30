import { useEffect, useState } from "react";
import type {
  GraphNativeSettings,
  GraphNode,
  GraphRecipeSnapshot,
  GraphSequentialDefinition,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { GraphTab, GraphTabList, GraphTabPanel, GraphTabs } from "./GraphTabs.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphNodeBindings } from "./GraphNodeBindings.js";
import { GraphNodeConfiguration } from "./GraphNodeConfiguration.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphStructuredOutput } from "./GraphStructuredOutput.js";
import { GraphToolEditor } from "./GraphToolEditor.js";
import { GraphConditionEditor } from "./GraphConditionEditor.js";
import { GraphApprovalEditor } from "./GraphApprovalEditor.js";
import { connectGraphNodes, updateGraphNode } from "./graphEditing.js";
import { useGraphEditorMode, useGraphEditorText } from "./GraphEditorMode.js";
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
  const et = useGraphEditorText();
  const workspaceKey = workspaceIdentity?.trim() || workspacePath;
  const editorMode = useGraphEditorMode(workspaceKey);
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const [activeTab, setActiveTab] = useState("task");
  const update = (next: GraphNode) => {
    if (!disabled) onChange(updateGraphNode(definition, next));
  };
  const outputs = definition.nodes.filter(
    (item) => item.type === "task" || item.type === "tool",
  );
  const label = (item: GraphNode) =>
    item.type === "task" ||
    item.type === "approval" ||
    item.type === "tool" ||
    item.type === "condition"
      ? item.name
      : t(`node.${item.type}`);
  const isTask = node.type === "task";
  const isTaskAdvanced = isTask && editorMode === "advanced";
  const isTaskGuided = isTask && editorMode === "guided";
  const showInputsTab = isTaskAdvanced && node.instructionMode === "bound";
  const showOutputTab = isTaskAdvanced;
  // 标签页可能因编辑器模式或节点类型切换而消失（例如从高级切到引导模式时 Output/Inputs 标签不再渲染）。
  // 此时需要将活动标签重置为 Task，避免用户看到空白检查器。
  useEffect(() => {
    if (activeTab === "inputs" && !showInputsTab) setActiveTab("task");
    else if (activeTab === "output" && !showOutputTab) setActiveTab("task");
  }, [activeTab, showInputsTab, showOutputTab]);

  return (
    <section
      className="space-y-3"
      data-testid="graph-node-inspector"
      data-node-id={node.id}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ui-base font-medium">{label(node)}</h3>
        {/* 有效设置的简明摘要与编辑入口，始终可见 */}
        {isTask || node.type === "approval" || node.type === "tool" ? (
          <Button
            size="sm"
            variant="ghost"
            data-testid="graph-editor-open-advanced"
            onClick={() => setActiveTab("advanced")}
          >
            {et("effectiveSettings")} · {et("editSettings")}
          </Button>
        ) : null}
      </div>

      <GraphTabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <GraphTabList>
          <GraphTab value="task" data-testid="graph-inspector-tab-task">
            {et("tab.task")}
          </GraphTab>
          {showInputsTab ? (
            <GraphTab
              value="inputs"
              data-testid="graph-inspector-tab-inputs"
            >
              {et("tab.inputs")}
            </GraphTab>
          ) : null}
          {showOutputTab ? (
            <GraphTab
              value="output"
              data-testid="graph-inspector-tab-output"
            >
              {et("tab.output")}
            </GraphTab>
          ) : null}
          <GraphTab
            value="advanced"
            data-testid="graph-inspector-tab-advanced"
          >
            {et("tab.advanced")}
          </GraphTab>
        </GraphTabList>

        {/* Task 标签：主要编辑内容 */}
        <GraphTabPanel value="task" className="space-y-3">
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
                onChange({
                  ...definition,
                  template: { ...definition.template!, bindings },
                })
              }
            />
          ) : null}
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
            <GraphApprovalEditor
              {...{ node, definition, disabled }}
              onChange={update}
            />
          ) : null}
          {node.type === "tool" ? (
            <GraphToolEditor
              {...{ node, disabled, recipes }}
              onChange={update}
            />
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
                onChange={(event) =>
                  update({ ...node, request: event.target.value })
                }
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
                ...outputs.map((task) => ({
                  value: task.id,
                  label: task.name,
                })),
                ...(node.outputNodeId &&
                !outputs.some((task) => task.id === node.outputNodeId)
                  ? [
                      {
                        value: node.outputNodeId,
                        label: `${t("missingSource")}: ${node.outputNodeId}`,
                      },
                    ]
                  : []),
              ]}
              onChange={(value) =>
                update({
                  ...node,
                  outputNodeId: value === "none" ? null : value,
                })
              }
            />
          ) : null}
          {isTaskGuided ? (
            <GraphGuidedTask
              key={`task-guided:${node.id}`}
              {...{
                definition,
                node,
                disabled,
                recipes,
                workspaceKey,
                onChange,
              }}
            />
          ) : null}
          {isTaskAdvanced ? (
            <>
              <label className="block space-y-1 text-ui-sm text-foreground-subtle">
                <span>{t("taskName")}</span>
                <Input
                  data-testid="graph-node-name"
                  aria-label={t("taskName")}
                  value={node.name}
                  disabled={disabled}
                  onChange={(event) =>
                    update({ ...node, name: event.target.value })
                  }
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
                  update({
                    ...node,
                    instructionMode: value === "bound" ? "bound" : "literal",
                  })
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
                  onChange={(event) =>
                    update({ ...node, instructions: event.target.value })
                  }
                />
              </label>
            </>
          ) : null}
          {node.type === "condition"
            ? [
                ...new Set([
                  ...node.branches.map((branch) => branch.exit),
                  node.defaultExit,
                ]),
              ].map((exit) => (
                <GraphSelect
                  key={exit}
                  label={`${t("z5.exit")}: ${exit}`}
                  testId={`graph-next-node-${node.id}-${exit}`}
                  disabled={disabled}
                  value={
                    definition.edges.find(
                      (edge) =>
                        edge.source === node.id && edge.sourcePort === exit,
                    )?.target ?? "none"
                  }
                  options={[
                    { value: "none", label: t("disconnected") },
                    ...definition.nodes
                      .filter(
                        (item) => item.id !== node.id && item.type !== "start",
                      )
                      .map((item) => ({ value: item.id, label: label(item) })),
                  ]}
                  onChange={(value) =>
                    onChange(
                      connectGraphNodes(
                        definition,
                        node.id,
                        value === "none" ? null : value,
                        exit,
                      ),
                    )
                  }
                />
              ))
            : null}
          {node.type !== "end" && node.type !== "condition" ? (
            <GraphSelect
              label={t("nextNode")}
              testId={`graph-next-node-${node.id}`}
              disabled={disabled}
              value={
                definition.edges.find((edge) => edge.source === node.id)
                  ?.target ?? "none"
              }
              options={[
                { value: "none", label: t("disconnected") },
                ...definition.nodes
                  .filter(
                    (item) => item.id !== node.id && item.type !== "start",
                  )
                  .map((item) => ({ value: item.id, label: label(item) })),
              ]}
              onChange={(value) =>
                onChange(
                  connectGraphNodes(
                    definition,
                    node.id,
                    value === "none" ? null : value,
                  ),
                )
              }
            />
          ) : null}
          {/* 删除节点控件：始终在 Task 标签可见，避免需要切换到 Advanced 标签才能删除。 */}
          {node.type === "task" ||
          node.type === "approval" ||
          node.type === "tool" ||
          node.type === "condition" ? (
            <GraphDeleteNode
              key={`delete:${node.id}`}
              {...{ definition, node, disabled, onChange }}
            />
          ) : null}
        </GraphTabPanel>

        {/* Inputs 标签：绑定（仅高级模式 bound 指令） */}
        {showInputsTab && isTask ? (
          <GraphTabPanel value="inputs" className="space-y-3">
            <GraphNodeBindings
              node={node}
              definition={definition}
              disabled={disabled}
              onChange={update}
            />
          </GraphTabPanel>
        ) : null}

        {/* Output 标签：结构化输出（仅高级模式 task） */}
        {showOutputTab ? (
          <GraphTabPanel value="output" className="space-y-3">
            <GraphStructuredOutput
              key={`output:${node.id}`}
              {...{ node, disabled, workspaceKey }}
              onChange={update}
            />
          </GraphTabPanel>
        ) : null}

        {/* Advanced 标签：模型/运行配置、技术标识、删除 */}
        <GraphTabPanel value="advanced" className="space-y-3">
          {isTask && defaults ? (
            <GraphNodeConfiguration
              key={`settings:${node.id}`}
              {...{ workspacePath, workspaceIdentity, defaults, disabled }}
              node={node}
              onChange={update}
            />
          ) : null}
          <div className="text-ui-xs text-foreground-subtlest">
            <p className="break-all font-mono">{node.id}</p>
          </div>
          {isTask && node.instructionMode === "literal" ? (
            <p className="text-ui-sm text-foreground-subtle">
              {t("literalHelp")}
            </p>
          ) : null}
        </GraphTabPanel>
      </GraphTabs>
    </section>
  );
}
