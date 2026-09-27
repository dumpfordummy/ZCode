import type { GraphTaskNode } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { GraphSelect } from "./GraphSelect.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphEditorBuffer } from "@/hooks/useGraphEditorBuffer.js";
import { useGraphEditorText } from "./GraphEditorMode.js";

const starter = {
  type: "object" as const,
  properties: { summary: { type: "string" as const } },
  required: ["summary"],
  additionalProperties: false as const,
};
export function GraphStructuredOutput({
  node,
  disabled,
  onChange,
  workspaceKey,
}: {
  node: GraphTaskNode;
  disabled: boolean;
  onChange: (node: GraphTaskNode) => void;
  workspaceKey: string;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const buffer = useGraphEditorBuffer(
      workspaceKey,
      `${node.id}:schema`,
      JSON.stringify(node.output?.schema ?? starter, null, 2),
    ),
    u = useGraphEditorText();
  const draft = buffer.text,
    error = buffer.error;
  return (
    <div className="space-y-2">
      <GraphSelect
        label={t("outputMode")}
        testId="graph-output-mode"
        value={node.output ? "json" : "text"}
        disabled={disabled}
        options={[
          { value: "text", label: t("textOutput") },
          { value: "json", label: t("jsonOutput") },
        ]}
        onChange={(value) => {
          onChange({
            ...node,
            output: value === "json" ? { kind: "json", schema: starter } : undefined,
          });
        }}
      />
      {node.output ? (
        <>
          <p className="text-ui-sm text-foreground-subtle">{t("schemaHelp")}</p>
          <Textarea
            aria-label={t("schema")}
            data-testid="graph-output-schema"
            rows={8}
            value={draft}
            disabled={disabled}
            onChange={(event) => buffer.set(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-apply-schema"
            disabled={disabled}
            onClick={() => {
              try {
                const schema: unknown = JSON.parse(draft);
                if (!schema || typeof schema !== "object" || Array.isArray(schema))
                  throw new Error(t("schemaObject"));
                onChange({
                  ...node,
                  output: {
                    kind: "json",
                    schema: schema as NonNullable<GraphTaskNode["output"]>["schema"],
                  },
                });
                buffer.accept(JSON.stringify(schema, null, 2));
              } catch (cause) {
                buffer.set(draft, cause instanceof Error ? cause.message : String(cause));
              }
            }}
          >
            {t("applySchema")}
          </Button>
          {error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
          {buffer.conflict ? (
            <p role="status" className="text-ui-sm text-warning">
              {u("bufferConflict")}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
