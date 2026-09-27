import { useState } from "react";
import type { GraphDefinition, GraphLibraryEntry } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphSelect } from "./GraphSelect.js";
import { GraphTemplateTransfer } from "./GraphTemplateTransfer.js";

export function GraphLibraryManagement({
  workflow,
  definition,
  entry,
  version,
  disabled,
  onVersion,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  definition: GraphDefinition;
  entry?: GraphLibraryEntry;
  version?: GraphLibraryEntry["versions"][number];
  disabled: boolean;
  onVersion(version: number): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const [duplicateName, setDuplicateName] = useState("");
  return (
    <details className="space-y-3 text-ui-sm" data-testid="graph-library-management">
      <summary className="cursor-pointer">{u("management")}</summary>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={workflow.pending}
          onClick={() => void workflow.read()}
          data-testid="graph-library-refresh"
        >
          {t("refresh")}
        </Button>
        <p className="text-foreground-subtle">
          {t("libraryRevision")}: {workflow.view?.revision ?? "—"}
        </p>
      </div>
      {entry ? (
        <>
          <GraphSelect
            label={t("version")}
            testId="graph-library-version"
            value={version ? String(version.version) : "none"}
            disabled={disabled}
            options={[
              ...(!version ? [{ value: "none", label: t("chooseVersion") }] : []),
              ...entry.versions.map((item) => ({
                value: String(item.version),
                label: String(item.version),
              })),
            ]}
            onChange={(value) => {
              if (value !== "none") onVersion(Number(value));
            }}
          />
          {version ? (
            <details>
              <summary className="cursor-pointer">{u("details")}</summary>
              <p className="break-all font-mono text-ui-xs">{version.digest}</p>
            </details>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t("duplicateName")}
              placeholder={t("duplicateName")}
              data-testid="graph-library-duplicate-name"
              className="min-w-40 flex-1"
              value={duplicateName}
              disabled={disabled}
              onChange={(event) => setDuplicateName(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || !version || !duplicateName.trim() || !workflow.view}
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
              disabled={disabled || entry.builtin || !workflow.view}
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
      {workflow.view ? (
        <GraphTemplateTransfer
          key={`${entry?.id ?? "new"}:${version?.version ?? "none"}`}
          workflow={workflow}
          definition={definition}
          entry={entry}
          version={version?.version}
          revision={workflow.view.revision}
          disabled={disabled}
        />
      ) : null}
    </details>
  );
}
