import { revalidateWebProfileRuntime } from "@zcode/shared/node";
import { createHash } from "node:crypto";
import {
  zcodeRecipeRequestSchema,
  inspectionReviewParamsSchema, projectInspectionOutput, webProfileReadScope,
  type ZCodeRecipeRequest,
  type ZCodeRecipeSnapshot,
} from "@zcode/shared";
import { CoreErrorType } from "@zcode/contracts";
import { prepareProjectInspection, validateProjectInspection } from "./native-project-inspection.js";
import type { AgentRuntime } from "@zcode/core";
import type { ExecutionResult, SessionId, ToolCall, TraceContext } from "@zcode/contracts";
import { resolveRecipeCwd } from "./native-recipe-path.js";
import { createRecipeTool, recipeRedactor, recipeResult } from "./native-recipe-tool.js";

export interface NativeRecipeOperations {
  reviewInspection(request: unknown): Promise<ZCodeRecipeRequest>;
  start(request: ZCodeRecipeRequest): Promise<ZCodeRecipeSnapshot>;
  inspect(operationId: string): ZCodeRecipeSnapshot;
  cancel(operationId: string): ZCodeRecipeSnapshot;
  close(): Promise<void>;
}
type RecipeRuntime = Pick<
  AgentRuntime,
  | "getToolRegistry"
  | "scheduleTools"
  | "executeTools"
  | "getActiveTurnInfo"
  | "trackResidencyBlockingWork"
  | "ensureSessionPersistedForExternalActivity"
>;

