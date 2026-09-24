import { useState } from "react";
import type { GraphConditionNode } from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { parseGraphConditionDraft } from "./graphRoutingView.js";
export function GraphConditionEditor({
  node,
  disabled,
  onChange,
}: {
  node: GraphConditionNode;
  disabled: boolean;
  onChange(node: GraphConditionNode): void;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` });
  const [inputs, setInputs] = useState(JSON.stringify(node.inputs, null, 2)),
    [branches, setBranches] = useState(JSON.stringify(node.branches, null, 2)),
    [verification, setVerification] = useState(JSON.stringify(node.verification ?? null, null, 2)),
    [error, setError] = useState("");
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
        ["inputs", inputs, setInputs],
        ["branches", branches, setBranches],
        ["verification", verification, setVerification],
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
            const draft = parseGraphConditionDraft(inputs, branches, verification);
            onChange({ ...node, ...draft, errorPolicy: "needs-human" });
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
    </div>
  );
}
