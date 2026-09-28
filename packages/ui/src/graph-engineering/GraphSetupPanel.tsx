import { Button } from "@/components/ui/button.js";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { GraphProjectRecipes } from "./GraphProjectRecipes.js";

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
  onReturn,
  onRun,
}: {
  graph: GraphHook;
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  disabled: boolean;
  returnToWorkflow?: boolean;
  onReturn: () => void;
  onRun: (runId: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const u = (id: string) => intl.formatMessage({ id: `graph.preZ8.${id}` });
  return (
    <>
      {returnToWorkflow ? (
        <Button
          className="self-start"
          variant="outline"
          size="sm"
          data-testid="graph-return-to-workflow"
          onClick={onReturn}
        >
          {u("returnToWorkflow")}
        </Button>
      ) : null}
      <GraphProjectRecipes
        graph={graph}
        workspaceKey={workspaceKey}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        disabled={disabled}
        onRun={onRun}
      />
    </>
  );
}
