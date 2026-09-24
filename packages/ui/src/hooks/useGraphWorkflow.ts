import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphWorkspaceTarget } from "@zcode/services";
import type {
  GraphLibraryMutation,
  GraphLibraryView,
  IGraphWorkflowService,
} from "@zcode/services";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import { isLocalGraphTarget } from "@/graph-engineering/graphEngineeringView.js";

/** The library owner accepts mutations; this hook holds only the last read projection. */
export function useGraphWorkflow(target: GraphWorkspaceTarget) {
  const resolution = useWorkspaceServicesResolution(
    target.workspacePath,
    undefined,
    target.workspaceIdentity,
  );
  const service =
    isLocalGraphTarget(target) && !resolution.isRemoteTarget
      ? resolution.services.graphWorkflowService
      : undefined;
  const scope = useMemo(() => ({}), [service, target.workspacePath, target.workspaceIdentity]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      // 关闭或切换工作区后，旧请求不能回填已卸载的库或触发草稿替换。
      if (currentScope.current === scope) currentScope.current = {};
    };
  }, [scope]);
  const flight = useRef<object | null>(null);
  const [state, setState] = useState<{
    scope: object;
    view?: GraphLibraryView;
    pending?: boolean;
    error?: string;
  }>({ scope });
  const invoke = useCallback(
    async <T>(operation: (owner: IGraphWorkflowService) => Promise<T>) => {
      if (!service || flight.current === scope) return;
      flight.current = scope;
      setState((previous) => ({
        ...(previous.scope === scope ? previous : {}),
        scope,
        pending: true,
        error: undefined,
      }));
      try {
        const result = await operation(service);
        return currentScope.current === scope ? result : undefined;
      } catch (error) {
        if (currentScope.current === scope)
          setState((previous) => ({
            ...previous,
            scope,
            error: error instanceof Error ? error.message : String(error),
          }));
      } finally {
        if (currentScope.current === scope)
          setState((previous) => ({ ...previous, scope, pending: false }));
        if (flight.current === scope) flight.current = null;
      }
    },
    [scope, service],
  );
  const read = useCallback(
    () =>
      invoke(async (owner) => {
        const view = await owner.list();
        if (currentScope.current === scope) setState({ scope, view, pending: true });
        return view;
      }),
    [invoke, scope],
  );
  const mutate = useCallback(
    (mutation: GraphLibraryMutation, expectedRevision: number) =>
      invoke(async (owner) => {
        const view = await owner.mutate({ ...mutation, expectedRevision });
        if (currentScope.current === scope) setState({ scope, view, pending: true });
        return view;
      }),
    [invoke, scope],
  );
  return {
    supported: Boolean(service),
    view: state.scope === scope ? state.view : undefined,
    pending: state.scope === scope && Boolean(state.pending),
    error: state.scope === scope ? state.error : undefined,
    read,
    mutate,
    preview: useCallback(
      (params: Parameters<IGraphWorkflowService["preview"]>[0]) =>
        invoke((owner) => owner.preview(params)),
      [invoke],
    ),
    instantiate: useCallback(
      (params: Omit<Parameters<IGraphWorkflowService["instantiate"]>[0], "target">) =>
        invoke((owner) => owner.instantiate({ ...params, target })),
      [invoke, target],
    ),
  };
}
