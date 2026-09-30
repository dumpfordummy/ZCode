import { Button } from "@/components/ui/button.js";
import { GraphWarningNote } from "./GraphWarningNote.js";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useGraphM1Text } from "./GraphM1Text.js";
import { GraphProjectRecipes } from "./GraphProjectRecipes.js";
import { useGraphM2Text } from "./GraphM2Text.js";
import { useGraphRecipeChanges } from "./GraphRecipeChanges.js";

type GraphHook = ReturnType<typeof useGraphEngineering>;

/**
 * 项目设置视图：返回工作流入口 + 已保存检查列表。
 * 从 GraphEditor 抽取以控制单文件行数。
 */
export function GraphSetupPanel({
  graph,
  workspaceKey,
  workspacePath,
  workspaceIdentity,
  disabled,
  returnToWorkflow,
  checkId,
  onReturn,
  onRun,
}: {
  graph: GraphHook;
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  disabled: boolean;
  returnToWorkflow?: boolean;
  /** UX-M1.2: open this saved check (stable id) on arrival. Navigation only. */
  checkId?: string;
  onReturn: () => void;
  onRun: (runId: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  const m1 = useGraphM1Text();
  const m2 = useGraphM2Text();
  // UX-M2.2：返回始终立即生效；有未保存的检查编辑时，在返回按钮旁说明它们保留且下一次运行不使用。
  const unsaved = useGraphRecipeChanges(workspaceKey).kind !== "clean";
  return (
    <>
      {returnToWorkflow ? (
        // 粘性返回栏：编辑靠下的字段时，回到新建运行的入口始终在视口内。草稿从未离开 store。
        // -top-3/-mt-3/pt-3 抵消滚动容器的 p-3：粘性偏移不含内边距，否则滚动内容会从栏上方露出一条缝。
        <div
          className="sticky -top-3 z-10 -mx-3 -mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-background px-3 pb-2 pt-3"
          data-testid="graph-return-bar"
        >
          <Button
            variant="outline"
            size="sm"
            aria-describedby="graph-return-note"
            data-testid="graph-return-to-workflow"
            onClick={onReturn}
          >
            {u("returnToWorkflow")}
          </Button>
          <p
            id="graph-return-note"
            className="min-w-0 flex-1 text-ui-sm text-foreground-subtle"
            data-testid="graph-return-note"
          >
            {m1("returnKept")}
            {unsaved ? (
              <GraphWarningNote as="span" className="flex" data-testid="graph-return-unsaved">
                {m2("returnUnsaved")}
              </GraphWarningNote>
            ) : null}
          </p>
        </div>
      ) : null}
      <GraphProjectRecipes
        graph={graph}
        workspaceKey={workspaceKey}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        disabled={disabled}
        checkId={checkId}
        onRun={onRun}
      />
    </>
  );
}
