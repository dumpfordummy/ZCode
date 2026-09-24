import type { GraphSequentialDefinition, GraphRepairRegion } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";
export function GraphRoutingEditor({
  definition,
  disabled,
  onChange,
}: {
  definition: GraphSequentialDefinition;
  disabled: boolean;
  onChange(value: GraphSequentialDefinition): void;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z5.${key}` }),
    routing = definition.routing;
  if (definition.version !== 5 || !routing) return null;
  const update = (next: typeof routing) => onChange({ ...definition, routing: next });
  const region = routing.region;
  const setRegion = (next: GraphRepairRegion) => update({ ...routing, region: next });
  const options = (kind?: string) => [
    { value: "none", label: t("selectNode") },
    ...definition.nodes
      .filter((node) => !kind || node.type === kind)
      .map((node) => ({ value: node.id, label: "name" in node ? node.name : node.type })),
  ];
  return (
    <details className="space-y-3 text-ui-sm" data-testid="graph-routing-settings">
      <summary>{t("routingSettings")}</summary>
      <GraphSelect
        label={t("finalGate")}
        testId="graph-routing-final-gate"
        value={routing.finalGateId || "none"}
        options={options("approval")}
        disabled={disabled}
        onChange={(value) => update({ ...routing, finalGateId: value === "none" ? "" : value })}
      />
      {(
        [
          ["maxNodeAdmissions", "max-admissions", 1, 64],
          ["deadlineMs", "deadline-ms", 1000, 86400000],
        ] as const
      ).map(([key, id, min, max]) => (
        <label key={key} className="block space-y-1">
          <span>{t(key)}</span>
          <Input
            type="number"
            min={min}
            max={max}
            disabled={disabled}
            data-testid={`graph-routing-${id}`}
            value={routing.limits[key]}
            onChange={(event) =>
              update({
                ...routing,
                limits: { ...routing.limits, [key]: Number(event.target.value) },
              })
            }
          />
        </label>
      ))}
      <p className="text-foreground-subtle">{t("budgetHelp")}</p>
      {!region ? (
        <Button
          size="sm"
          variant="outline"
          data-testid="graph-region-enable"
          disabled={disabled}
          onClick={() =>
            setRegion({
              id: crypto.randomUUID(),
              name: t("newRegion"),
              entryNodeId: "",
              repairEntryNodeId: "",
              decisionNodeId: "",
              bodyNodeIds: [],
              repairExit: "needs_changes",
              passExit: "pass",
              maxRepairIterations: 2,
              stopOnNoProgress: true,
              sourcePaths: [],
            })
          }
        >
          {t("enableRegion")}
        </Button>
      ) : (
        <div className="space-y-3" data-testid="graph-region-editor">
          <label className="block space-y-1">
            <span>{t("regionName")}</span>
            <Input
              data-testid="graph-region-name"
              value={region.name}
              disabled={disabled}
              onChange={(event) => setRegion({ ...region, name: event.target.value })}
            />
          </label>
          {(
            [
              ["entryNodeId", "entry", "task"],
              ["repairEntryNodeId", "repair-entry", "task"],
              ["decisionNodeId", "decision", "condition"],
            ] as const
          ).map(([key, id, kind]) => (
            <GraphSelect
              key={key}
              label={t(key)}
              testId={`graph-region-${id}`}
              value={region[key] || "none"}
              options={options(kind)}
              disabled={disabled}
              onChange={(value) => setRegion({ ...region, [key]: value === "none" ? "" : value })}
            />
          ))}
          {(
            [
              ["bodyNodeIds", "body"],
              ["sourcePaths", "source-paths"],
            ] as const
          ).map(([key, id]) => (
            <label key={key} className="block space-y-1">
              <span>{t(key)}</span>
              <Textarea
                data-testid={`graph-region-${id}`}
                rows={4}
                value={region[key].join("\n")}
                disabled={disabled}
                onChange={(event) =>
                  setRegion({ ...region, [key]: event.target.value.split(/\r?\n/) })
                }
              />
            </label>
          ))}
          {(
            [
              ["repairExit", "repair-exit"],
              ["passExit", "pass-exit"],
            ] as const
          ).map(([key, id]) => (
            <label key={key} className="block space-y-1">
              <span>{t(key)}</span>
              <Input
                data-testid={`graph-region-${id}`}
                value={region[key]}
                disabled={disabled}
                onChange={(event) => setRegion({ ...region, [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="block space-y-1">
            <span>{t("maxRepairIterations")}</span>
            <Input
              type="number"
              min={0}
              max={5}
              data-testid="graph-region-max-repairs"
              value={region.maxRepairIterations}
              disabled={disabled}
              onChange={(event) =>
                setRegion({ ...region, maxRepairIterations: Number(event.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="graph-region-no-progress"
              disabled={disabled}
              checked={region.stopOnNoProgress}
              onChange={(event) => setRegion({ ...region, stopOnNoProgress: event.target.checked })}
            />
            {t("noProgress")}
          </label>
          <p className="text-foreground-subtle">{t("regionHelp")}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            data-testid="graph-region-remove"
            onClick={() => update({ ...routing, region: undefined })}
          >
            {t("removeRegion")}
          </Button>
        </div>
      )}
    </details>
  );
}
