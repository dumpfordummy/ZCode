import {
  GraphSetupField,
  GraphSetupList,
  useGraphSetupText,
} from "./GraphSetupFields.js";
import { GraphSelect } from "./GraphSelect.js";
import type { GraphRecipeDraftObject } from "./graphRecipeDraftForm.js";

export function GraphRecipeVerifierForm({
  verifier,
  index,
  buildOptions,
  disabled,
  onChange,
}: {
  verifier: GraphRecipeDraftObject;
  index: number;
  buildOptions: Array<{ value: string; label: string }>;
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
          {/* buildNodeId 是 Test 检查的必需映射，使用下拉选择而非原始 ID 文本框。
              Radix Select 禁止 Select.Item 的 value 为空字符串，用 "none" 哨兵表示
              无映射并在显示/保存时双向转换。 */}
          <GraphSelect
            label={t("buildMapping")}
            value={verifier["buildNodeId"] ? String(verifier["buildNodeId"]) : "none"}
            options={[
              { value: "none", label: t("noBuildMapping") },
              ...buildOptions,
            ]}
            disabled={disabled}
            testId={`graph-recipe-field-${index}-verifier-buildNodeId`}
            onChange={(value) =>
              onChange(["verifier", "buildNodeId"], value === "none" ? "" : value)
            }
          />
          {["reportPath", "minimumTests", "expectedTests"].map((key) => (
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
            ? [
                "project",
                "configuration",
                "framework",
                "runtime",
                "filter",
                "assembly",
              ]
            : ["project", "configuration", "framework", "runtime", "restore"]
          ).map((key) => (
            <GraphSetupField
              key={key}
              name={key}
              value={(target ?? dotnet)?.[key]}
              disabled={disabled}
              optional={
                ["runtime", "filter"].includes(key) ||
                (!target && key === "framework")
              }
              testId={`graph-recipe-field-${index}-verifier-${target ? "target" : "dotnet"}-${key}`}
              onChange={(value) =>
                onChange(["verifier", target ? "target" : "dotnet", key], value)
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
