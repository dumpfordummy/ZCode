import type { GraphState } from "./state.js";
import type { GraphInputGuardRequest } from "./ports.js";
import { parallelGuardedRuns } from "./parallel-guard.js";
import { nativeExecution, runFingerprint } from "./attempts.js";
export async function assertGraphInputAllowed(
  state: GraphState,
  params: GraphInputGuardRequest,
): Promise<void> {
  for (const run of await parallelGuardedRuns(state, params)) {
    const tool =
      run.version !== undefined && run.version >= 4
        ? run.toolAttempts?.find((t) => t.sessionId === params.sessionId)
        : undefined;
    if (tool) {
      const expected = {
        operationId: tool.operationId,
        recipe: {
          id: tool.recipe.id,
          executable: tool.recipe.executable,
          args: tool.resolvedArgs,
          cwdRelative: tool.recipe.cwd,
          timeoutMs: tool.recipe.timeoutMs,
          ...(tool.recipe.redactEnvironmentVariables
            ? { redactEnvironmentVariables: tool.recipe.redactEnvironmentVariables }
            : {}),
        },
      };
      if (
        !(
          tool.dispatchPhase === "sending" &&
          state.liveRuns.has(run.id) &&
          state.dispatching.has(tool.operationId) &&
          run.version !== undefined &&
          run.version >= 4 &&
          run.cancelRequestedAt === undefined &&
          params.commandType === "startRecipe" &&
          params.commandId === tool.operationId &&
          params.expectedRuntimeIdentity === tool.runtimeIdentity &&
          runFingerprint(params.request) === runFingerprint(expected)
        )
      )
        throw new Error(
          "Graph owns this Tool session; only its exact live operation dispatch is authorized.",
        );
      state.dispatching.delete(tool.operationId);
      continue;
    }
    const node =
      run.version !== undefined
        ? run.nodeAttempts.find((n) => n.sessionId === params.sessionId)
        : run.sessionId === params.sessionId
          ? run
          : undefined;
    if (!node) continue;
    const execution = nativeExecution(run, node.attemptId);
    const expectedPayload = {
      text: execution.instructions,
      modelSelection: execution.modelSelection,
      mode: execution.mode,
      planEnabled: execution.planEnabled,
    };
    const sending =
      run.version !== undefined
        ? "dispatchPhase" in node &&
          node.dispatchPhase === "sending" &&
          !node.terminalProof &&
          run.cancelRequestedAt === undefined
        : run.status === "Starting";
    // 落盘 sending 在崩溃后仍存在，不能充当重发许可证；只放行当前调用的一次原运行时/原载荷。
    if (
      !(
        sending &&
        state.liveRuns.has(run.id) &&
        state.dispatching.has(node.commandId) &&
        params.commandType === "sendText" &&
        params.commandId === node.commandId &&
        params.expectedRuntimeIdentity === node.runtimeIdentity &&
        params.envelope?.clientId === `graph:${node.attemptId}` &&
        runFingerprint(params.envelope.payload) === runFingerprint(expectedPayload)
      )
    )
      throw new Error(
        "Graph Engineering owns this run. Additional prompts and model/mode changes are blocked until completion or confirmed-inactive release; native permission and question responses remain available.",
      );
    state.dispatching.delete(node.commandId);
  }
}
