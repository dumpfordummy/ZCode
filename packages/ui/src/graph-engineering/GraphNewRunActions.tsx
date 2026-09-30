import { Play } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM1Text } from "./GraphM1Text.js";

/**
 * 新建运行的操作栏：主操作、次要操作，以及紧邻它们的“为什么不可用”与去处。
 * 原因只显示一条（编辑锁 > 运行占用 > 检查未读 > 字段未解决），并由 aria-describedby 关联到两个按钮。
 * 主操作被禁用时它不可聚焦，所以原因是普通文本（role=status），去处（查看当前运行、前往第一个字段）是可聚焦的按钮。
 */
export function GraphNewRunActions({
  allowReview,
  blocked,
  reason,
  blockedBy,
  onReview,
  onSave,
  onViewCurrentRun,
  onGoToFirstField,
  error,
}: {
  allowReview: boolean;
  blocked: boolean;
  reason?: string;
  blockedBy?: "draft-lock" | "run-active" | "checks" | "fields";
  onReview(): void;
  onSave(): void;
  onViewCurrentRun?(): void;
  onGoToFirstField?(): void;
  /** A failed instantiate/preflight, shown here so it is seen next to the action that caused it. */
  error?: string;
}) {
  const { intl } = useZCodeIntl();
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const m1 = useGraphM1Text();
  return (
    <div
      className={`${allowReview ? "sticky -bottom-3 z-10 -mx-3 -mb-3 border-t border-border bg-background px-3 pb-5 pt-2 " : ""}flex flex-wrap items-center gap-2`}
      data-testid="graph-new-run-actions"
    >
      {allowReview ? (
        <Button
          size="lg"
          disabled={blocked}
          aria-describedby="graph-template-create-reason"
          data-testid="graph-review-run"
          onClick={() => {
            if (blocked) return;
            onReview();
          }}
        >
          <Play className="size-4" />
          {u("reviewAndRun")}
        </Button>
      ) : null}
      <Button
        size={allowReview ? "sm" : "default"}
        variant={allowReview ? "outline" : "default"}
        disabled={blocked}
        aria-describedby="graph-template-create-reason"
        data-testid="graph-library-instantiate"
        onClick={() => {
          if (blocked) return;
          onSave();
        }}
      >
        {u(allowReview ? "saveAsWorkflow" : "createWorkflow")}
      </Button>
      {error ? (
        <p
          role="alert"
          className="basis-full break-words text-ui-sm text-destructive"
          data-testid="graph-new-run-error"
        >
          {error}
        </p>
      ) : null}
      {reason ? (
        <div
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          data-testid="graph-new-run-blocked"
          data-blocked-by={blockedBy}
        >
          <p id="graph-template-create-reason" role="status" className="text-ui-sm text-warning">
            {reason}
          </p>
          {blockedBy === "run-active" && onViewCurrentRun ? (
            <Button
              variant="outline"
              data-testid="graph-view-current-run"
              onClick={onViewCurrentRun}
            >
              {m1("viewCurrentRun")}
            </Button>
          ) : null}
          {blockedBy === "fields" && onGoToFirstField ? (
            <Button
              variant="outline"
              data-testid="graph-go-to-first-field"
              onClick={onGoToFirstField}
            >
              {m1("goToFirstField")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
