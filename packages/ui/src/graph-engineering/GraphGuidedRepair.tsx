import { applyGraphRepairPolicy, graphRepairPreset } from "@zcode/services";
import type { GraphRepairPolicyEdit, GraphSequentialDefinition } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useGraphEditorBuffer } from "@/hooks/useGraphEditorBuffer.js";
import { GraphOpenAdvanced, useGraphEditorText } from "./GraphEditorMode.js";

export function GraphGuidedRepair({
  definition,
  disabled,
  workspaceKey,
  onChange,
}: {
  definition: GraphSequentialDefinition;
  disabled: boolean;
  workspaceKey: string;
  onChange(value: GraphSequentialDefinition): void;
}) {
  const t = useGraphEditorText(),
    projection = graphRepairPreset(definition);
  const canonical = projection.policy ?? {
    additionalRepairs: 2,
    deadlineMinutes: 30,
    maxNodeAdmissions: 24,
    stopOnNoProgress: true,
  };
  const buffer = useGraphEditorBuffer(
    workspaceKey,
    "routing:guided-repair",
    JSON.stringify(canonical),
  );
  const fields = JSON.parse(buffer.text) as GraphRepairPolicyEdit;
  return (
    <details className="space-y-3 text-ui-sm" data-testid="graph-guided-repair">
      <summary>{t("repair")}</summary>
      <p>{t("repairHelp")}</p>
      {!projection.supported ? (
        <>
          <p data-testid="graph-guided-unsupported">
            {t("advancedOnly")} {projection.reason}
          </p>
          <GraphOpenAdvanced workspaceKey={workspaceKey} />
        </>
      ) : (
        <>
          {(
            [
              ["additionalRepairs", "additional", "additional", 0, 5],
              ["deadlineMinutes", "minutes", "minutes", 0.001, 1440],
              ["maxNodeAdmissions", "admissions", "admissions", 1, 64],
            ] as const
          ).map(([key, label, id, min, max]) => (
            <label key={key} className="block space-y-1">
              <span>{t(label)}</span>
              <Input
                type="number"
                min={min}
                max={max}
                step={key === "deadlineMinutes" ? "any" : 1}
                data-testid={`graph-repair-${id}`}
                disabled={disabled}
                value={fields[key]}
                onChange={(event) =>
                  buffer.set(JSON.stringify({ ...fields, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              data-testid="graph-repair-no-progress"
              disabled={disabled}
              checked={fields.stopOnNoProgress}
              onChange={(event) =>
                buffer.set(JSON.stringify({ ...fields, stopOnNoProgress: event.target.checked }))
              }
            />
            {t("noProgress")}
          </label>
          <div data-testid="graph-repair-summary">
            <p>
              {t("tests")}: {projection.testNodeIds.join(", ")}
            </p>
            <p>
              {t("finalGate")}: {projection.finalGateId}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid="graph-repair-apply"
            disabled={disabled || buffer.conflict}
            onClick={() => {
              try {
                onChange(
                  applyGraphRepairPolicy(definition, {
                    additionalRepairs: Number(fields.additionalRepairs),
                    deadlineMinutes: Number(fields.deadlineMinutes),
                    maxNodeAdmissions: Number(fields.maxNodeAdmissions),
                    stopOnNoProgress: fields.stopOnNoProgress,
                  }),
                );
                buffer.accept(buffer.text);
              } catch (cause) {
                buffer.set(buffer.text, cause instanceof Error ? cause.message : String(cause));
              }
            }}
          >
            {t("apply")}
          </Button>
          {buffer.error ? (
            <p role="alert" className="text-destructive">
              {buffer.error}
            </p>
          ) : null}
          {buffer.conflict ? <p role="status">{t("bufferConflict")}</p> : null}
        </>
      )}
    </details>
  );
}
