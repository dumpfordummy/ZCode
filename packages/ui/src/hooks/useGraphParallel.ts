import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphParallelView,
  GraphParallelPlan,
  GraphNativeSettings,
  IGraphParallelService,
} from "@zcode/services";
import { useWorkspaceServicesResolution } from "./useWorkspaceServices.js";
import type { GraphPanelProps } from "@/graph-engineering/graphEngineeringView.js";
import {
  graphWorkspaceTarget,
  isLocalGraphTarget,
} from "@/graph-engineering/graphEngineeringView.js";

/** Drafts and pending RPC intent only. Existing Host owns all accepted parallel work. */
export function useGraphParallel(scope: GraphPanelProps) {
  const resolution = useWorkspaceServicesResolution(
    scope.workspacePath,
    scope.remoteSessionId,
    scope.workspaceIdentity,
    scope.remoteTarget,
  );
  const service =
    isLocalGraphTarget(scope) && !resolution.isRemoteTarget
      ? resolution.services.graphParallelService
      : undefined;
  const target = useMemo(
    () => graphWorkspaceTarget(scope),
    [scope.workspacePath, scope.workspaceIdentity],
  );
  const [view, setView] = useState<GraphParallelView | null>(null),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(false);
  const generation = useRef(0),
    flight = useRef(false);
  const readSequence = useRef(0);
  const retained = useRef<Record<string, string>>({});
  const reload = useCallback(async () => {
    if (!service || !resolution.rpcReady) return;
    const owner = generation.current;
    const sequence = ++readSequence.current;
    try {
      const value = await service.get(target);
      // 多个刷新可交错返回；旧响应不得覆盖更新的 Host 投影，与顺序 Graph hook 保持相同规则。
      if (owner === generation.current && sequence === readSequence.current) setView(value);
    } catch (e) {
      if (owner === generation.current && sequence === readSequence.current)
        setError(e instanceof Error ? e.message : String(e));
    }
  }, [service, resolution.rpcReady, target]);
  useEffect(() => {
    generation.current++;
    setView(null);
    setError(null);
    retained.current = {};
    flight.current = false;
    setPending(false);
    void reload();
    const subscription = service?.onDidChange((e) => {
      if (e.workspaceKey === (target.workspaceIdentity?.trim() || target.workspacePath))
        void reload();
    });
    return () => {
      generation.current++;
      subscription?.dispose();
    };
  }, [service, target, reload]);
  const act = useCallback(
    async <T>(action: (service: IGraphParallelService) => Promise<T>): Promise<T | undefined> => {
      if (!service || flight.current) return;
      const owner = generation.current;
      flight.current = true;
      setPending(true);
      setError(null);
      try {
        const result = await action(service);
        await reload();
        return owner === generation.current ? result : undefined;
      } catch (e) {
        if (owner === generation.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (owner === generation.current) {
          flight.current = false;
          setPending(false);
        }
      }
    },
    [service, reload],
  );
  // 校验拒绝后可修正输入，但沿用原 ID；若先前已接受，Host 的载荷比对必须拒绝冲突重试。
  const requestId = (key: string) =>
    retained.current[key] ?? (retained.current[key] = crypto.randomUUID());
  return {
    view,
    error,
    pending,
    reload,
    supported: Boolean(service),
    save: (plan: GraphParallelPlan) =>
      act((s) => s.save({ target, plan, expectedRevision: plan.revision })),
    preview: (revision: number, settings: GraphNativeSettings) =>
      act((s) => s.preview({ target, revision, settings })),
    prepare: (
      revision: number,
      settings: GraphNativeSettings,
      previewDigest: string,
      acknowledgedUnknowns: boolean,
    ) =>
      act(async (s) => {
        const intents = retained.current;
        const request = {
          target,
          revision,
          settings,
          previewDigest,
          acknowledgedUnknowns,
          requestId: requestId("prepare"),
        };
        const run = await s.prepare(request);
        // 切工作区后旧请求才完成时，只清理旧映射，不能清除新工作区的未确认意图。
        delete intents.prepare;
        return run;
      }),
    decide: (
      input: Omit<Parameters<IGraphParallelService["decide"]>[0], "target" | "decisionId">,
    ) =>
      act(async (s) => {
        const intents = retained.current;
        const key = `${input.runId}:${input.phase}`,
          request = { target, ...input, decisionId: requestId(key) };
        const run = await s.decide(request);
        delete intents[key];
        return run;
      }),
    control: (input: Omit<Parameters<IGraphParallelService["control"]>[0], "target">) =>
      act((s) => s.control({ ...input, target })),
  };
}
