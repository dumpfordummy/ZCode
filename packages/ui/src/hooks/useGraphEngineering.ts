import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphApprovalCommand,
  GraphRunContinueCommand,
  GraphDefinition,
  GraphSequentialDefinition,
  GraphNativeSettings,
  GraphReadiness,
  GraphWorkspaceView,
  GraphRecipe,
  GraphRecipeSnapshot,
  GraphRunProvenance,
} from "@zcode/services";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import {
  graphWorkspaceTarget,
  isLocalGraphTarget,
} from "@/graph-engineering/graphEngineeringView.js";
import {
  captureGraphSubmission,
  prepareGraphRunConfirmation,
  type GraphSubmission,
} from "@/graph-engineering/graphSubmission.js";
import {
  captureGraphDecision,
  graphApprovalKey,
  type GraphDecisionIntent,
} from "@/graph-engineering/graphApprovalView.js";

import { captureGraphContinuation } from "@/graph-engineering/graphRoutingView.js";

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
  const workflowService = local ? resolution.services.graphWorkflowService : undefined;
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
  const [recipes, setRecipes] = useState<GraphRecipeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const flight = useRef<number | null>(null);
  const submission = useRef<GraphSubmission | null>(null);
  const submissionDefinition = useRef<GraphDefinition | null>(null);
  const confirmationProvenance = useRef<GraphRunProvenance | null>(null);
  const continuations = useRef(new Map<string, GraphRunContinueCommand>());
  const decisions = useRef(new Map<string, GraphDecisionIntent>());
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
        ) {
          submission.current = null;
          submissionDefinition.current = null;
          confirmationProvenance.current = null;
        }
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
    setRecipes(null);
    setError(null);
    setLoading(Boolean(service));
    setPending(false);
    submission.current = null;
    submissionDefinition.current = null;
    confirmationProvenance.current = null;
    decisions.current.clear();
    continuations.current.clear();
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
        return await service.saveDefinition({
          target,
          definition,
          expectedRevision: definition.revision,
        });
      }),
    [act, service, target],
  );

  const run = useCallback(
    (
      definition: GraphDefinition,
      modelSelection: ModelSelection,
      mode: SubmissionMode,
      planEnabled: boolean,
      confirmed = false,
      preflight?: GraphSubmission["preflight"],
    ) =>
      act(async () => {
        if (!service) return;
        const owner = generation.current;
        const confirmedDefinition = structuredClone(definition);
        const request = await captureGraphSubmission({
          retained: submission.current,
          retainedDefinition: submissionDefinition.current,
          confirmed,
          definition: confirmedDefinition,
          intent: {
            target,
            requestId: crypto.randomUUID(),
            modelSelection,
            mode,
            planEnabled,
            ...(preflight ? { preflight } : {}),
          },
          save: (draft) =>
            service.saveDefinition({ target, definition: draft, expectedRevision: draft.revision }),
        });
        // 保存期间切工作区后不再派发；丢失 Run ACK 时保留同一 revision/config/request，禁止重新保存后重试。
        if (owner !== generation.current) return;
        if (!submission.current) submissionDefinition.current = confirmedDefinition;
        submission.current = request;
        const run = await service.run(request);
        if (owner === generation.current && submission.current === request) {
          submission.current = null;
          submissionDefinition.current = null;
          confirmationProvenance.current = null;
        }
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
    recipes,
    loading,
    pending,
    error,
    local,
    supported: Boolean(service),
    save,
    prepareRunConfirmation: useCallback(
      (definition: GraphSequentialDefinition, settings: GraphNativeSettings) =>
        act(async () => {
          if (!service) return;
          const owner = generation.current;
          const captured = await prepareGraphRunConfirmation({
            definition,
            settings,
            retained: submission.current,
            retainedDefinition: submissionDefinition.current,
            retainedProvenance: confirmationProvenance.current,
            save: (draft) =>
              service.saveDefinition({
                target,
                definition: draft,
                expectedRevision: draft.revision,
              }),
            prepare: async (saved, capturedSettings) => {
              if (!workflowService) throw new Error("Workflow preflight service is unavailable.");
              return workflowService.prepare({
                target,
                revision: saved.revision,
                settings: capturedSettings,
              });
            },
          });
          if (owner === generation.current && captured?.provenance)
            confirmationProvenance.current = captured.provenance;
          return owner === generation.current ? captured : undefined;
        }),
      [act, service, workflowService, target],
    ),
    run,
    cancel,
    readRecipes: useCallback(
      () =>
        act(async () => {
          if (!service) return;
          const owner = generation.current;
          const value = await service.recipes({ target, action: "read" });
          if (owner === generation.current) setRecipes(value);
          return value;
        }),
      [act, service, target],
    ),
    saveRecipes: useCallback(
      (values: GraphRecipe[], expectedDigest: string) =>
        act(async () => {
          if (!service) return;
          const owner = generation.current;
          const value = await service.recipes({
            target,
            action: "save",
            recipes: values,
            expectedDigest,
          });
          if (owner === generation.current) setRecipes(value);
          return value;
        }),
      [act, service, target],
    ),
    readArtifact: useCallback(
      (runId: string, artifactId: string) =>
        act(async () => {
          const value = await service?.artifact({ target, runId, artifactId, action: "read" });
          return value?.kind === "content" ? value : undefined;
        }),
      [act, service, target],
    ),
    exportManifest: useCallback(
      (runId: string) =>
        act(async () => {
          const value = await service?.artifact({ target, runId, action: "manifest" });
          return value?.kind === "manifest" ? value.text : undefined;
        }),
      [act, service, target],
    ),
    retainedDecision: useCallback(
      (command: GraphApprovalCommand) => decisions.current.get(graphApprovalKey(command)),
      [],
    ),
    decideApproval: useCallback(
      (command: GraphApprovalCommand, value: "approve" | "reject", comment: string) =>
        act(async () => {
          if (!service) return;
          const owner = generation.current;
          const key = graphApprovalKey(command);
          const intent = captureGraphDecision(decisions.current.get(key), {
            ...command,
            decisionId: crypto.randomUUID(),
            value,
            comment,
          });
          decisions.current.set(key, intent);
          await service.decideApproval(intent);
          if (owner === generation.current && decisions.current.get(key) === intent)
            decisions.current.delete(key);
        }),
      [act, service],
    ),
    continueRouting: useCallback(
      (runId: string, checkpointId: string, checkpointDigest: string) =>
        act(async () => {
          if (!service) return;
          const owner = generation.current,
            key = `${runId}:${checkpointId}`;
          const intent = captureGraphContinuation(continuations.current.get(key), {
            action: "continue",
            target,
            runId,
            requestId: crypto.randomUUID(),
            checkpointId,
            checkpointDigest,
          });
          continuations.current.set(key, intent);
          await service.run(intent);
          if (owner === generation.current && continuations.current.get(key) === intent)
            continuations.current.delete(key);
        }),
      [act, service, target],
    ),
    continueApproval: useCallback(
      (command: GraphApprovalCommand) =>
        act(async () => {
          await service?.continueApproval(command);
        }),
      [act, service],
    ),
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

export { useGraphReadiness } from "./useGraphReadiness.js";

export { useGraphSessionOwnership } from "./useGraphSessionOwnership.js";
