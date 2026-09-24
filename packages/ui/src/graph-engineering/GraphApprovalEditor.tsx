import type { GraphApprovalNode, GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphBindingSource } from "./GraphBindingSource.js";
import { GraphSelect } from "./GraphSelect.js";

export function GraphApprovalEditor({
  node,
  definition,
  disabled,
  onChange,
}: {
  node: GraphApprovalNode;
  definition: GraphSequentialDefinition;
  disabled: boolean;
  onChange: (node: GraphApprovalNode) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.approval.${id}` });
  return (
    <div className="space-y-3">
      <p className="text-ui-sm text-foreground-subtle">{t("controlMeaning")}</p>
      <label className="block space-y-1 text-ui-sm">
        <span>{t("title")}</span>
        <Input
          value={node.name}
          disabled={disabled}
          data-testid="graph-approval-name"
          onChange={(event) => onChange({ ...node, name: event.target.value })}
        />
      </label>
      <label className="block space-y-1 text-ui-sm">
        <span>{t("reviewInstructions")}</span>
        <Textarea
          value={node.reviewInstructions}
          rows={6}
          disabled={disabled}
          data-testid="graph-approval-instructions"
          onChange={(event) => onChange({ ...node, reviewInstructions: event.target.value })}
        />
      </label>
      <GraphSelect
        label={t("commentPolicy")}
        value={node.commentPolicy}
        disabled={disabled}
        testId="graph-approval-comment-policy"
        options={[
          { value: "optional", label: t("commentOptional") },
          { value: "required", label: t("commentRequired") },
        ]}
        onChange={(value) =>
          onChange({ ...node, commentPolicy: value === "required" ? "required" : "optional" })
        }
      />
      <h4 className="text-ui-sm font-medium">{t("evidenceBindings")}</h4>
      <p className="text-ui-sm text-foreground-subtle">{t("requiredEvidence")}</p>
      {node.evidence.map((binding, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border p-2">
          <Input
            aria-label={`${t("evidenceAlias")} ${index + 1}`}
            data-testid={`graph-approval-evidence-alias-${index}`}
            disabled={disabled}
            value={binding.alias}
            onChange={(event) =>
              onChange({
                ...node,
                evidence: node.evidence.map((item, offset) =>
                  offset === index ? { ...item, alias: event.target.value } : item,
                ),
              })
            }
          />
          <GraphBindingSource
            source={binding.source}
            definition={definition}
            disabled={disabled}
            includeSource
            testId={`graph-approval-evidence-source-${index}`}
            prefix={`approval-${index}`}
            onChange={(source) =>
              onChange({
                ...node,
                evidence: node.evidence.map((item, offset) =>
                  offset === index ? { ...item, source } : item,
                ),
              })
            }
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            data-testid={`graph-approval-evidence-remove-${index}`}
            onClick={() =>
              onChange({ ...node, evidence: node.evidence.filter((_, offset) => offset !== index) })
            }
          >
            {t("removeEvidence")}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        data-testid="graph-approval-add-evidence"
        disabled={disabled || node.evidence.length >= 16}
        onClick={() =>
          onChange({
            ...node,
            evidence: [
              ...node.evidence,
              { alias: `evidence${node.evidence.length + 1}`, source: { kind: "start" } },
            ],
          })
        }
      >
        {t("addEvidence")}
      </Button>
      <p className="text-ui-sm text-foreground-subtle">{t("sourceCoverage")}</p>
    </div>
  );
}
