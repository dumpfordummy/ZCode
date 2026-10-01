import { useEffect, useRef, useState } from "react";
import type { GraphLibraryEntry, GraphWorkspaceTarget } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useGraphTemplateFiles } from "@/hooks/useGraphTemplateFiles.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphPortableReview } from "./GraphPortableReview.js";
import { useGraphWorkflowLabel } from "./GraphLibraryPicker.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { usePortableFlow } from "./usePortableFlow.js";

/**
 * Export selected version: exactly one stored version of one workflow, named in the task. The unsaved
 * Workflows canvas is never part of it. Saving to disk is blocked while a run owns the workspace
 * because the OS save dialog could write anywhere, including inside it.
 */
export function GraphShareExport({
  workflow,
  entry,
  version,
  disabled,
  exportBlocked,
  target,
}: {
  workflow: ReturnType<typeof useGraphWorkflow>;
  entry?: GraphLibraryEntry;
  version?: number;
  disabled: boolean;
  exportBlocked?: string;
  target: GraphWorkspaceTarget;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  const label = useGraphWorkflowLabel();
  const files = useGraphTemplateFiles(target);
  const flow = usePortableFlow();
  const [exported, setExported] = useState<{ name: string; version: number }>();
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const ready = Boolean(entry && version !== undefined);
  const exportToFile = () => {
    if (exportBlocked || !flow.preview?.json || !flow.reviewed || !entry || version === undefined)
      return;
    const subject = { name: label.name(entry), version };
    setError("");
    setExported(undefined);
    void files
      .exportFile(flow.preview.json, () => alive.current)
      .then((result) => {
        // 取消返回 { success: false, canceled: true }：既不是成功也不是失败，什么都不显示。
        if (result?.success) setExported(subject);
        else if (result?.error) setError(result.error);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  return (
    <div className="space-y-2" data-testid="graph-share-export">
      <h4 className="font-medium">{m3("shareExportTitle")}</h4>
      {entry && version !== undefined ? (
        <p className="font-medium" data-testid="graph-export-subject">
          {m3("exportSubject", { name: label.name(entry), version })}
        </p>
      ) : (
        <p className="text-foreground-subtle">{m3("exportNone")}</p>
      )}
      <p className="text-foreground-subtle">{m3("exportScope")}</p>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !ready}
        data-testid="graph-library-export"
        onClick={() => {
          if (!entry || version === undefined) return;
          setExported(undefined);
          void workflow.preview({ action: "export", id: entry.id, version }).then(flow.accept);
        }}
      >
        {t("exportPreview")}
      </Button>
      <GraphPortableReview prefix="graph-export" flow={flow} disabled={disabled} />
      {flow.reviewed && flow.preview?.json ? (
        <div className="space-y-2">
          <p role="status" className="text-foreground-subtle">
            {t("exportReviewed")}
          </p>
          {files.canExportFile ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || Boolean(exportBlocked)}
              aria-describedby={exportBlocked ? "graph-template-export-blocked" : undefined}
              data-testid="graph-template-export-file"
              onClick={exportToFile}
            >
              {t("exportFile")}
            </Button>
          ) : (
            <p className="text-foreground-subtle">{t("fileUnavailable")}</p>
          )}
          {exportBlocked ? (
            <p
              id="graph-template-export-blocked"
              role="status"
              className="text-warning"
              data-testid="graph-template-export-blocked"
            >
              {exportBlocked}
            </p>
          ) : null}
        </div>
      ) : null}
      {exported ? (
        <p role="status" data-testid="graph-template-file-saved">
          {m3("exportedAs", exported)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive" data-testid="graph-export-file-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
