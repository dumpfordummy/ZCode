import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphApprovalCommand,
  GraphRunContinueCommand,
  GraphDefinition,
  GraphSequentialDefinition,
  GraphNativeSettings,
  GraphReadiness,
  GraphRecipe,
  GraphRunProvenance,
} from "@zcode/services";
import type { ModelSelection } from "@zcode/shared";
import type { SubmissionMode } from "@zcode/shared/zcode-protocol-v4";
import { useWorkspaceServicesResolution } from "@/hooks/useWorkspaceServices.js";
import {
  graphDefinitionContent,
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
import { assertGraphAdmission } from "@/graph-engineering/graphAdmission.js";
import {
  graphWorkspaceReadState,
  readGraphWorkspaceProjection,
  type GraphWorkspaceReadProjection,
} from "@/graph-engineering/graphWorkspaceRead.js";
import { useGraphRecipes } from "./useGraphRecipes.js";
import { useGraphChecks } from "./useGraphChecks.js";
import { useGraphEvidence } from "./useGraphEvidence.js";

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
  const readScope = useMemo(() => ({ sequence: 0 }), [service, target]);
  const currentReadScope = useRef(readScope);
  currentReadScope.current = readScope;
  const [storedRead, setStoredRead] = useState<GraphWorkspaceReadProjection>();
  const {
    view,
    error: readError,
    loading,
  } = graphWorkspaceReadState(readScope, storedRead, Boolean(service));
  // 预检准备读取最新的 Host 投影，避免闭包里的旧修订。
  const latestView = useRef(view);
  latestView.current = view;
  const [actionError, setActionError] = useState<{ scope: typeof readScope; error: string }>();
  const error = actionError?.scope === readScope ? actionError.error : readError;
  const publishRead = useCallback(
    (patch: Partial<GraphWorkspaceReadProjection["state"]>) => {
      if (currentReadScope.current !== readScope) return;
      setStoredRead((stored) => ({
        scope: readScope,
        state: { ...graphWorkspaceReadState(readScope, stored, Boolean(service)), ...patch },
      }));
    },
    [readScope, service],
  );
  const recipeProjection = useGraphRecipes(service, target);
  const evidence = useGraphEvidence(service, target);
  const [busy, setPending] = useState(false);
  const pending = storedRead?.scope === readScope && busy;
  const flight = useRef<number | null>(null);
  const submission = useRef<GraphSubmission | null>(null);
  const submissionDefinition = useRef<GraphDefinition | null>(null);
  const confirmationProvenance = useRef<GraphRunProvenance | null>(null);
  const continuations = useRef(new Map<string, GraphRunContinueCommand>());
  const decisions = useRef(new Map<string, GraphDecisionIntent>());
  const generation = useRef(0);
  const owns = useCallback(
    (owner: number) => owner === generation.current && currentReadScope.current === readScope,
    [readScope],
  );
  const reload = useCallback(async () => {
    if (!service) return;
    const owner = generation.current;
    const next = await readGraphWorkspaceProjection({
      scope: readScope,
      isCurrent: () => owns(owner),
      read: () => service.getWorkspace(target),
      publish: publishRead,
    });
    // Host 已返回该 request 的持久化事实，丢失的 ACK 已得到对账；后续 Run 才是新意图。
    if (
      next &&
      submission.current &&
      next.runs.some((run) => run.requestId === submission.current?.requestId)
    ) {
      submission.current = null;
      submissionDefinition.current = null;
      confirmationProvenance.current = null;
    }
  }, [service, target, readScope, owns, publishRead]);

  useEffect(() => {
    generation.current += 1;
    publishRead({ view: null, error: null, loading: Boolean(service) });
    setActionError(undefined);
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
  }, [service, target, targetKey, reload, publishRead]);

  const act = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      const owner = generation.current;
      if (!owns(owner) || flight.current === owner) return;
      flight.current = owner;
      setPending(true);
      setActionError(undefined);
      let result: T | undefined;
      try {
        result = await operation();
      } catch (cause) {
        if (owns(owner))
          setActionError({
            scope: readScope,
            error: cause instanceof Error ? cause.message : String(cause),
          });
      } finally {
        if (owns(owner)) {
          await reload();
          if (owns(owner)) setPending(false);
        }
        // 切 workspace 后旧 RPC 才完成，不能清除新 workspace 的动作或锁住新编辑器。
        if (flight.current === owner) flight.current = null;
      }
      // reload 期间仍可能切 workspace；直到最后一个 await 后才允许回执返回给表单。
      return owns(owner) ? result : undefined;
    },
    [reload, owns, readScope],
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
        // UX-M1：任何调用方（按钮、备用控件、脚本）到达准入前，都在最低的 Renderer 路径上拒绝。
        // 丢失 ACK 后重发的保留请求已创建的那个运行不算第二次准入。Host 的准入检查仍是权威。
        assertGraphAdmission(latestView.current?.runs ?? [], {
          reconcilingRequestId: submission.current?.requestId,
        });
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
        if (!owns(owner)) return;
        if (!submission.current) submissionDefinition.current = confirmedDefinition;
        submission.current = request;
        const run = await service.run(request);
        if (owns(owner) && submission.current === request) {
          submission.current = null;
          submissionDefinition.current = null;
          confirmationProvenance.current = null;
        }
        return owns(owner) ? run.id : undefined;
      }),
    [act, service, target, owns],
  );

  const cancel = useCallback(
    (runId: string) =>
      act(async () => {
        await service?.cancel({ target, runId });
      }),
    [act, service, target],
  );

  return {
    runChecks: useGraphChecks(service, target, act, view),
    view,
    recipes: recipeProjection.recipes,
    recipeReadState: recipeProjection.recipeReadState,
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
          // 预检准备会保存/复用设计并请求 Host 预检：占用期间同样不得到达。
          assertGraphAdmission(latestView.current?.runs ?? [], {
            reconcilingRequestId: submission.current?.requestId,
          });
          const owner = generation.current;
          const captured = await prepareGraphRunConfirmation({
            definition,
            settings,
            retained: submission.current,
            retainedDefinition: submissionDefinition.current,
            retainedProvenance: confirmationProvenance.current,
            save: async (draft) => {
              // saveDefinition 对相同内容也会递增修订。草稿与 Host 当前定义同修订且内容一致时，
              // 没有需要保存的东西：复用 Host 的副本，重复审阅不产生新修订。修订不一致仍由
              // 运行准入的 expectedRevision 检查拒绝，行为不会更宽松。
              const current = latestView.current?.definition;
              if (
                current &&
                current.revision === draft.revision &&
                graphDefinitionContent(current) === graphDefinitionContent(draft)
              )
                return structuredClone(current);
              return service.saveDefinition({
                target,
                definition: draft,
                expectedRevision: draft.revision,
              });
            },
            prepare: async (saved, capturedSettings) => {
              if (!workflowService) throw new Error("Workflow preflight service is unavailable.");
              return workflowService.prepare({
                target,
                revision: saved.revision,
                settings: capturedSettings,
              });
            },
          });
          if (owns(owner) && captured?.provenance)
            confirmationProvenance.current = captured.provenance;
          return owns(owner) ? captured : undefined;
        }),
      [act, service, workflowService, target, owns],
    ),
    run,
    cancel,
    readRecipes: recipeProjection.readRecipes,
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
          if (!owns(owner)) return;
          recipeProjection.acceptRecipes(value);
          return value;
        }),
      [act, service, target, recipeProjection.acceptRecipes, owns],
    ),
    ...evidence,
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
          if (owns(owner) && decisions.current.get(key) === intent) decisions.current.delete(key);
        }),
      [act, service, owns],
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
          if (owns(owner) && continuations.current.get(key) === intent)
            continuations.current.delete(key);
        }),
      [act, service, target, owns],
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

export { useGraphSessionOwnership, useGraphSessionOwner } from "./useGraphSessionOwnership.js";
