import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphDefinition, GraphWorkspaceView } from "@zcode/services";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import {
  graphWorkspaceTarget,
  isLocalGraphTarget,
} from "@/graph-engineering/graphEngineeringView.js";

interface GraphScope {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string | null;
  remoteTarget?: unknown;
}

/** The Host schedules work. This hook only reads projections and handles explicit user actions. */
export function useGraphEngineering(scope: GraphScope) {
  const resolution = useWorkspaceServicesResolution(
    scope.workspacePath,
    scope.remoteSessionId,
    scope.workspaceIdentity,
    scope.remoteTarget,
  );
  const local = isLocalGraphTarget(scope) && !resolution.isRemoteTarget;
  const service = local ? resolution.services.graphEngineeringService : undefined;
  const target = useMemo(
    () =>
      graphWorkspaceTarget({
        workspacePath: scope.workspacePath,
        workspaceIdentity: scope.workspaceIdentity,
      }),
    [scope.workspacePath, scope.workspaceIdentity],
  );
  const targetKey = target.workspaceIdentity?.trim() || target.workspacePath;
  const [view, setView] = useState<GraphWorkspaceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const flight = useRef<number | null>(null);
  const requestId = useRef<string | null>(null);
  const generation = useRef(0);
  const readSequence = useRef(0);
  const reload = useCallback(async () => {
    if (!service) return;
    const owner = generation.current;
    const sequence = ++readSequence.current;
    try {
      const next = await service.getWorkspace(target);
      if (owner === generation.current && sequence === readSequence.current) {
        setView(next);
        setLoading(false);
      }
    } catch (cause) {
      if (owner === generation.current && sequence === readSequence.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      }
    }
  }, [service, target]);

  useEffect(() => {
    generation.current += 1;
    setView(null);
    setError(null);
    setLoading(Boolean(service));
    setPending(false);
    requestId.current = null;
    if (!service) return;
    const subscription = service.onDidChange(({ workspaceKey }) => {
      if (workspaceKey === targetKey) void reload();
    });
    void reload();
    return () => {
      generation.current += 1;
      subscription.dispose();
    };
  }, [service, target, targetKey, reload]);

  const act = useCallback(
    async (operation: () => Promise<void>) => {
      const owner = generation.current;
      if (flight.current === owner) return;
      flight.current = owner;
      setPending(true);
      setError(null);
      try {
        await operation();
      } catch (cause) {
        if (owner === generation.current)
          setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (owner === generation.current) {
          await reload();
          if (owner === generation.current) setPending(false);
        }
        // 切 workspace 后旧 RPC 才完成，不能清除新 workspace 的动作或锁住新编辑器。
        if (flight.current === owner) flight.current = null;
      }
    },
    [reload],
  );

  const save = useCallback(
    (definition: GraphDefinition) =>
      act(async () => {
        if (!service) return;
        await service.saveDefinition({ target, definition, expectedRevision: definition.revision });
      }),
    [act, service, target],
  );

  const run = useCallback(
    (
      definition: GraphDefinition,
      modelSelection: ModelSelection,
      mode: SubmissionMode,
      planEnabled: boolean,
    ) =>
      act(async () => {
        if (!service) return;
        const owner = generation.current;
        const dispatchId = requestId.current ?? crypto.randomUUID();
        requestId.current = dispatchId;
        const saved = await service.saveDefinition({
          target,
          definition,
          expectedRevision: definition.revision,
        });
        // 丢失 ACK 后保留同一 requestId；刷新只对账，不能盲目创建新输入。
        await service.run({
          target,
          revision: saved.revision,
          requestId: dispatchId,
          modelSelection,
          mode,
          planEnabled,
        });
        if (owner === generation.current) requestId.current = null;
      }),
    [act, service, target],
  );

  const cancel = useCallback(
    (runId: string) =>
      act(async () => {
        await service?.cancel({ target, runId });
      }),
    [act, service, target],
  );

  return {
    view,
    loading,
    pending,
    error,
    local,
    supported: Boolean(service),
    save,
    run,
    cancel,
    reload,
  };
}

/** UI indication only; the native Host guard remains authoritative, including other attachments. */
export function useGraphSessionOwnership(
  scope: Omit<GraphScope, "remoteTarget">,
  sessionId: string | null,
): boolean {
  const { services, rpcReady } = useWorkspaceServicesResolution(
    scope.workspacePath,
    scope.remoteSessionId,
    scope.workspaceIdentity,
  );
  const service = services.graphEngineeringService;
  const workspaceKey = scope.workspaceIdentity?.trim() || scope.workspacePath;
  const [ownedState, setOwnedState] = useState<{ key: string; owned: boolean } | null>(null);
  const key = `${workspaceKey}:${sessionId ?? ""}`;
  useEffect(() => {
    if (!service || !rpcReady || !sessionId) return;
    let live = true;
    let sequence = 0;
    const read = async () => {
      const current = ++sequence;
      try {
        const owned = await service.isSessionOwned({
          workspacePath: scope.workspacePath,
          workspaceIdentity: scope.workspaceIdentity,
          sessionId,
        });
        if (live && current === sequence) setOwnedState({ key, owned });
      } catch {
        // Host 拒绝仍是最终门禁；读取失败不得阻断普通聊天或交互应答。
      }
    };
    const subscription = service.onDidChange((event) => {
      if (event.workspaceKey === workspaceKey) void read();
    });
    void read();
    return () => {
      live = false;
      subscription.dispose();
    };
  }, [
    service,
    rpcReady,
    sessionId,
    scope.workspacePath,
    scope.workspaceIdentity,
    workspaceKey,
    key,
  ]);
  return ownedState?.key === key && ownedState.owned;
}
