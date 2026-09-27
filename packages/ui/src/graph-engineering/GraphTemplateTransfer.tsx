import { useEffect, useRef, useState } from "react";
import type {
  GraphDefinition,
  GraphLibraryEntry,
  GraphTemplatePreview,
  GraphWorkspaceTarget,
} from "@zcode/services";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useGraphTemplateFiles } from "@/hooks/useGraphTemplateFiles.js";
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
  target,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  definition: GraphDefinition;
  entry?: GraphLibraryEntry;
  version?: number;
  revision: number;
  disabled: boolean;
  target: GraphWorkspaceTarget;
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
  const files = useGraphTemplateFiles(target);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [fileError, setFileError] = useState("");
  const [fileSaved, setFileSaved] = useState(false);
  const acceptPreview = (value: GraphTemplatePreview | undefined, exportMode = false) => {
    if (!value) return;
    setPreview(value);
    setReviewed(false);
    setSaved(false);
    setFileSaved(false);
    setFileError("");
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
  // 导入文件：selectFile → 有界读取 → 致命 UTF-8 解码 → 现有 import 预览。取消或 scope
  // 失效返回 undefined；格式/编码错误抛出并显示在 fileError，不覆盖未保存的设计。
  const importFromFile = () => {
    setFileError("");
    setFileSaved(false);
    void files
      .importFile(() => alive.current)
      .then((result) => {
        if (!result) return;
        setJson(result.json);
        void workflow
          .preview({ action: "import", json: result.json })
          .then((value) => acceptPreview(value));
      })
      .catch((error) => {
        setFileError(error instanceof Error ? error.message : String(error));
      });
  };
  // 导出文件：仅对已审阅的可移植 JSON 调用 saveFile；保存失败显示在 fileError。
  const exportToFile = () => {
    if (!preview?.json) return;
    setFileError("");
    void files
      .exportFile(preview.json, () => alive.current)
      .then((result) => {
        // saveFile 在取消时返回 { success: false, canceled: true }、在写入失败时返回
        // { success: false, error }；二者都是真值对象，不能仅用 if (result) 判断成功，
        // 否则取消会被误判为已保存。只有 success 为 true 才代表真正落盘成功。
        if (result?.success) setFileSaved(true);
        else if (result?.error) setFileError(result.error);
      })
      .catch((error) => {
        setFileError(error instanceof Error ? error.message : String(error));
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
            setFileSaved(false);
            setFileError("");
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
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
        {files.canImportFile ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            data-testid="graph-template-import-file"
            onClick={importFromFile}
          >
            {t("importFile")}
          </Button>
        ) : null}
      </div>
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
        <div className="space-y-2">
          <p role="status" className="text-foreground-subtle">
            {reviewed ? t("exportReviewed") : t("exportReviewRequired")}
          </p>
          {reviewed && files.canExportFile && preview?.json ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              data-testid="graph-template-export-file"
              onClick={exportToFile}
            >
              {t("exportFile")}
            </Button>
          ) : null}
          {fileSaved ? (
            <p role="status" data-testid="graph-template-file-saved">
              {t("fileSaved")}
            </p>
          ) : null}
        </div>
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
      {fileError ? (
        <p role="alert" className="text-destructive" data-testid="graph-template-file-error">
          {fileError}
        </p>
      ) : null}
      {!files.canImportFile && !files.canExportFile ? (
        <p className="text-foreground-subtle">{t("fileUnavailable")}</p>
      ) : null}
      {saved ? (
        <p role="status" data-testid="graph-template-saved">
          {t("saved")}
        </p>
      ) : null}
    </details>
  );
}
