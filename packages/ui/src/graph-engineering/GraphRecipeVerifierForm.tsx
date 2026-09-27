import { GraphSetupField, GraphSetupList, useGraphSetupText } from "./GraphSetupFields.js";
import type { GraphRecipeDraftObject } from "./graphRecipeDraftForm.js";

export function GraphRecipeVerifierForm({
  verifier,
  index,
  disabled,
  onChange,
}: {
  verifier: GraphRecipeDraftObject;
  index: number;
  disabled: boolean;
  onChange(path: string[], value: unknown): void;
}) {
  const t = useGraphSetupText();
  const target = verifier.target as GraphRecipeDraftObject | undefined;
  const dotnet = verifier.dotnet as GraphRecipeDraftObject | undefined;
  return (
    <div className="space-y-3">
      <p className="text-ui-sm">
        {t(String(verifier.kind))}
        {verifier.format ? ` · ${verifier.format}` : ""}
      </p>
      {verifier.kind === "test" ? (
        <>
          {["reportPath", "buildNodeId", "minimumTests", "expectedTests"].map((key) => (
            <GraphSetupField
              key={key}
              name={key}
              value={verifier[key]}
              disabled={disabled}
              numeric={key === "minimumTests" || key === "expectedTests"}
              optional={key === "expectedTests"}
              testId={`graph-recipe-field-${index}-verifier-${key}`}
              onChange={(value) => onChange(["verifier", key], value)}
            />
          ))}
          <GraphSetupList
            name="requiredTests"
            values={(verifier.requiredTests ?? []) as string[]}
            max={256}
            disabled={disabled}
            testId={`graph-recipe-field-${index}-requiredTests`}
            onChange={(value) => onChange(["verifier", "requiredTests"], value)}
          />
        </>
      ) : null}
      {target || dotnet ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(target
            ? ["project", "configuration", "framework", "runtime", "filter", "assembly"]
            : ["project", "configuration", "framework", "runtime", "restore"]
          ).map((key) => (
            <GraphSetupField
              key={key}
              name={key}
              value={(target ?? dotnet)?.[key]}
              disabled={disabled}
              optional={["runtime", "filter"].includes(key) || (!target && key === "framework")}
              testId={`graph-recipe-field-${index}-verifier-${target ? "target" : "dotnet"}-${key}`}
              onChange={(value) => onChange(["verifier", target ? "target" : "dotnet", key], value)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
