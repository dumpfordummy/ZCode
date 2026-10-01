import { useRef, useState } from "react";
import type { GraphDotnetPreset as DotnetPreset } from "@zcode/services";
import type { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Textarea } from "@/components/ui/textarea.js";
import { GraphDisclosure } from "./GraphDisclosure.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { GraphSetupField, useGraphSetupText } from "./GraphSetupFields.js";
import { GraphDotnetTestScopes } from "./GraphDotnetTestScopes.js";
import { GraphProjectDiscovery } from "./GraphProjectDiscovery.js";
import { appendGraphRecipes } from "./graphRecipeDraftForm.js";

const initial: DotnetPreset = {
  idPrefix: "dotnet",
  executable: "dotnet",
  cwd: ".",
  timeoutMs: 120000,
  buildProject: "",
  configuration: "Debug",
  sourcePaths: [],
  expectedOutputs: [],
  reviewedManifest: false,
  tests: [],
};
export function GraphDotnetPreset({
  workspaceKey,
  setup,
  text,
  disabled,
  onChange,
}: {
  workspaceKey: string;
  setup: ReturnType<typeof useGraphProjectSetup>;
  text: string;
  disabled: boolean;
  onChange(text: string): void;
}) {
  const t = useGraphSetupText();
  const preset =
    useGraphDraftStore((state) => state.workspaces[workspaceKey]?.setup?.preset) ?? initial;
  const change = (patch: Partial<DotnetPreset>) =>
    useGraphDraftStore
      .getState()
      .updateSetup(workspaceKey, { preset: { ...preset, reviewedManifest: false, ...patch } });
  const key = JSON.stringify({ preset, text });
  const current = useRef(key);
  current.current = key;
  const state = setup.state("dotnet-preset", key);
  const proposal =
    state.status === "ready" && state.result.kind === "validation" ? state.result : undefined;
  const [error, setError] = useState("");
  return (
    <div className="space-y-5">
      <GraphProjectDiscovery
        setup={setup}
        disabled={disabled}
        testLimitReached={preset.tests.length >= 7}
        onBuild={(candidate) =>
          change({
            buildProject: candidate.path,
            sourcePaths: [...new Set([...preset.sourcePaths, ...candidate.sourcePaths])],
          })
        }
        onTest={(candidate, framework) =>
          change({
            sourcePaths: [...new Set([...preset.sourcePaths, ...candidate.sourcePaths])],
            tests: [
              ...preset.tests,
              {
                project: candidate.path,
                framework,
                configuration: preset.configuration,
                assembly: "",
                minimumTests: 1,
                requiredTests: [],
              },
            ],
          })
        }
      />
      <GraphDisclosure
        testId="graph-dotnet-preset"
        title={t("preset")}
        className="border-y border-border"
      >
        <p className="text-foreground-subtle">{t("presetHelp")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "idPrefix",
            "executable",
            "cwd",
            "timeoutMs",
            "buildProject",
            "configuration",
            "framework",
            "runtime",
          ].map((field) => (
            <GraphSetupField
              key={field}
              name={field}
              value={preset[field as keyof DotnetPreset]}
              disabled={disabled}
              testId={`graph-dotnet-${field === "buildProject" ? "build-project" : field}`}
              numeric={field === "timeoutMs"}
              optional={field === "framework" || field === "runtime"}
              onChange={(value) => change({ [field]: value })}
            />
          ))}
        </div>
        {(["sourcePaths", "expectedOutputs"] as const).map((field) => (
          <label key={field} className="block space-y-1">
            <span>{t(field)} · 32</span>
            <Textarea
              rows={5}
              disabled={disabled}
              value={preset[field].join("\n")}
              data-testid={`graph-dotnet-${field === "sourcePaths" ? "source-paths" : "expected-outputs"}`}
              onChange={(event) =>
                change({ [field]: event.target.value ? event.target.value.split("\n") : [] })
              }
            />
          </label>
        ))}
        <GraphDotnetTestScopes
          tests={preset.tests}
          configuration={preset.configuration}
          disabled={disabled}
          onChange={(tests) => change({ tests })}
        />
        <label className="flex items-start gap-2">
          <Checkbox
            disabled={disabled}
            data-testid="graph-dotnet-review-manifest"
            checked={preset.reviewedManifest}
            onCheckedChange={(value) => change({ reviewedManifest: value === true })}
          />
          {t("manifestReview")}
        </label>
        <Button
          size="sm"
          variant="outline"
          data-testid="graph-dotnet-generate"
          disabled={
            disabled ||
            state.status === "loading" ||
            !preset.reviewedManifest ||
            !preset.tests.length
          }
          onClick={() => {
            setError("");
            void setup.invoke(
              { action: "dotnet-preset", preset },
              key,
              () => current.current === key,
            );
          }}
        >
          {t("generate")}
        </Button>
        {!preset.reviewedManifest || !preset.tests.length ? (
          <p className="text-foreground-subtle">{t("manifestRequired")}</p>
        ) : null}
        {proposal ? (
          <div className="space-y-2" data-testid="graph-dotnet-proposal">
            {proposal.diagnostics.map((issue, index) => (
              <p key={index} className="text-warning" role="alert">
                {issue.path}: {issue.message}
              </p>
            ))}
            {proposal.recipes ? (
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
                {JSON.stringify(proposal.recipes, null, 2)}
              </pre>
            ) : null}
            <Button
              size="sm"
              data-testid="graph-dotnet-apply"
              disabled={disabled || !proposal.recipes || proposal.diagnostics.length > 0}
              onClick={() => {
                try {
                  if (proposal.recipes) onChange(appendGraphRecipes(text, proposal.recipes));
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause));
                }
              }}
            >
              {t("apply")}
            </Button>
          </div>
        ) : null}
        {error || state.status === "error" ? (
          <p role="alert" className="text-destructive">
            {error || (state.status === "error" ? state.error : "")}
          </p>
        ) : null}
      </GraphDisclosure>
    </div>
  );
}
