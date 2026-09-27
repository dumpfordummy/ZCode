import { useEffect, useMemo, useRef, useState } from "react";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphDraftStore } from "@/store/graphDraftStore.js";
import { GraphRecipeReadStatus } from "./GraphRecipeReadStatus.js";
import { GraphRecipeForm } from "./GraphRecipeForm.js";
import { GraphDotnetPreset } from "./GraphDotnetPreset.js";
import { GraphChecksSetup } from "./GraphChecksSetup.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import { useGraphProjectSetup } from "@/hooks/useGraphProjectSetup.js";

export function GraphProjectRecipes({
  graph,
  workspaceKey,
  disabled,
  workspacePath,
  workspaceIdentity,
  onRun,
}: {
  graph: ReturnType<typeof useGraphEngineering>;
  workspaceKey: string;
  disabled: boolean;
  workspacePath: string;
  workspaceIdentity?: string;
  onRun(runId: string): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id: `graph.z4.${id}` });
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  const s = useGraphSetupText();
  const target = useMemo(
    () => ({ workspacePath, ...(workspaceIdentity ? { workspaceIdentity } : {}) }),
    [workspacePath, workspaceIdentity],
  );
  const setup = useGraphProjectSetup(target);
  const form = useGraphDraftStore((state) => state.workspaces[workspaceKey]?.recipes);
  const observeRecipes = useGraphDraftStore((state) => state.observeRecipes);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const readState = graph.recipeReadState;
  const text = form?.text ?? "[]";
  const currentForm = useRef(form);
  currentForm.current = form;
  const validation = setup.state("validate", text);
  const validated =
    validation.status === "ready" && validation.result.kind === "validation"
      ? validation.result
      : undefined;
  const change = (text: string) => {
    if (form) useGraphDraftStore.getState().setRecipeDraft(workspaceKey, { ...form, text });
    setSaved(false);
  };
  const validate = () =>
    setup.invoke(
      { action: "validate", json: text },
      text,
      () => currentForm.current?.text === text && currentForm.current.digest === form?.digest,
    );
  useEffect(() => {
    if (readState.status === "not-loaded") void graph.readRecipes();
  }, [readState.status, graph.readRecipes]);
  useEffect(() => {
    if (readState.status === "ready") observeRecipes(workspaceKey, readState.snapshot);
  }, [readState, observeRecipes, workspaceKey]);
  const dirty = Boolean(form && form.text !== form.baseText);
  const conflict = Boolean(form && readState.snapshot && form.digest !== readState.snapshot.digest);
  const saveBlocked =
    disabled ||
    !form ||
    readState.status !== "ready" ||
    conflict ||
    validation.status === "loading" ||
    !setup.supported;
  return (
    <section className="space-y-4" data-testid="graph-project-recipes">
      <p className="text-ui-sm text-foreground-subtle">{u("setupHelp")}</p>
      <GraphRecipeReadStatus state={readState} onRead={() => void graph.readRecipes()} />
      <GraphDotnetPreset
        workspaceKey={workspaceKey}
        setup={setup}
        text={text}
        disabled={disabled || !form}
        onChange={change}
      />
      <GraphRecipeForm text={text} disabled={disabled || !form} onChange={change} />
      <details open className="space-y-3 text-ui-sm">
        <summary className="cursor-pointer">{u("rawChecks")}</summary>
        <p className="text-foreground-subtle">{t("recipesHelp")}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={readState.status === "loading"}
          data-testid="graph-load-recipes"
          onClick={() => void graph.readRecipes()}
        >
          {t("loadRecipes")}
        </Button>
        <Textarea
          rows={12}
          aria-label={t("recipes")}
          data-testid="graph-recipes-json"
          value={form?.text ?? "[]"}
          disabled={disabled || !form}
          onChange={(event) => {
            change(event.target.value);
          }}
        />
        {dirty ? (
          <p role="status" className="text-foreground-subtle">
            {u("unsavedChecks")}
          </p>
        ) : null}
        {conflict ? (
          <div className="space-y-2">
            <p role="alert" className="text-warning">
              {u("recipeConflict")}
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-sm">
              {JSON.stringify(readState.snapshot?.recipes, null, 2)}
            </pre>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || readState.status !== "ready"}
              data-testid="graph-recipes-use-saved"
              onClick={() => {
                if (readState.status === "ready" && form)
                  useGraphDraftStore
                    .getState()
                    .acceptRecipes(workspaceKey, readState.snapshot, form.text);
              }}
            >
              {u("useSavedChecks")}
            </Button>
          </div>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          data-testid="graph-recipes-validate"
          disabled={!form || !setup.supported || validation.status === "loading"}
          onClick={() => void validate()}
        >
          {s("validate")}
        </Button>
        <div
          data-testid="graph-recipes-validation"
          data-state={validation.status}
          className="space-y-1 text-ui-sm"
        >
          {validation.status === "loading" ? <p role="status">{s("validating")}</p> : null}
          {validated?.recipes && !validated.diagnostics.length ? (
            <p role="status">{s("valid")}</p>
          ) : null}
          {validated?.diagnostics.map((issue, index) => (
            <p key={index} className="text-warning" role="alert">
              {issue.path}: {issue.message}
            </p>
          ))}
          {validation.status === "error" ? (
            <p role="alert" className="text-destructive">
              {validation.error}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={saveBlocked}
          aria-describedby={saveBlocked ? "graph-recipe-save-reason" : undefined}
          data-testid="graph-save-recipes"
          onClick={() => {
            if (!form) return;
            setError("");
            const submittedText = form.text;
            void validate()
              .then(async (result) => {
                if (result?.kind !== "validation" || !result.recipes || result.diagnostics.length)
                  return;
                const snapshot = await graph.saveRecipes(result.recipes, form.digest);
                if (snapshot) {
                  useGraphDraftStore
                    .getState()
                    .acceptRecipes(workspaceKey, snapshot, submittedText);
                  setSaved(true);
                }
              })
              .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
          }}
        >
          {t("saveRecipes")}
        </Button>
        {saveBlocked ? (
          <p id="graph-recipe-save-reason" role="status" className="text-foreground-subtle">
            {u(disabled ? "creationLocked" : "recipeSaveBlocked")}
          </p>
        ) : null}
        {saved ? (
          <p role="status" data-testid="graph-recipes-saved">
            {t("recipesSaved")}
          </p>
        ) : null}
        {error || graph.error ? (
          <p role="alert" className="text-destructive">
            {error || graph.error}
          </p>
        ) : null}
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
      </details>
      <GraphChecksSetup
        workspaceKey={workspaceKey}
        workspacePath={workspacePath}
        graph={graph}
        setup={setup}
        snapshot={readState.snapshot}
        text={text}
        clean={Boolean(form && !dirty && !conflict && readState.status === "ready")}
        disabled={disabled}
        onRun={onRun}
      />
    </section>
  );
}
