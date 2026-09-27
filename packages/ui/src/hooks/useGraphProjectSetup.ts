import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphProjectSetupRequest,
  GraphProjectSetupResult,
  GraphWorkspaceTarget,
} from "@zcode/services";
import { useWorkspaceServicesResolution } from "./useWorkspaceServices.js";
import { isLocalGraphTarget } from "@/graph-engineering/graphEngineeringView.js";
import {
  readGraphProjectSetup,
  invalidateGraphProjectSetupReads,
  type GraphProjectSetupReadState,
} from "@/graph-engineering/graphProjectSetupRead.js";

type WithoutTarget<T> = T extends unknown ? Omit<T, "target"> : never;
type Operation = WithoutTarget<GraphProjectSetupRequest>;
export function useGraphProjectSetup(target: GraphWorkspaceTarget) {
  const workspace = useMemo(
    () => ({
      workspacePath: target.workspacePath,
      ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
    }),
    [target.workspacePath, target.workspaceIdentity],
  );
  const resolution = useWorkspaceServicesResolution(
    target.workspacePath,
    undefined,
    target.workspaceIdentity,
  );
  const service =
    isLocalGraphTarget(target) && !resolution.isRemoteTarget
      ? resolution.services.graphWorkflowService
      : undefined;
  const scope = useMemo(
    () => ({ sequences: {} as Record<string, number> }),
    [service, target.workspacePath, target.workspaceIdentity],
  );
  const current = useRef<object>(scope);
  current.current = scope;
  const scan = useRef<{ scope: object; requestId: string } | undefined>(undefined);
  const [stored, setStored] = useState<{
    scope: object;
    lanes: Record<string, GraphProjectSetupReadState<GraphProjectSetupResult>>;
  }>({ scope, lanes: {} });
  useEffect(() => {
    current.current = scope;
    return () => {
      // StrictMode 可能复用同一 scope 重新安装 effect；旧生命周期的回执仍必须失效。
      invalidateGraphProjectSetupReads(scope);
      if (current.current === scope) current.current = {};
      if (scan.current?.scope === scope)
        void service
          ?.projectSetup({
            target: workspace,
            action: "cancel-scan",
            requestId: scan.current.requestId,
          })
          .catch(() => undefined);
    };
  }, [scope, service, workspace]);
  const invoke = useCallback(
    async (operation: Operation, key: string, inputCurrent: () => boolean = () => true) => {
      if (!service || current.current !== scope) return;
      const lane = operation.action === "cancel-scan" ? "scan" : operation.action;
      if (operation.action === "scan") scan.current = { scope, requestId: operation.requestId };
      const result = await readGraphProjectSetup({
        scope,
        lane,
        key,
        isCurrent: () => current.current === scope && inputCurrent(),
        read: () => service.projectSetup({ ...operation, target: workspace }),
        publish: (state) =>
          setStored((old) => ({
            scope,
            lanes: { ...(old.scope === scope ? old.lanes : {}), [lane]: state },
          })),
      });
      if (
        lane === "scan" &&
        scan.current?.scope === scope &&
        "requestId" in operation &&
        scan.current.requestId === operation.requestId
      )
        scan.current = undefined;
      return result;
    },
    [scope, service, workspace],
  );
  const state = (
    lane: string,
    key: string,
  ): GraphProjectSetupReadState<GraphProjectSetupResult> => {
    const value = stored.scope === scope ? stored.lanes[lane] : undefined;
    return value && value.status !== "idle" && value.key === key ? value : { status: "idle" };
  };
  return { supported: Boolean(service), invoke, state };
}
