import { useMemo, useState } from "react";
import type {
  GraphDefinition,
  GraphRecipeSnapshot,
  GraphSequentialDefinition,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.js";
import { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphTemplateBindings } from "./GraphTemplateBindings.js";
import { GraphTemplateTransfer } from "./GraphTemplateTransfer.js";

export function GraphLibrary({
  workspacePath,
  workspaceIdentity,
  definition,
  dirty,
  disabled,
  recipes,
  onLoadRecipes,
  onInstantiated,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  definition: GraphDefinition;
  dirty: boolean;
  disabled: boolean;
  recipes: GraphRecipeSnapshot | null;
  onLoadRecipes(): void;
  onInstantiated(definition: GraphSequentialDefinition): void;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const target = useMemo(
    () => ({ workspacePath, ...(workspaceIdentity ? { workspaceIdentity } : {}) }),
    [workspacePath, workspaceIdentity],
  );
  const workflow = useGraphWorkflow(target);
  const [open, setOpen] = useState(false),
    [id, setId] = useState<string>(),
    [versionNumber, setVersionNumber] = useState<number>();
  const [duplicateName, setDuplicateName] = useState("");
  const entries = workflow.view?.entries ?? [];
  const entry = entries.find((item) => item.id === id);
  const version = entry?.versions.find((item) => item.version === versionNumber);
  const locked = disabled || workflow.pending;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !workflow.supported}
        data-testid="graph-library-open"
        onClick={() => {
          setOpen(true);
          void workflow.read();
        }}
      >
        {t("library")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!workflow.pending) setOpen(value);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-auto sm:max-w-3xl"
          data-testid="graph-library-dialog"
        >
          <DialogHeader>
            <DialogTitle>{t("library")}</DialogTitle>
            <DialogDescription>{t("libraryHelp")}</DialogDescription>
          </DialogHeader>
          {workflow.error ? (
            <p role="alert" className="break-words text-ui-sm text-destructive">
              {workflow.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => void workflow.read()}
              data-testid="graph-library-refresh"
            >
              {t("refresh")}
            </Button>
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {t("libraryRevision")}: {workflow.view?.revision ?? "—"}
            </p>
          </div>
          <GraphSelect
            label={t("workflow")}
            testId="graph-library-entry"
            value={entry?.id ?? "none"}
            disabled={locked}
            options={[
              { value: "none", label: t("chooseWorkflow") },
              ...entries.map((item) => ({
                value: item.id,
                label: `${item.name}${item.builtin ? ` · ${t("builtin")}` : ""}${item.archived ? ` · ${t("archived")}` : ""}`,
              })),
            ]}
            onChange={(value) => {
              setId(value === "none" ? undefined : value);
              setVersionNumber(undefined);
              setDuplicateName("");
            }}
          />
          {entry ? (
            <>
              <GraphSelect
                label={t("version")}
                testId="graph-library-version"
                value={version ? String(version.version) : "none"}
                disabled={locked}
                options={[
                  { value: "none", label: t("chooseVersion") },
                  ...entry.versions.map((item) => ({
                    value: String(item.version),
                    label: `${item.version} · ${item.digest.slice(0, 12)}`,
                  })),
                ]}
                onChange={(value) => setVersionNumber(value === "none" ? undefined : Number(value))}
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label={t("duplicateName")}
                  placeholder={t("duplicateName")}
                  data-testid="graph-library-duplicate-name"
                  className="min-w-40 flex-1"
                  value={duplicateName}
                  disabled={locked}
                  onChange={(event) => setDuplicateName(event.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked || !version || !duplicateName.trim() || !workflow.view}
                  data-testid="graph-library-duplicate"
                  onClick={() => {
                    if (version && workflow.view)
                      void workflow.mutate(
                        {
                          action: "duplicate",
                          id: entry.id,
                          version: version.version,
                          name: duplicateName,
                        },
                        workflow.view.revision,
                      );
                  }}
                >
                  {t("duplicate")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked || entry.builtin || !workflow.view}
                  data-testid="graph-library-archive"
                  onClick={() => {
                    if (workflow.view)
                      void workflow.mutate(
                        { action: "archive", id: entry.id, archived: !entry.archived },
                        workflow.view.revision,
                      );
                  }}
                >
                  {t(entry.archived ? "restore" : "archive")}
                </Button>
              </div>
            </>
          ) : null}
          {version && entry ? (
            <>
              <p className="whitespace-pre-wrap text-ui-sm text-foreground-subtle">
                {version.template.description}
              </p>
              <p className="break-all font-mono text-ui-xs">{version.digest}</p>
              <GraphTemplateBindings
                key={`${entry.id}:${version.version}`}
                version={version}
                recipes={recipes}
                dirty={dirty}
                disabled={locked || entry.archived}
                onLoadRecipes={onLoadRecipes}
                onInstantiate={(parameters, bindings) =>
                  void workflow
                    .instantiate({
                      id: entry.id,
                      version: version.version,
                      expectedRevision: definition.revision,
                      parameters,
                      bindings,
                    })
                    .then((saved) => {
                      if (saved) {
                        onInstantiated(saved);
                        setOpen(false);
                      }
                    })
                }
              />
            </>
          ) : null}
          {workflow.view ? (
            <GraphTemplateTransfer
              key={`${entry?.id ?? "new"}:${version?.version ?? "none"}`}
              workflow={workflow}
              definition={definition}
              entry={entry}
              version={version?.version}
              revision={workflow.view.revision}
              disabled={locked}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
