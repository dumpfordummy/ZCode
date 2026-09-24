import { useState } from "react";
import type { GraphDefinition, GraphLibraryEntry, GraphTemplatePreview } from "@zcode/services";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { reviewedTemplate } from "./graphWorkflowView.js";

export function GraphTemplateTransfer({
  workflow,
  definition,
  entry,
  version,
  revision,
  disabled,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  definition: GraphDefinition;
  entry?: GraphLibraryEntry;
  version?: number;
  revision: number;
  disabled: boolean;
}) {
  const { intl } = useZCodeIntl(),
    t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const [name, setName] = useState(definition.name),
    [description, setDescription] = useState("");
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<GraphTemplatePreview>();
  const [reviewed, setReviewed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saved, setSaved] = useState(false);
  const acceptPreview = (value: GraphTemplatePreview | undefined, exportMode = false) => {
    if (!value) return;
    setPreview(value);
    setReviewed(false);
    setSaved(false);
    setExporting(exportMode);
    if (value.json) setJson(value.json);
  };
  const template = reviewedTemplate(preview, reviewed);
  const save = (newVersion: boolean) => {
    if (!template || (newVersion && (!entry || entry.builtin))) return;
    void workflow
      .mutate(
        newVersion && entry
          ? { action: "version", id: entry.id, template }
          : { action: "create", template },
        revision,
      )
      .then((value) => {
        if (value) {
          setSaved(true);
          setReviewed(false);
        }
      });
  };
  return (
    <details className="space-y-3 text-ui-sm" data-testid="graph-template-transfer">
      <summary className="cursor-pointer">{t("transfer")}</summary>
      <p className="text-foreground-subtle">{t("transferHelp")}</p>
      <label className="block space-y-1">
        <span>{t("name")}</span>
        <Input
          value={name}
          disabled={disabled}
          data-testid="graph-library-name"
          onChange={(event) => {
            setName(event.target.value);
            setPreview(undefined);
            setReviewed(false);
          }}
        />
      </label>
      <label className="block space-y-1">
        <span>{t("description")}</span>
        <Input
          value={description}
          disabled={disabled}
          data-testid="graph-library-description"
          onChange={(event) => {
            setDescription(event.target.value);
            setPreview(undefined);
            setReviewed(false);
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || definition.version !== 5}
          data-testid="graph-library-capture"
          onClick={() => {
            if (definition.version !== undefined)
              void workflow
                .preview({ action: "capture", definition, name, description })
                .then((value) => acceptPreview(value));
          }}
        >
          {t("capture")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !entry || !version}
          data-testid="graph-library-export"
          onClick={() => {
            if (entry && version)
              void workflow
                .preview({ action: "export", id: entry.id, version })
                .then((value) => acceptPreview(value, true));
          }}
        >
          {t("exportPreview")}
        </Button>
      </div>
      <label className="block space-y-1">
        <span>{t("portableJson")}</span>
        <Textarea
          rows={10}
          value={json}
          disabled={disabled}
          data-testid="graph-template-json"
          onChange={(event) => {
            setJson(event.target.value);
            setPreview(undefined);
            setReviewed(false);
            setExporting(false);
            setSaved(false);
          }}
        />
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !json.trim()}
        data-testid="graph-template-preview"
        onClick={() =>
          void workflow.preview({ action: "import", json }).then((value) => acceptPreview(value))
        }
      >
        {t("dryPreview")}
      </Button>
      {preview ? (
        <div className="space-y-2" data-testid="graph-template-preview-result">
          {preview.errors.map((error, index) => (
            <p role="alert" className="text-destructive" key={`error-${index}`}>
              {error}
            </p>
          ))}
          {preview.diagnostics.map((diagnostic, index) => (
            <p className="text-foreground-subtle" key={`diagnostic-${index}`}>
              {diagnostic}
            </p>
          ))}
          {preview.unresolved.length ? (
            <p className="text-warning">
              {t("unresolved")}: {preview.unresolved.join(", ")}
            </p>
          ) : null}
          {preview.template && !preview.errors.length ? (
            <label className="flex items-start gap-2">
              <Checkbox
                data-testid="graph-template-reviewed"
                checked={reviewed}
                disabled={disabled}
                onCheckedChange={(value) => setReviewed(value === true)}
              />
              {t("reviewPortable")}
            </label>
          ) : null}
        </div>
      ) : null}
      {exporting ? (
        <p role="status" className="text-foreground-subtle">
          {reviewed ? t("exportReviewed") : t("exportReviewRequired")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={disabled || !template}
            data-testid="graph-library-create"
            onClick={() => save(false)}
          >
            {t("create")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !template || !entry || entry.builtin || entry.archived}
            data-testid="graph-library-save-version"
            onClick={() => save(true)}
          >
            {t("saveVersion")}
          </Button>
        </div>
      )}
      {saved ? (
        <p role="status" data-testid="graph-template-saved">
          {t("saved")}
        </p>
      ) : null}
    </details>
  );
}
