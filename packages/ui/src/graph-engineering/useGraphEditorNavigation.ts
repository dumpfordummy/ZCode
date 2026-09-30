import {
  useGraphEngineeringViewStore,
  type GraphViewMode,
} from "@/store/graphEngineeringViewStore.js";
import type { GraphNeedsYouItem } from "./graphNeedsYouQueue.js";

/**
 * GraphEditor 的用户导航：每个入口都先关闭内联审阅（使更早的预检回执作废），再写导航状态。
 * UX-M1.3 的焦点请求随导航一起写入（见 GraphFocusRequest），只由发起这次导航的动作设置。
 */
export function useGraphEditorNavigation({
  workspaceKey,
  newRunPane,
  checkId,
  dismissConfirmation,
}: {
  workspaceKey: string;
  newRunPane: boolean;
  /** The check the Checks editor was opened on, so Back can return to its control. */
  checkId?: string;
  dismissConfirmation(): void;
}) {
  const select = useGraphEngineeringViewStore((state) => state.select);
  const selectRun = useGraphEngineeringViewStore((state) => state.selectRun);
  return {
    /** Tabs. Entering Checks from the New-run pane offers the way back; anywhere else clears it. */
    destination(mode: GraphViewMode) {
      dismissConfirmation();
      if (mode === "setup")
        select(workspaceKey, { mode, returnToWorkflow: newRunPane, checkId: undefined });
      else select(workspaceKey, { mode });
    },
    /** Set up checks from the New-run form or Workflows, optionally on one saved check. */
    openCheckSetup: (id?: string) =>
      select(workspaceKey, { mode: "setup", returnToWorkflow: true, checkId: id }),
    newRun() {
      dismissConfirmation();
      select(workspaceKey, { mode: "runs", pane: "new", focus: "draft" });
    },
    /** A history row: focus stays on the row. */
    selectRun(runId: string) {
      dismissConfirmation();
      selectRun(workspaceKey, runId);
    },
    /** The user asked to view a run (View current run): focus follows to the run summary. */
    viewRun(runId: string) {
      dismissConfirmation();
      selectRun(workspaceKey, runId);
      select(workspaceKey, { focus: "run" });
    },
    goToRun(item: GraphNeedsYouItem) {
      dismissConfirmation();
      selectRun(workspaceKey, item.runId, { nodeId: item.nodeId, attemptId: item.attemptId });
      select(workspaceKey, { focus: "run" });
    },
    /** Back from Checks: to the control that opened the editor, else the request field. */
    returnToDraft: () =>
      select(workspaceKey, {
        mode: "runs",
        pane: "new",
        returnToWorkflow: false,
        focus: checkId ? { checkId } : "draft",
      }),
  };
}
