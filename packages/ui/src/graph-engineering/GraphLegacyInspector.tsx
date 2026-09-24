import type { GraphDefinition, GraphLegacyDefinition } from "@zcode/services";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function LegacyInspector({
  definition,
  disabled,
  onChange,
}: {
  definition: GraphLegacyDefinition;
  disabled: boolean;
  onChange: (definition: GraphDefinition) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.${id}` });
  return (
    <div className="space-y-3">
      <p className="text-ui-sm text-foreground-subtle">{t("legacyHelp")}</p>
      <label className="block space-y-1 text-ui-sm text-foreground-subtle">
        <span>{t("taskName")}</span>
        <Input
          aria-label={t("taskName")}
          data-testid="graph-node-name"
          disabled={disabled}
          value={definition.taskName}
          onChange={(event) => onChange({ ...definition, taskName: event.target.value })}
        />
      </label>
      <label className="block space-y-1 text-ui-sm text-foreground-subtle">
        <span>{t("instructions")}</span>
        <Textarea
          aria-label={t("instructions")}
          data-testid="graph-instructions"
          rows={8}
          disabled={disabled}
          value={definition.instructions}
          onChange={(event) => onChange({ ...definition, instructions: event.target.value })}
        />
      </label>
    </div>
  );
}
