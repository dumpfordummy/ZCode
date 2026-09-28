import { useState } from "react";
import type { GraphDefinition, GraphNativeSettings } from "@zcode/services";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import type { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";
import type {
  GraphRunConfirmationSnapshot,
  GraphSubmission,
} from "./graphSubmission.js";

type GraphHook = ReturnType<typeof useGraphEngineering>;
type SelectFn = ReturnType<
  typeof useGraphEngineeringViewStore.getState
>["select"];

/**
 * 运行动作与确认快照状态。
 * 从 GraphEditor 抽取以控制单文件行数；行为与原内联实现完全一致。
 */
export function useGraphRunActions({
  graph,
  displayed,
  defaults,
  workspaceKey,
  select,
}: {
  graph: GraphHook;
  displayed: GraphDefinition;
  defaults: GraphNativeSettings | null;
  workspaceKey: string;
  select: SelectFn;
}) {
  const [confirmation, setConfirmation] =
    useState<GraphRunConfirmationSnapshot | null>(null);

  const startRun = (
    draft: GraphDefinition,
    settings: GraphNativeSettings,
    confirmed = false,
    preflight?: GraphSubmission["preflight"],
  ) =>
    void graph
      .run(
        draft,
        settings.modelSelection,
        settings.mode,
        settings.planEnabled,
        confirmed,
        preflight,
      )
      .then((runId) => {
        if (runId) {
          setConfirmation(null);
          select(workspaceKey, {
            mode: "runs",
            runId,
            attemptId: undefined,
            regionId: undefined,
          });
        }
      });

  const handleRun = () => {
    if (!defaults) return;
    if (displayed.version === 5)
      void graph
        .prepareRunConfirmation(displayed, defaults)
        .then((snapshot) => {
          if (snapshot) setConfirmation(snapshot);
        });
    else startRun(displayed, defaults);
  };

  return { confirmation, setConfirmation, startRun, handleRun };
}
