import { applyGraphConditionPreset } from "@zcode/services";
import { useState } from "react";
import type {
  GraphConditionNode,
  GraphScalarConditionPreset,
  GraphSequentialDefinition,
} from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { Button } from "@/components/ui/button.js";
import { useGraphEditorBuffer } from "@/hooks/useGraphEditorBuffer.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphOpenAdvanced, useGraphEditorText } from "./GraphEditorMode.js";

export function GraphGuidedCondition({
  definition,
  node,
  disabled,
  workspaceKey,
  onChange,
}: {
  definition: GraphSequentialDefinition;
  node: GraphConditionNode;
  disabled: boolean;
  workspaceKey: string;
  onChange(value: GraphSequentialDefinition): void;
}) {
  const t = useGraphEditorText(),
    [selectedExit, setSelectedExit] = useState(node.branches[0]?.exit ?? "");
  const branch = node.branches.find((item) => item.exit === selectedExit) ?? node.branches[0],
    predicate = branch?.predicate;
  const scalar = predicate && "alias" in predicate ? predicate : undefined;
  const unsupported = !scalar;
  const initial = {
    alias: scalar?.alias ?? node.inputs[0]?.alias ?? "",
    pointer: scalar?.pointer ?? "",
    operator: scalar?.op ?? "eq",
    value: scalar && "value" in scalar ? JSON.stringify(scalar.value) : "true",
    exit: branch?.exit ?? "pass",
    defaultExit: node.defaultExit,
  };
  const buffer = useGraphEditorBuffer(
      workspaceKey,
      `${node.id}:guided-condition:${branch?.exit ?? "none"}`,
      JSON.stringify(initial),
    ),
    fields = JSON.parse(buffer.text) as typeof initial;
  const pending = useGraphDraftStore((state) =>
    ["inputs", "branches", "verification"].some((field) => {
      const value =
        state.workspaces[workspaceKey]?.editorBuffers?.[`${node.id}:condition-${field}`];
      return value && value.text !== value.base;
    }),
  );
  const change = (key: keyof typeof fields, value: string) =>
    buffer.set(JSON.stringify({ ...fields, [key]: value }));
  if (unsupported || pending)
    return (
      <div data-testid="graph-guided-unsupported" className="space-y-2 text-ui-sm">
        <p>{t(pending ? "bufferPending" : "advancedOnly")}</p>
        <p>{t("conditionHelp")}</p>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(
            {
              inputs: node.inputs,
              branches: node.branches,
              defaultExit: node.defaultExit,
              verification: node.verification,
            },
            null,
            2,
          )}
        </pre>
        <GraphOpenAdvanced workspaceKey={workspaceKey} />
      </div>
    );
  return (
    <div className="space-y-3" data-testid="graph-guided-condition">
      <p className="font-medium">{t("condition")}</p>
      <p className="text-ui-sm">{t("conditionHelp")}</p>
      <GraphSelect
        label={t("exit")}
        testId="graph-condition-preset-exit"
        value={branch!.exit}
        disabled={disabled}
        options={node.branches.map((item) => ({ value: item.exit, label: item.exit }))}
        onChange={setSelectedExit}
      />
      <GraphSelect
        label={t("alias")}
        testId="graph-condition-preset-alias"
        value={fields.alias || "none"}
        disabled={disabled}
        options={[
          { value: "none", label: t("alias") },
          ...node.inputs.map((input) => ({ value: input.alias, label: input.alias })),
        ]}
        onChange={(value) => change("alias", value === "none" ? "" : value)}
      />
      <GraphSelect
        label={t("operator")}
        testId="graph-condition-preset-operator"
        value={fields.operator}
        disabled={disabled}
        options={["eq", "neq", "gt", "gte", "lt", "lte", "present"].map((value) => ({
          value,
          label: t(`operator.${value}`),
        }))}
        onChange={(value) => change("operator", value)}
      />
      {(["pointer", "value", "defaultExit"] as const)
        .filter((key) => key !== "value" || fields.operator !== "present")
        .map((key) => (
          <label key={key} className="block space-y-1 text-ui-sm">
            <span>{t(key)}</span>
            <Input
              data-testid={`graph-condition-preset-${key}`}
              disabled={disabled}
              value={fields[key]}
              onChange={(event) => change(key, event.target.value)}
            />
          </label>
        ))}
      <Button
        size="sm"
        variant="outline"
        data-testid="graph-condition-preset-apply"
        disabled={disabled}
        onClick={() => {
          try {
            const edit: GraphScalarConditionPreset = {
              alias: fields.alias,
              pointer: fields.pointer,
              operator: fields.operator,
              ...(fields.operator !== "present" ? { value: JSON.parse(fields.value) } : {}),
              exit: fields.exit,
              defaultExit: fields.defaultExit,
            };
            onChange(applyGraphConditionPreset(definition, node.id, edit));
            buffer.accept(buffer.text);
          } catch (cause) {
            buffer.set(buffer.text, cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        {t("apply")}
      </Button>
      {buffer.error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {buffer.error}
        </p>
      ) : null}
      {buffer.conflict ? (
        <p role="status" className="text-ui-sm text-warning">
          {t("bufferConflict")}
        </p>
      ) : null}
      <GraphOpenAdvanced workspaceKey={workspaceKey} />
    </div>
  );
}
