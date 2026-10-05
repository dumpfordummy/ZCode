import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphDisclosure } from "./GraphDisclosure.js";

/** The existing lossless JSON editor; the parent retains the only recipe draft. */
export function GraphRecipeJsonDetails({
  text,
  disabled,
  loading,
  onChange,
  onRead,
}: {
  text: string;
  disabled: boolean;
  loading: boolean;
  onChange(text: string): void;
  onRead(): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  return (
    <GraphDisclosure title={u("rawChecks")} className="border-y border-border">
      <p className="text-foreground-subtle">{t("recipesHelp")}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        data-testid="graph-load-recipes"
        onClick={onRead}
      >
        {t("loadRecipes")}
      </Button>
      <Textarea
        rows={12}
        aria-label={t("recipes")}
        data-testid="graph-recipes-json"
        value={text}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <details>
        <summary className="cursor-pointer">{t("recipeExample")}</summary>
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
    </GraphDisclosure>
  );
}
