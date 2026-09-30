import { Button } from "@/components/ui/button.js";
import { GraphWarningNote } from "./GraphWarningNote.js";
import type { GraphStepChecks } from "./graphCheckSelection.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import { useGraphSetupText } from "./GraphSetupFields.js";
import { useGraphM2Text } from "./GraphM2Text.js";
import { graphRecipeChangeOf, type GraphRecipeChanges } from "./graphRecipeChanges.js";

/**
 * UX-M1.2：新建运行里，某个 Build/Test 步骤当前所选的检查（名称、类型、已保存·未运行）。
 * 缺失或不兼容的选择原样显示存储的 id 与原因，只提供跳转到 Checks 的入口，不替用户改选。
 * 跳转不是变更，所以即使表单被锁定，入口也保持可用。
 */
export function GraphSelectedChecks({
  step,
  label,
  changes = { kind: "clean" },
  onOpenChecks,
}: {
  step: GraphStepChecks;
  label: string;
  /** UX-M2.2: unsaved check edits, only to mark a row; the row keeps showing the saved check. */
  changes?: GraphRecipeChanges;
  onOpenChecks(checkId?: string): void;
}) {
  const m1 = useGraphM1Text();
  const m2 = useGraphM2Text();
  const kind = useGraphSetupText();
  return (
    <ul
      className="space-y-1 text-ui-sm"
      aria-label={m1("stepChecksLabel", { step: label })}
      data-testid={`graph-selected-checks-${step.nodeId}`}
    >
      {step.checks.length === 0 ? (
        <li className="text-foreground-subtle" data-testid="graph-selected-check-none">
          {m1("noCheckSelected")}
        </li>
      ) : (
        step.checks.map((check) => {
          const unresolved = check.state === "missing" || check.state === "incompatible";
          const unsaved =
            check.state === "resolved" ? graphRecipeChangeOf(changes, check.id) : undefined;
          return (
            <li
              key={check.id}
              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
              data-testid="graph-selected-check"
              data-check-id={check.id}
              data-state={check.state}
            >
              {check.state === "resolved" && check.recipe ? (
                <>
                  <span className="font-medium break-words">{check.recipe.name}</span>
                  <span className="text-foreground-subtle">
                    {kind(check.recipe.verifier.kind)} · {m1("checkSavedNotRun")}
                  </span>
                  {unsaved ? (
                    <GraphWarningNote
                      as="span"
                      data-testid="graph-selected-check-unsaved"
                      data-change={unsaved}
                    >
                      {m2(unsaved === "modified" ? "selectedModified" : "selectedRemoved")}
                    </GraphWarningNote>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={m1("editCheckNamed", { name: check.recipe.name })}
                    data-testid="graph-selected-check-edit"
                    onClick={() => onOpenChecks(check.id)}
                  >
                    {m1("editCheck")}
                  </Button>
                </>
              ) : unresolved ? (
                <>
                  <span role="status" className="text-warning break-words">
                    {m1(check.state === "missing" ? "checkMissing" : "checkIncompatible", {
                      id: check.id,
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={m1("openChecksFor", { id: check.id })}
                    data-testid="graph-selected-check-open"
                    // 缺失的检查没有可编辑的对象，只能打开 Checks；不兼容的检查仍可打开它自己的编辑器。
                    onClick={() =>
                      onOpenChecks(check.state === "incompatible" ? check.id : undefined)
                    }
                  >
                    {m1("openChecks")}
                  </Button>
                </>
              ) : (
                <span className="text-foreground-subtle break-all">
                  {check.id} · {m1("checksUnread")}
                </span>
              )}
            </li>
          );
        })
      )}
    </ul>
  );
}
