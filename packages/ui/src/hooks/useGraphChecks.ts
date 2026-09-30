import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  GraphChecksPreview,
  GraphRunChecksCommand,
  GraphWorkspaceTarget,
  GraphWorkspaceView,
  IGraphEngineeringService,
} from "@zcode/services";
import {
  captureGraphChecksCommand,
  graphChecksRequestAfterError,
  graphChecksRequestAfterProjection,
  type GraphChecksRequest,
} from "@/graph-engineering/graphChecksView.js";
import { assertGraphAdmission } from "@/graph-engineering/graphAdmission.js";

/** Calibration uses the existing Graph admission directly and never saves the current design. */
export function useGraphChecks(
  service: IGraphEngineeringService | undefined,
  target: GraphWorkspaceTarget,
  act: <T>(operation: () => Promise<T>) => Promise<T | undefined>,
  view: GraphWorkspaceView | null,
) {
  const scope = useMemo(() => ({}), [service, target]);
  const current = useRef<object>(scope);
  current.current = scope;
  const retained = useRef<GraphChecksRequest | undefined>(undefined);
  const latestView = useRef(view);
  latestView.current = view;
  useEffect(() => {
    current.current = scope;
    return () => {
      if (current.current === scope) current.current = {};
    };
  }, [scope]);
  useEffect(() => {
    // React 投影可能晚于 RPC finally 提交；后续事实到达时也必须按原 request 完成对账。
    if (current.current === scope)
      retained.current = graphChecksRequestAfterProjection(
        retained.current,
        scope,
        view?.runs ?? [],
      );
  }, [scope, view]);
  return useCallback(
    async (preview: GraphChecksPreview, acknowledged: boolean) => {
      if (!service || current.current !== scope) return;
      let command: GraphRunChecksCommand | undefined;
      const run = await act(async () => {
        const previous = retained.current?.scope === scope ? retained.current.command : undefined;
        // UX-M1：检查运行同样是准入路径；丢失回执后同一 request 的重发不算第二次准入。
        assertGraphAdmission(latestView.current?.runs ?? [], {
          reconcilingRequestId: previous?.requestId,
        });
        command = captureGraphChecksCommand(
          target,
          preview,
          acknowledged,
          crypto.randomUUID(),
          previous,
        );
        retained.current = { scope, command };
        try {
          return await service.run(command);
        } catch (error) {
          retained.current = graphChecksRequestAfterError(
            retained.current,
            scope,
            current.current,
            command,
            error,
          );
          throw error;
        }
      });
      if (current.current !== scope) return;
      // 丢失回执后只能用相同 request 的已保存事实对账，不能为同一意图另发新运行。
      const accepted =
        run ?? latestView.current?.runs.find((item) => item.requestId === command?.requestId);
      if (accepted) {
        retained.current = undefined;
        return accepted.id;
      }
    },
    [act, scope, service, target],
  );
}
