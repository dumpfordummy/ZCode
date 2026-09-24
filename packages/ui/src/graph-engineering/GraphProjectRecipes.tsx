import { useState } from "react";
import type { GraphRecipe } from "@zcode/services";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function GraphProjectRecipes({
  graph,
  disabled,
}: {
  graph: ReturnType<typeof useGraphEngineering>;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl(),
    t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const [draft, setDraft] = useState("[]"),
    [digest, setDigest] = useState<string>(),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <details className="shrink-0 space-y-2 text-ui-sm" data-testid="graph-project-recipes">
      <summary className="cursor-pointer">{t("recipes")}</summary>
      <p className="text-foreground-subtle">{t("recipesHelp")}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        data-testid="graph-load-recipes"
        onClick={() =>
          void graph.readRecipes().then((value) => {
            if (value) {
              setDraft(JSON.stringify(value.recipes, null, 2));
              setDigest(value.digest);
              setError("");
              setSaved(false);
            }
          })
        }
      >
        {t("loadRecipes")}
      </Button>
      <Textarea
        rows={8}
        aria-label={t("recipes")}
        data-testid="graph-recipes-json"
        value={draft}
        disabled={disabled || !digest}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !digest}
        data-testid="graph-save-recipes"
        onClick={() => {
          try {
            const value: unknown = JSON.parse(draft);
            if (!Array.isArray(value)) throw new Error(t("recipesArray"));
            setError("");
            void graph.saveRecipes(value as GraphRecipe[], digest!).then((snapshot) => {
              if (snapshot) {
                setDigest(snapshot.digest);
                setDraft(JSON.stringify(snapshot.recipes, null, 2));
                setSaved(true);
              }
            });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        {t("saveRecipes")}
      </Button>
      {saved ? (
        <p role="status" data-testid="graph-recipes-saved">
          {t("recipesSaved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <details>
        <summary>{t("recipeExample")}</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
          {JSON.stringify(
            {
              id: "build",
              name: "Build",
              executable: "dotnet",
              args: ["build", "--no-restore"],
              cwd: ".",
              timeoutMs: 120000,
              sourcePaths: ["project.csproj"],
              expectedOutputs: ["bin/Debug/net8.0/project.dll"],
              verifier: { kind: "build" },
            },
            null,
            2,
          )}
        </pre>
      </details>
    </details>
  );
}
