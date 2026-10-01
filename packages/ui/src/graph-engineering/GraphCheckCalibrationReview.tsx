import { useState } from "react";
import type { GraphChecksPreview } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog.js";
import { useGraphSetupText } from "./GraphSetupFields.js";

export function GraphCheckCalibrationReview({
  preview,
  workspacePath,
  pending,
  current,
  error,
  onConfirm,
  onClose,
}: {
  preview: GraphChecksPreview;
  workspacePath: string;
  pending: boolean;
  current: boolean;
  error: string;
  onConfirm(): void;
  onClose(): void;
}) {
  const t = useGraphSetupText();
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="graph-ui max-h-[90vh] overflow-auto sm:max-w-3xl"
        data-testid="graph-check-preview"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>{t("review")}</DialogTitle>
          <DialogDescription>{t("reviewHelp")}</DialogDescription>
        </DialogHeader>
        <p className="break-all text-ui-sm">{workspacePath}</p>
        {preview.recipes.map((recipe) => (
          <section
            key={recipe.id}
            className="space-y-2 rounded-lg border border-border p-3 text-ui-sm"
          >
            <p className="font-medium">{recipe.name}</p>
            <pre className="whitespace-pre-wrap break-all font-mono text-ui-xs">
              {JSON.stringify([recipe.executable, ...recipe.args])}
            </pre>
            <p>
              {t("cwd")}: {recipe.cwd} · {t("timeoutMs")}: {recipe.timeoutMs}
            </p>
            <details>
              <summary>{t("scopePreview")}</summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs">
                {JSON.stringify(
                  {
                    sourcePaths: recipe.sourcePaths,
                    expectedOutputs: recipe.expectedOutputs,
                    verifier: recipe.verifier,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </section>
        ))}
        <p className="text-ui-sm text-foreground-subtle">{t("executionPolicy")}</p>
        <section className="space-y-1 text-ui-sm">
          <h4 className="font-medium">{t("effects")}</h4>
          {preview.effects.map((effect, index) => (
            <p key={index}>{effect}</p>
          ))}
        </section>
        <section className="space-y-1 text-ui-sm text-warning">
          <h4 className="font-medium">{t("unknowns")}</h4>
          {preview.unknowns.map((unknown, index) => (
            <p key={index}>{unknown}</p>
          ))}
        </section>
        <details className="text-ui-sm">
          <summary>{t("reviewSnapshot")}</summary>
          <pre
            data-testid="graph-check-preview-snapshot"
            className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-ui-xs"
          >
            {JSON.stringify(preview, null, 2)}
          </pre>
        </details>
        {!current || error ? (
          <p
            role="alert"
            className="text-ui-sm text-destructive"
            data-testid="graph-check-preview-error"
          >
            {error || t("stalePreview")}
          </p>
        ) : null}
        <label className="flex items-start gap-2 text-ui-sm">
          <Checkbox
            disabled={pending || !current}
            checked={acknowledged}
            data-testid="graph-check-ack"
            onCheckedChange={(value) => setAcknowledged(value === true)}
          />
          {t("acknowledge")}
        </label>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            data-testid="graph-check-confirm"
            disabled={pending || !current || !acknowledged}
            onClick={onConfirm}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
