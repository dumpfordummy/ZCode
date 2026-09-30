import { useState } from "react";
import type { GraphDefinition, GraphNativeSettings } from "@zcode/services";
import type { useGraphEngineering } from "@/hooks/useGraphEngineering.js";
import type { useGraphEngineeringViewStore } from "@/store/graphEngineeringViewStore.js";
import type { GraphAdmission } from "./graphAdmission.js";
import type { GraphRunConfirmationSnapshot, GraphSubmission } from "./graphSubmission.js";

type GraphHook = ReturnType<typeof useGraphEngineering>;
type SelectRunFn = ReturnType<typeof useGraphEngineeringViewStore.getState>["selectRun"];

/**
 * 运行动作与确认快照状态。
 * 准备确认只读取/保存设计并请求预检，不执行任何工作；只有 startRun（显式 Start）才提交运行。
 */
export function useGraphRunActions({
  graph,
  displayed,
  defaults,
  workspaceKey,
  selectRun,
  admission,
}: {
  graph: GraphHook;
  displayed: GraphDefinition;
  defaults: GraphNativeSettings | null;
  workspaceKey: string;
  selectRun: SelectRunFn;
  /** UX-M1：占用期间 handleRun/startRun 一律拒绝（不只是按钮禁用）；graph.run 另有 Hook 级拒绝。 */
  admission: GraphAdmission;
}) {
  const [confirmation, setConfirmation] = useState<GraphRunConfirmationSnapshot | null>(null);

  const startRun = (
    draft: GraphDefinition,
    settings: GraphNativeSettings,
    confirmed = false,
    preflight?: GraphSubmission["preflight"],
  ) => {
    if (admission.blocked) return;
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
          selectRun(workspaceKey, runId);
        }
      });
  };

  /** `definition` defaults to the current design draft; Review and run passes the saved instance. */
  const handleRun = (definition: GraphDefinition = displayed) => {
    if (!defaults || admission.blocked) return;
    if (definition.version === 5)
      void graph.prepareRunConfirmation(definition, defaults).then((snapshot) => {
        if (snapshot) setConfirmation(snapshot);
      });
    else startRun(definition, defaults);
  };

  return { confirmation, setConfirmation, startRun, handleRun };
}
