import { useEffect, useRef, useState } from "react";
import type { GraphLibraryView, GraphWorkspaceTarget } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import type { useGraphWorkflow } from "@/hooks/useGraphWorkflow.js";
import { useGraphTemplateFiles } from "@/hooks/useGraphTemplateFiles.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphPortableReview } from "./GraphPortableReview.js";
import { GraphPortableSave } from "./GraphPortableSave.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import type { GraphMutationResult } from "./graphLibrarySave.js";
import { usePortableFlow, useSaveTarget } from "./usePortableFlow.js";

/**
 * Import in three separate steps: choose (a file, or pasted JSON under Advanced), preview and review
 * (no mutation, allowed while a run owns the workspace), save into the library (explicit target,
 * refused while a run owns the workspace). Choosing or previewing never saves anything.
 */
export function GraphShareImport({
  manual,
  workflow,
  view,
  mutationBlocked,
  blockedId,
  target,
  onSaved,
}: {
  /** Advanced: an editable JSON field instead of the file chooser. */
  manual: boolean;
  workflow: ReturnType<typeof useGraphWorkflow>;
  view: GraphLibraryView;
  mutationBlocked?: string;
  blockedId: string;
  target: GraphWorkspaceTarget;
  onSaved(
    result: GraphMutationResult | undefined,
    before: GraphLibraryView,
    after: GraphLibraryView,
  ): void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string) => intl.formatMessage({ id: `graph.z6.${key}` });
  const m3 = useGraphM3Text();
  const prefix = manual ? "graph-manual" : "graph-import";
  const files = useGraphTemplateFiles(target);
  const flow = usePortableFlow();
  const [saveTarget, setSaveTarget] = useSaveTarget(view.entries, { kind: "new" });
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // 选择文件：selectFile → 有界读取 → 致命 UTF-8 解码 → 预览。取消或作用域失效返回 undefined；
  // 格式/编码错误显示在这里，不覆盖未保存的设计。这一步不修改资料库。
  const chooseFile = () => {
    setError("");
    void files
      .importFile(() => alive.current)
      .then((result) => {
        if (!result) return;
        flow.setJson(result.json);
        void workflow.preview({ action: "import", json: result.json }).then(flow.accept);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  return (
    <div className="space-y-2" data-testid={manual ? "graph-manual-task" : "graph-share-import"}>
      <h4 className="font-medium">{m3(manual ? "manualTitle" : "shareImportTitle")}</h4>
      <p className="text-foreground-subtle">{m3(manual ? "manualHelp" : "importHelp")}</p>
      {manual ? (
        <Button
          size="sm"
          variant="outline"
          disabled={workflow.pending || !flow.json.trim()}
          data-testid="graph-manual-preview"
          onClick={() =>
            void workflow.preview({ action: "import", json: flow.json }).then(flow.accept)
          }
        >
          {t("dryPreview")}
        </Button>
      ) : files.canImportFile ? (
        <Button
          size="sm"
          variant="outline"
          disabled={workflow.pending}
          data-testid="graph-template-import-file"
          onClick={chooseFile}
        >
          {m3("importChoose")}
        </Button>
      ) : (
        <p className="text-foreground-subtle" data-testid="graph-import-no-file">
          {m3("importNoFile")}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-destructive" data-testid="graph-import-file-error">
          {error}
        </p>
      ) : null}
      <GraphPortableReview
        prefix={prefix}
        flow={flow}
        disabled={workflow.pending}
        editable={manual}
      />
      {flow.preview ? (
        <GraphPortableSave
          prefix={prefix}
          workflow={workflow}
          flow={flow}
          entries={view.entries}
          view={view}
          target={saveTarget}
          onTarget={setSaveTarget}
          mutationBlocked={mutationBlocked}
          blockedId={blockedId}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}
