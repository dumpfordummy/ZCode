import { createHash } from "node:crypto";
import {
  zcodeRecipeRequestSchema,
  type ZCodeRecipeRequest,
  type ZCodeRecipeSnapshot,
} from "@zcode/shared";
import type { AgentRuntime } from "@zcode/core";
import type { ExecutionResult, SessionId, ToolCall, TraceContext } from "@zcode/contracts";
import { resolveRecipeCwd } from "./native-recipe-path.js";
import { createRecipeTool, recipeRedactor, recipeResult } from "./native-recipe-tool.js";

export interface NativeRecipeOperations {
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
    async start(raw) {
      if (closed) throw new Error("Native recipe owner closed");
      const request = zcodeRecipeRequestSchema.parse(raw);
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
      };
      const snapshot: ZCodeRecipeSnapshot = {
        operationId: request.operationId,
        sessionId: String(deps.sessionId),
        requestDigest,
        recipeId: request.recipe.id,
        cwd,
        status: "awaiting_permission",
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
          onStarted: (startedAt) => {
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
          try {
            await deps.runtime.ensureSessionPersistedForExternalActivity(
              `Recipe: ${request.recipe.id}`,
              { traceContext: deps.traceContext },
            );
            const schedule = await deps.runtime.scheduleTools([call]);
            const outcome = await deps.runtime.executeTools([call], schedule, {
              signal: entry.abort.signal,
              traceContext: deps.traceContext,
            });
            toolsSucceeded = outcome.results.every((item) => item.success);
          } catch (error) {
            snapshot.error = redact(error instanceof Error ? error.message : String(error)).slice(
              0,
              4096,
            );
          }
          // ToolExecutor 的取消竞速可早于子进程收口；必须等待同一个 ExecutionPort 的结果，不能把取消请求当成退出事实。
          try {
            if (nativeExecution) snapshot.result = recipeResult(await nativeExecution, redact);
          } catch (error) {
            snapshot.error = redact(error instanceof Error ? error.message : String(error)).slice(
              0,
              4096,
            );
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
