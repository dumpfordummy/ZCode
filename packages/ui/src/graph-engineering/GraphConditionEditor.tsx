import { useState } from "react";
import type { GraphConditionNode } from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { parseGraphConditionDraft } from "./graphRoutingView.js";
import { useGraphEditorBuffer } from "@/hooks/useGraphEditorBuffer.js";
import { useGraphEditorText } from "./GraphEditorMode.js";
export function GraphConditionEditor({
  node,
  disabled,
  onChange,
  workspaceKey,
}: {
  node: GraphConditionNode;
  disabled: boolean;
  onChange(node: GraphConditionNode): void;
  workspaceKey: string;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  const inputs = useGraphEditorBuffer(
    workspaceKey,
    `${node.id}:condition-inputs`,
    JSON.stringify(node.inputs, null, 2),
  );
  const branches = useGraphEditorBuffer(
    workspaceKey,
    `${node.id}:condition-branches`,
    JSON.stringify(node.branches, null, 2),
  );
  const verification = useGraphEditorBuffer(
    workspaceKey,
    `${node.id}:condition-verification`,
    JSON.stringify(node.verification ?? null, null, 2),
  );
  const [error, setError] = useState("");
  const u = useGraphEditorText();
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-ui-sm">
        <span>{t("conditionName")}</span>
        <Input
          data-testid="graph-condition-name"
          value={node.name}
          disabled={disabled}
          onChange={(event) => onChange({ ...node, name: event.target.value })}
        />
      </label>
      <p className="text-ui-sm text-foreground-subtle">{t("conditionHelp")}</p>
      {[
        ["inputs", inputs.text, inputs.set],
        ["branches", branches.text, branches.set],
        ["verification", verification.text, verification.set],
      ].map(([key, value, setter]) => (
        <label key={key as string} className="block space-y-1 text-ui-sm">
          <span>{t(key as string)}</span>
          <Textarea
            data-testid={`graph-condition-${key}`}
            rows={6}
            className="font-mono text-ui-sm"
            value={value as string}
            disabled={disabled}
            onChange={(event) => (setter as (value: string) => void)(event.target.value)}
          />
        </label>
      ))}
      <label className="block space-y-1 text-ui-sm">
        <span>{t("defaultExit")}</span>
        <Input
          data-testid="graph-condition-default-exit"
          value={node.defaultExit}
          disabled={disabled}
          onChange={(event) => onChange({ ...node, defaultExit: event.target.value })}
        />
      </label>
      <p className="text-ui-sm">{t("errorPolicy")}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        data-testid="graph-condition-apply"
        onClick={() => {
          try {
            // Host 严格校验前先检查可渲染结构，避免错误 JSON 草稿破坏画布；这里不执行谓词。
            const draft = parseGraphConditionDraft(inputs.text, branches.text, verification.text);
            onChange({ ...node, ...draft, errorPolicy: "needs-human" });
            inputs.accept(JSON.stringify(draft.inputs, null, 2));
            branches.accept(JSON.stringify(draft.branches, null, 2));
            verification.accept(JSON.stringify(draft.verification ?? null, null, 2));
            setError("");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : t("structureError"));
          }
        }}
      >
        {t("applyCondition")}
      </Button>
      {error ? (
        <p role="alert" className="text-ui-sm text-destructive">
          {error}
        </p>
      ) : null}
      {[inputs, branches, verification].some((buffer) => buffer.conflict) ? (
        <p role="status" className="text-ui-sm text-warning">
          {u("bufferConflict")}
        </p>
      ) : null}
    </div>
  );
}
