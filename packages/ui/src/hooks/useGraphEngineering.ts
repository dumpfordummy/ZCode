import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphDefinition, GraphReadiness, GraphWorkspaceView } from "@zcode/services";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import {
  graphWorkspaceTarget,
  isLocalGraphTarget,
} from "@/graph-engineering/graphEngineeringView.js";
import {
  captureGraphSubmission,
  type GraphSubmission,
} from "@/graph-engineering/graphSubmission.js";

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
  const submission = useRef<GraphSubmission | null>(null);
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
        // Host 已返回该 request 的持久化事实，丢失的 ACK 已得到对账；后续 Run 才是新意图。
        if (
          submission.current &&
          next.runs.some((run) => run.requestId === submission.current?.requestId)
        )
          submission.current = null;
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
    submission.current = null;
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
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      const owner = generation.current;
      if (flight.current === owner) return;
      flight.current = owner;
      setPending(true);
      setError(null);
      try {
        return await operation();
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
        const request = await captureGraphSubmission({
          retained: submission.current,
          definition,
          intent: { target, requestId: crypto.randomUUID(), modelSelection, mode, planEnabled },
          save: (draft) =>
            service.saveDefinition({ target, definition: draft, expectedRevision: draft.revision }),
        });
        // 保存期间切工作区后不再派发；丢失 Run ACK 时保留同一 revision/config/request，禁止重新保存后重试。
        if (owner !== generation.current) return;
        submission.current = request;
        const run = await service.run(request);
        if (owner === generation.current && submission.current === request)
          submission.current = null;
        return owner === generation.current ? run.id : undefined;
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
    inspectRecovery: useCallback(
      (runId: string) =>
        act(async () => {
          await service?.inspectRecovery({ target, runId });
        }),
      [act, service, target],
    ),
    releaseInterrupted: useCallback(
      (runId: string, reason: string) =>
        act(async () => {
          await service?.releaseInterrupted({ target, runId, reason, confirmed: true });
        }),
      [act, service, target],
    ),
    validate: useCallback(
      async (definition: GraphDefinition): Promise<GraphReadiness> =>
        service
          ? service.validateDefinition({ definition })
          : { errors: ["Graph service is unavailable."], path: [] },
      [service],
    ),
    reload,
  };
}

/** Validation reads are disposable projections; a stale reply cannot enable a newer draft. */
export function useGraphReadiness(
  definition: GraphDefinition,
  validate: (definition: GraphDefinition) => Promise<GraphReadiness>,
) {
  const [result, setResult] = useState<{
    definition: GraphDefinition;
    value: GraphReadiness;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void validate(definition).then(
      (value) => {
        if (live) setResult({ definition, value });
      },
      (error: unknown) => {
        if (live)
          setResult({
            definition,
            value: {
              path: [],
              errors: [error instanceof Error ? error.message : String(error)],
            },
          });
      },
    );
    return () => {
      live = false;
    };
  }, [definition, validate]);
  return result?.definition === definition ? result.value : null;
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