export function createNativeRecipeOperations(deps: {
  runtime: RecipeRuntime;
  sessionId: SessionId;
  workingDirectory: string;
  env: NodeJS.ProcessEnv;
  traceContext: TraceContext;
}): NativeRecipeOperations {
  const operations = new Map<
    string,
    { snapshot: ZCodeRecipeSnapshot; abort: AbortController; completion?: Promise<void> }
  >();
  let closed = false;
  let diagnosticEntries = 0;
  const mark = (operationId: string, phase: string) => {
    if (deps.env.ZCODE_GRAPH_DIAGNOSTICS === "1" && diagnosticEntries++ < 4096)
      console.error("[graph-phase]" + JSON.stringify({operationId,phase,clock:"native-monotonic",timeMs:performance.now()}));
  };
  const inspect = (operationId: string): ZCodeRecipeSnapshot =>
    structuredClone(
      operations.get(operationId)?.snapshot ?? {
        operationId,
        sessionId: String(deps.sessionId),
        status: "unknown",
        processStarted: false,
      },
    );
  return {
    inspect,
    async reviewInspection(raw) {
      if (closed) throw Error("Native recipe owner closed");
      return prepareProjectInspection(inspectionReviewParamsSchema.parse(raw), deps.workingDirectory, deps.env);
    },
    async start(raw) {
      if (closed) throw new Error("Native recipe owner closed");
      const request = zcodeRecipeRequestSchema.parse(raw);
      mark(request.operationId,"native-admission");
      const requestDigest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const prior = operations.get(request.operationId);
      if (prior) {
        if (prior.snapshot.requestDigest !== requestDigest)
          throw new Error("Recipe operation identity conflict");
        return inspect(request.operationId);
      }
      const cwd = await resolveRecipeCwd(deps.workingDirectory, request.recipe);
      if (closed) throw new Error("Native recipe owner closed");
      const raced = operations.get(request.operationId);
      if (raced) {
        if (raced.snapshot.requestDigest !== requestDigest)
          throw new Error("Recipe operation identity conflict");
        return inspect(request.operationId);
      }
      if (operations.size >= 128) throw new Error("Native recipe operation limit reached");
      if (
        deps.runtime.getActiveTurnInfo() ||
        [...operations.values()].some(
          (entry) => !entry.snapshot.completedAt || entry.snapshot.status === "unknown",
        )
      )
        throw new Error("Native session has active or uncertain work");
      const registry = deps.runtime.getToolRegistry();
      if (registry.has("GraphRecipe")) throw new Error("Native recipe tool registration conflict");
      const redact = recipeRedactor(deps.env, request.recipe.redactEnvironmentVariables);
      const preview = {
        operationId: request.operationId,
        recipeId: request.recipe.id,
        executable: redact(request.recipe.executable),
        args: request.recipe.args.map(redact),
        cwd,
        timeoutMs: request.recipe.timeoutMs,
        ...(request.webProfile ? {purpose:request.webProfile.policy,warning:"Known Web profile Build/Test executes repository code with its fixed empty-base environment; restore is disabled.",readScope:[deps.workingDirectory,...webProfileReadScope(request.webProfile.runtimeProfile)]} : {}),
        ...(request.inspection ? { purpose: request.inspection.purpose, warning: "Evaluation can execute project processing and cause filesystem, network or system side effects. This is not Build/Test evidence.", readScope: [deps.workingDirectory, ...(request.inspection.runtimeProfile ? webProfileReadScope(request.inspection.runtimeProfile) : [request.inspection.sdkDirectory, request.recipe.executable])] } : {}),
      };
      const snapshot: ZCodeRecipeSnapshot = {
        operationId: request.operationId,
        sessionId: String(deps.sessionId),
        requestDigest,
        recipeId: request.recipe.id,
        cwd,
        status: "awaiting_permission",
        ...(request.inspection ? { inspectionVerifying: true } : {}),
        ...(request.webProfile ? { sourceVerifying: true } : {}),
        processStarted: false,
      };
      const entry = {
        snapshot,
        abort: new AbortController(),
        completion: undefined as Promise<void> | undefined,
      };
      let nativeExecution: Promise<ExecutionResult> | undefined;
      operations.set(request.operationId, entry);
      registry.register(
        createRecipeTool({
          request,
          cwd,
          workspaceRoot: deps.workingDirectory,
          preview,
          validateInspection: () => { snapshot.inspectionVerifying = true; return validateProjectInspection(request, deps.workingDirectory, deps.env, entry.abort.signal); },
          validateWebProfile: async () => { if(request.webProfile) { snapshot.sourceVerifying = true; await revalidateWebProfileRuntime(deps.workingDirectory,request.webProfile.runtimeProfile,entry.abort.signal); } },
          onInspectionChanged: () => { snapshot.inspectionOutcome = Date.now() >= (request.inspection?.expiresAt ?? Infinity) ? "expired" : "source-changed"; },
          onStarted: (startedAt) => {
            mark(request.operationId,"process-start");
            snapshot.sourceVerifying = false;
            if(request.inspection) snapshot.inspectionVerifying = false;
            snapshot.processStarted = true;
            snapshot.startedAt = startedAt;
            snapshot.status = "running";
          },
          onExecution: (work) => {
            nativeExecution = work;
          },
        }),
      );
      const call: ToolCall = { id: request.operationId, name: "GraphRecipe", input: preview };
      entry.completion = deps.runtime.trackResidencyBlockingWork(
        (async () => {
          let toolsSucceeded = false;
          const expiry = request.inspection ? setTimeout(() => {
            snapshot.inspectionOutcome = "expired"; entry.abort.abort();
          }, Math.max(0, request.inspection.expiresAt - Date.now())) : undefined;
          try {
            if (request.inspection) {
              try { await validateProjectInspection(request, deps.workingDirectory, deps.env, entry.abort.signal); }
              catch (error) { snapshot.inspectionOutcome = Date.now() >= request.inspection.expiresAt ? "expired" : "source-changed"; throw error; }
              entry.abort.signal.throwIfAborted();
              snapshot.inspectionVerifying = false;
            }
            if(request.webProfile) {
              await revalidateWebProfileRuntime(deps.workingDirectory,request.webProfile.runtimeProfile,entry.abort.signal);
              entry.abort.signal.throwIfAborted();
            }
            await deps.runtime.ensureSessionPersistedForExternalActivity(
              `Recipe: ${request.recipe.id}`,
              { traceContext: deps.traceContext },
            );
            if(request.webProfile) snapshot.sourceVerifying = false;
            mark(request.operationId,"permission-tool-dispatch");
            const schedule = await deps.runtime.scheduleTools([call]);
            const outcome = await deps.runtime.executeTools([call], schedule, {
              signal: entry.abort.signal,
              traceContext: deps.traceContext,
            });
            toolsSucceeded = outcome.results.every((item) => item.success);
            if (request.inspection && outcome.results.some(item => item.error?.type === CoreErrorType.PermissionDenied))
              snapshot.inspectionOutcome ??= "denied";
          } catch (error) {
            snapshot.error = redact(error instanceof Error ? error.message : String(error)).slice(
              0,
              4096,
            );
          }
          // ToolExecutor 的取消竞速可早于子进程收口；必须等待同一个 ExecutionPort 的结果，不能把取消请求当成退出事实。
          try {
            if (nativeExecution) {
              const rawResult = await nativeExecution;
              mark(request.operationId,"process-exit-result");
              if (request.inspection) {
                snapshot.result = recipeResult({ ...rawResult, stdout: { ...rawResult.stdout, text: "" }, stderr: { ...rawResult.stderr, text: "" } }, redact);
                if (rawResult.status === "completed" && rawResult.exitCode === 0 && rawResult.processExitObserved && !rawResult.stdout.truncated && !rawResult.stderr.truncated) {
                  try {
                    snapshot.inspectionProjection = projectInspectionOutput(rawResult.stdout.text,!!request.inspection.webProfile);
                    const effective = snapshot.inspectionProjection.properties;
                    if (effective.NETCoreSdkVersion !== request.inspection.sdkVersion || effective.Configuration !== request.inspection.configuration || effective.TargetFramework !== request.inspection.framework) throw Error("Effective inspection identity mismatch.");
                    try { snapshot.inspectionVerifying = true; await validateProjectInspection(request, deps.workingDirectory, deps.env, entry.abort.signal); }
                    catch { snapshot.inspectionOutcome ??= Date.now() >= request.inspection!.expiresAt ? "expired" : "source-changed"; }
                    snapshot.inspectionOutcome ??= "succeeded";
                    if (snapshot.inspectionOutcome !== "succeeded") delete snapshot.inspectionProjection;
                  } catch {
                    snapshot.inspectionOutcome ??= "invalid-output";
                    delete snapshot.inspectionProjection;
                  }
                }
              } else snapshot.result = recipeResult(rawResult, redact);
            }
          } catch (error) {
            snapshot.error = redact(error instanceof Error ? error.message : String(error)).slice(
              0,
              4096,
            );
          }
          if (expiry) clearTimeout(expiry);
          if (request.inspection) snapshot.inspectionVerifying = false;
          if (request.inspection) {
            snapshot.inspectionOutcome = entry.abort.signal.aborted && snapshot.inspectionOutcome !== "expired"
              ? "cancelled" : snapshot.inspectionOutcome ?? "failed";
            // 检查的原始输出和异常不能进入公开命令诊断；只保留有界枚举与白名单投影。
            snapshot.error = snapshot.inspectionOutcome === "succeeded" ? undefined : "Project inspection did not produce a valid observation.";
          }
          const result = snapshot.result;
          snapshot.status =
            snapshot.processStarted && (!result || !result.processExitObserved)
              ? "unknown"
              : result?.cancelled || entry.abort.signal.aborted
                ? "cancelled"
                : result?.status === "completed" &&
                    result.exitCode === 0 &&
                    !result.stdout.truncated &&
                    !result.stderr.truncated &&
                    toolsSucceeded
                  ? "completed"
                  : "failed";
          if (!result && !snapshot.error)
            snapshot.error =
              "Native command did not produce an execution result (permission denied, cancelled, or tool failure).";
          if(request.webProfile) snapshot.sourceVerifying = false;
          snapshot.completedAt = Date.now();
          registry.unregister("GraphRecipe");
        })(),
      );
      return inspect(request.operationId);
    },
    cancel(operationId) {
      const entry = operations.get(operationId);
      if (entry && !entry.snapshot.completedAt) entry.abort.abort();
      return inspect(operationId);
    },
    async close() {
      closed = true;
      for (const entry of operations.values()) if (!entry.snapshot.completedAt) entry.abort.abort();
      await Promise.all([...operations.values()].map((entry) => entry.completion));
    },
  };
}
