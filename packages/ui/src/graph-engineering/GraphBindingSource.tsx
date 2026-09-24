import type { GraphApprovalEvidenceSource, GraphSequentialDefinition } from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";

export function GraphBindingSource({
  source,
  definition,
  disabled,
  onChange,
  testId,
  prefix,
  includeSource = false,
}: {
  source: GraphApprovalEvidenceSource;
  definition: GraphSequentialDefinition;
  disabled: boolean;
  onChange: (source: GraphApprovalEvidenceSource) => void;
  testId: string;
  prefix: string;
  includeSource?: boolean;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  const tasks = definition.nodes.filter((node) => node.type === "task"),
    producers = definition.nodes.filter((node) => node.type === "task" || node.type === "tool");
  const value =
    source.kind === "node" || source.kind === "artifact"
      ? `${source.kind}:${source.nodeId}`
      : source.kind;
  const options = [
    ...(definition.version === 5 && !includeSource
      ? [{ value: "repair-feedback", label: t("z5.repairFeedback") }]
      : []),
    { value: "start", label: t("startInput") },
    ...(includeSource ? [{ value: "source", label: t("approval.sourceEvidence") }] : []),
    ...tasks.map((node) => ({ value: `node:${node.id}`, label: node.name })),
    ...producers.map((node) => ({
      value: `artifact:${node.id}`,
      label: `${t("z4.artifact")}: ${node.name}`,
    })),
  ];
  if (!options.some((option) => option.value === value))
    options.push({ value, label: `${t("missingSource")}: ${value}` });
  return (
    <div className="space-y-2">
      <GraphSelect
        label={t("bindingSource")}
        testId={testId}
        disabled={disabled}
        value={value}
        options={options}
        onChange={(next) =>
          onChange(
            next === "start" || next === "source" || next === "repair-feedback"
              ? { kind: next }
              : next.startsWith("artifact:")
                ? {
                    kind: "artifact",
                    nodeId: next.slice(9),
                    selector:
                      producers.find((node) => node.id === next.slice(9))?.type === "tool"
                        ? "command"
                        : "final",
                  }
                : { kind: "node", nodeId: next.slice(5) },
          )
        }
      />
      {source.kind === "repair-feedback" ? (
        <p className="text-ui-sm text-foreground-subtle">{t("z5.feedbackHelp")}</p>
      ) : null}
      {source.kind === "artifact" ? (
        <>
          <label className="block space-y-1 text-ui-sm">
            <span>{t("z4.selector")}</span>
            <Input
              value={source.selector}
              disabled={disabled}
              data-testid={`graph-artifact-selector-${prefix}`}
              onChange={(event) => onChange({ ...source, selector: event.target.value })}
            />
          </label>
          <label className="block space-y-1 text-ui-sm">
            <span>{t("z4.pointer")}</span>
            <Input
              value={source.pointer ?? ""}
              disabled={disabled}
              data-testid={`graph-artifact-pointer-${prefix}`}
              onChange={(event) =>
                onChange({ ...source, pointer: event.target.value || undefined })
              }
            />
          </label>
          <p className="text-ui-sm text-foreground-subtle">{t("z4.bindingHelp")}</p>
        </>
      ) : null}
    </div>
  );
}
