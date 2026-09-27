import type { GraphSequentialRun, GraphToolAttempt } from "../contract.js";
import type { GraphState } from "./state.js";
import type { GraphArtifacts } from "./artifacts.js";

export function toolArtifactBase(
  state: GraphState,
  run: GraphSequentialRun,
  attempt: GraphToolAttempt,
) {
  return {
    target: run.target,
    runId: run.id,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    operationId: attempt.operationId,
    sessionId: attempt.sessionId,
    sourceBaseline: attempt.sourceDigest,
    capturedAt: state.options.now(),
  };
}
export async function captureToolCommand(
  state: GraphState,
  artifacts: GraphArtifacts,
  run: GraphSequentialRun,
  attempt: GraphToolAttempt,
  issues: string[],
) {
  const operation = attempt.operation!,
    verifier = attempt.recipe.verifier;
  const trustedDotnet =
    (verifier.kind === "build" && !!verifier.dotnet) ||
    (verifier.kind === "test" && verifier.format === "dotnet-vstest-trx-v1");
  const result = operation.result;
  const base = toolArtifactBase(state, run, attempt),
    store = state.options.artifacts!;
  // 原生输出中的用户路径只属于预览；明确支持的 .NET 校验使用精确进程事实，不把控制台文案当断言。
  const envelope = trustedDotnet
    ? {
        operationId: operation.operationId,
        sessionId: operation.sessionId,
        requestDigest: operation.requestDigest,
        recipeId: operation.recipeId,
        status: operation.status,
        processStarted: operation.processStarted,
        startedAt: operation.startedAt,
        completedAt: operation.completedAt,
        cwdRelative: attempt.recipe.cwd,
        result: result
          ? {
              ...result,
              stdout: { bytes: result.stdout.bytes, truncated: result.stdout.truncated },
              stderr: { bytes: result.stderr.bytes, truncated: result.stderr.truncated },
            }
          : undefined,
      }
    : { ...operation, cwd: undefined, cwdRelative: attempt.recipe.cwd };
  const command = await store.put({
    ...base,
    artifactId: state.options.id(),
    type: "command",
    provenance: "native-command",
    content: JSON.stringify(envelope),
    validation: issues.length ? "invalid" : "valid",
    ...(issues.length ? { issue: issues.join("\n") } : {}),
  });
  artifacts.add(run, command, "command");
  if (trustedDotnet) {
    const output = await store.put({
      ...base,
      artifactId: state.options.id(),
      type: "text",
      provenance: "native-command",
      content: JSON.stringify({
        stdout: result?.stdout.text,
        stderr: result?.stderr.text,
        error: operation.error,
      }),
      validation: result?.stdout.truncated || result?.stderr.truncated ? "incomplete" : "valid",
    });
    artifacts.add(run, output, "command-output");
  }
  return command;
}
