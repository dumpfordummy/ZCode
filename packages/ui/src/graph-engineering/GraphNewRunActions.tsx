import { Play } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import { useGraphM3Text } from "./GraphM3Text.js";
import { useGraphM4Text } from "./GraphM4Text.js";
import { GraphFailureText } from "./GraphFailureText.js";

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
  fieldsAction = "first-field",
  error,
  errorKind = "review",
}: {
  allowReview: boolean;
  blocked: boolean;
  reason?: string;
  blockedBy?: "draft-lock" | "run-active" | "checks" | "fields";
  onReview(): void;
  onSave(): void;
  onViewCurrentRun?(): void;
  onGoToFirstField?(): void;
  /** UX-M4: in the library dialog off the Use tab the way to the missing fields is "Open Use". */
  fieldsAction?: "first-field" | "open-use";
  /** A failed instantiate/preflight, shown here so it is seen next to the action that caused it. */
  error?: string;
  /** UX-M2.3: which admission step failed, for the UI-owned framing above the verbatim message. */
  errorKind?: "review" | "start";
}) {
  const { intl } = useZCodeIntl();
  const u = (key: string) => intl.formatMessage({ id: `graph.preZ8.${key}` });
  const m1 = useGraphM1Text();
  const m3 = useGraphM3Text();
  const m4 = useGraphM4Text();
  return (
    <div
      className={`${allowReview ? "sticky -bottom-4 z-10 -mx-4 -mb-4 border-t border-border bg-background px-4 pb-4 pt-3 " : ""}flex flex-wrap items-center gap-x-3 gap-y-2`}
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
        variant="outline"
        disabled={blocked}
        aria-describedby="graph-template-create-reason"
        data-testid="graph-library-instantiate"
        onClick={() => {
          if (blocked) return;
          onSave();
        }}
      >
        {allowReview ? u("saveAsWorkflow") : m3("loadIntoDesign")}
      </Button>
      {/* 就绪指“可以进入下一步（审阅）”，不代表检查通过；确认之前不会开始任何执行。 */}
      {allowReview && !blocked && !error ? (
        <p
          role="status"
          className="text-ui-sm text-foreground-subtle"
          data-testid="graph-new-run-ready"
        >
          {m4("readyToReview")}
        </p>
      ) : null}
      {error ? (
        <GraphFailureText
          testId="graph-new-run-error"
          framing={errorKind === "start" ? "startFailed" : "reviewFailed"}
          message={error}
        />
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
              data-testid={
                fieldsAction === "open-use" ? "graph-library-open-use" : "graph-go-to-first-field"
              }
              onClick={onGoToFirstField}
            >
              {fieldsAction === "open-use" ? m4("openUse") : m1("goToFirstField")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
