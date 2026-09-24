import { useState } from "react";
import type { GraphTaskNode } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { GraphSelect } from "./GraphSelect.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

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
}: {
  node: GraphTaskNode;
  disabled: boolean;
  onChange: (node: GraphTaskNode) => void;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const [draft, setDraft] = useState(JSON.stringify(node.output?.schema ?? starter, null, 2)),
    [error, setError] = useState("");
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
          setError("");
          onChange({
            ...node,
            output: value === "json" ? { kind: "json", schema: starter } : undefined,
          });
          setDraft(JSON.stringify(starter, null, 2));
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
            onChange={(event) => setDraft(event.target.value)}
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
                setError("");
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause));
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
        </>
      ) : null}
    </div>
  );
}
