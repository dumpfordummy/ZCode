import { useEffect } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useGraphSupportBundle } from "@/hooks/useGraphSupportBundle.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useOptionalBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { SupportBundleErrorId } from "./supportBundle.js";

const ERROR_KEY: Record<Exclude<SupportBundleErrorId, "save-failed">, string> = {
  unavailable: "errorUnavailable",
  "profile-unreadable": "errorProfileUnreadable",
  "too-large": "errorTooLarge",
  "privacy-check-failed": "errorPrivacyCheckFailed",
  mismatch: "errorMismatch",
  generic: "errorGeneric",
};
const SECTION_KEY: Record<string, string> = {
  identity: "sectionIdentity",
  runtime: "sectionRuntime",
  os: "sectionOs",
  capabilities: "sectionCapabilities",
  policy: "sectionPolicy",
  profile: "sectionProfile",
  workspaces: "sectionWorkspaces",
  runs: "sectionRuns",
};

/**
 * Z8.3-S1：本地 Graph 支持包对话框。打开即在本机生成并展示：包含的类别、精确字节数、完整的文件文本；
 * “保存…”是唯一的写入动作，走既有保存文件边界。没有上传、提交、发送或重试上传。
 */
export function GraphSupportBundleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { intl } = useZCodeIntl();
  const t = (key: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id: `graph.s1.${key}` }, values);
  const platform = useOptionalPlatform();
  const service = useOptionalBaseWorkspaceServices()?.graphSupportService;
  const { state, generate, save, reset } = useGraphSupportBundle(service, platform);

  useEffect(() => {
    if (open) void generate();
    else reset();
  }, [open, generate, reset]);

  const busy = state.status === "generating" || state.status === "saving";
  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent
        className="graph-ui max-h-[88vh] gap-3 overflow-hidden sm:max-w-3xl"
        data-testid="graph-support-bundle-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {state.status === "idle" || state.status === "generating" ? (
            <p role="status" className="text-foreground-subtle">
              {t("preparing")}
            </p>
          ) : null}
          {state.status === "error" ? (
            <p role="alert" data-testid="graph-support-bundle-error" className="text-destructive">
              {t(ERROR_KEY[state.errorId as keyof typeof ERROR_KEY] ?? "errorGeneric")}
            </p>
          ) : null}
          {state.status === "ready" || state.status === "saving" ? (
            <>
              <section>
                <h4 className="font-medium">{t("includedTitle")}</h4>
                <ul className="list-disc pl-5" data-testid="graph-support-bundle-sections">
                  {state.result.sections.map((section) => (
                    <li key={section.id}>
                      {t(SECTION_KEY[section.id] ?? "sectionProfile", {
                        count: section.count,
                      })}
                    </li>
                  ))}
                </ul>
                <p className="text-foreground-subtle">{t("workspaceNote")}</p>
              </section>
              <section>
                <h4 className="font-medium">{t("notIncludedTitle")}</h4>
                <p className="text-foreground-subtle">{t("notIncluded")}</p>
              </section>
              <p className="font-medium" data-testid="graph-support-bundle-size">
                {t("size", { bytes: state.prepared.byteLength })}
              </p>
              <section>
                <h4 className="font-medium">{t("previewLabel")}</h4>
                <pre
                  tabIndex={0}
                  aria-label={t("previewLabel")}
                  data-testid="graph-support-bundle-preview"
                  className="max-h-64 overflow-auto rounded-md border border-border bg-surface p-2 text-ui-xs"
                >
                  {state.result.json}
                </pre>
              </section>
              {state.status === "ready" && state.saved ? (
                <p role="status" data-testid="graph-support-bundle-saved">
                  {state.saved.path ? t("saved", { path: state.saved.path }) : t("savedNoPath")}
                </p>
              ) : null}
              {state.status === "ready" && state.saveError ? (
                <p role="alert" className="text-destructive">
                  {t("errorSaveFailed", {
                    code: state.saveError.code ?? "unknown",
                  })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <DialogFooter>
          {state.status === "error" ? (
            <Button
              variant="outline"
              onClick={() => void generate()}
              data-testid="graph-support-bundle-regenerate"
            >
              {t("regenerate")}
            </Button>
          ) : null}
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          {state.status === "ready" || state.status === "saving" ? (
            <Button
              disabled={state.status === "saving" || !platform?.saveFile}
              onClick={() => void save()}
              data-testid="graph-support-bundle-save"
            >
              {state.status === "saving" ? t("saving") : t("save")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
