import type { GraphDotnetPreset } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { GraphSetupField, GraphSetupList, useGraphSetupText } from "./GraphSetupFields.js";
export function GraphDotnetTestScopes({
  tests,
  configuration,
  disabled,
  onChange,
}: {
  tests: GraphDotnetPreset["tests"];
  configuration: string;
  disabled: boolean;
  onChange(tests: GraphDotnetPreset["tests"]): void;
}) {
  const t = useGraphSetupText();
  return (
    <div className="space-y-3">
      <p className="font-medium text-ui-sm">{t("testScopes")}</p>
      <p className="text-ui-sm text-foreground-subtle">{t("scopeHelp")}</p>
      {tests.map((test, index) => (
        <fieldset
          key={index}
          disabled={disabled}
          className="space-y-2 rounded-lg border border-border p-3"
          data-testid="graph-dotnet-test-scope"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "project",
              "configuration",
              "framework",
              "runtime",
              "filter",
              "assembly",
              "minimumTests",
              "expectedTests",
            ].map((field) => (
              <GraphSetupField
                key={field}
                name={field}
                value={test[field as keyof typeof test]}
                testId={`graph-dotnet-test-${field}-${index}`}
                numeric={field === "minimumTests" || field === "expectedTests"}
                optional={["runtime", "filter", "expectedTests"].includes(field)}
                onChange={(value) =>
                  onChange(
                    tests.map((current, position) =>
                      position === index ? { ...current, [field]: value } : current,
                    ),
                  )
                }
              />
            ))}
          </div>
          <GraphSetupList
            name="requiredTests"
            values={test.requiredTests}
            max={256}
            testId={`graph-dotnet-test-required-${index}`}
            onChange={(requiredTests) =>
              onChange(
                tests.map((current, position) =>
                  position === index ? { ...current, requiredTests } : current,
                ),
              )
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(tests.filter((_, position) => position !== index))}
          >
            {t("remove")}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || tests.length >= 7}
        data-testid="graph-dotnet-add-test"
        onClick={() =>
          onChange([
            ...tests,
            {
              project: "",
              configuration,
              framework: "",
              assembly: "",
              minimumTests: 1,
              requiredTests: [],
            },
          ])
        }
      >
        {t("addTest")}
      </Button>
      {tests.length >= 7 ? (
        <p className="text-ui-sm text-warning" role="status">
          {t("presetLimit")}
        </p>
      ) : null}
    </div>
  );
}
