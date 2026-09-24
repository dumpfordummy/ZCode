import { redactFeedbackText, type ZCodeRecipeRequest, type ZCodeRecipeResult } from "@zcode/shared";
import type { ExecutionResult, ExecutionStreamResult } from "@zcode/contracts";
import type { ToolEntry } from "@zcode/core";
import { resolveRecipeCwd } from "./native-recipe-path.js";

export function recipeRedactor(
  env: NodeJS.ProcessEnv,
  references: string[] = [],
): (text: string) => string {
  const secrets = references
    .map((key) => env[key])
    .filter((value): value is string => !!value)
    .sort((a, b) => b.length - a.length);
  return (text) =>
    redactFeedbackText(
      secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), text),
    );
}

export function recipeResult(
  result: ExecutionResult,
  redact: (text: string) => string,
): ZCodeRecipeResult {
  return {
    processExitObserved: result.processExitObserved === true,
    status: result.status,
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
    ...(result.signal ? { signal: result.signal } : {}),
    stdout: boundedRecipeOutput(result.stdout, redact),
    stderr: boundedRecipeOutput(result.stderr, redact),
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
  };
}

function boundedRecipeOutput(stream: ExecutionStreamResult, redact: (text: string) => string) {
  // 原生采集先截断时可能只留下密钥前缀，整值脱敏无法识别；保留不完整事实而不落盘部分内容。
  if (stream.truncated)
    return {
      text: "[output withheld: native capture was truncated]",
      bytes: stream.bytes,
      truncated: true,
    };
  const text = redact(stream.text);
  const bytes = Buffer.from(text, "utf8");
  const overLimit = bytes.byteLength > 65536;
  return {
    text: overLimit ? bytes.subarray(0, 65532).toString("utf8") : text,
    bytes: stream.bytes,
    truncated: stream.truncated || overLimit,
  };
}

export function createRecipeTool(input: {
  request: ZCodeRecipeRequest;
  cwd: string;
  workspaceRoot: string;
  preview: Record<string, unknown>;
  onStarted: (time: number) => void;
  onExecution: (work: Promise<ExecutionResult>) => void;
}): ToolEntry {
  const { request, preview } = input;
  let invoked = false;
  return {
    metadata: {
      name: "GraphRecipe",
      description: "Run this configured project recipe",
      providerVisible: false,
      readOnly: false,
      destructive: false,
      concurrentSafe: false,
      sideEffectScope: "system",
      riskLevel: "high",
      needsApproval: true,
    },
    capability: "native_project_recipe",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string" },
        recipeId: { type: "string" },
        executable: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        timeoutMs: { type: "number" },
      },
      additionalProperties: false,
      required: ["operationId", "recipeId", "executable", "args", "cwd", "timeoutMs"],
    },
    outputSchema: {
      type: "object",
      properties: { outcome: { type: "string" } },
      required: ["outcome"],
    },
    permission: {
      permission: "graph-recipe",
      reason:
        "Configured recipe runs repository code and can affect workspace, network or system state",
      riskLevel: "high",
      sideEffectScope: "system",
      needsApproval: true,
      alwaysAsk: true,
      askOptions: { allowAlways: false },
      patternSources: ["toolName"],
      denyPriority: "beforeAsk",
    },
    resultBudget: { maxInlineBytes: 1024, maxModelBytes: 1024, strategy: "inline" },
    timeout: { kind: "none" },
    cancellation: {
      supported: true,
      cleanup: "bestEffort",
      userVisibleMessage: "Only the owned recipe operation was asked to stop",
    },
    trace: { required: true, propagateToAdapters: true, recordInput: "none", recordOutput: "none" },
    validateInput: (value) =>
      JSON.stringify(value) === JSON.stringify(preview)
        ? { result: true }
        : { result: false, errorCode: 400, message: "Frozen recipe input cannot be modified" },
    handler: async (value, context) => {
      context.abortSignal.throwIfAborted();
      // Hook 或模型不能替换已批准的 argv，也不能借用已消费的操作身份重放命令。
      if (
        invoked ||
        context.toolCallId !== request.operationId ||
        JSON.stringify(value) !== JSON.stringify(preview)
      )
        throw new Error("Frozen recipe invocation conflict");
      invoked = true;
      if (!context.executionPort) throw new Error("Native ExecutionPort unavailable");
      // 权限等待期间目录可能被替换成 junction；启动前重查原工作区，拒绝把旧批准带到外部路径。
      if ((await resolveRecipeCwd(input.workspaceRoot, request.recipe)) !== input.cwd)
        throw new Error("Recipe cwd changed while awaiting permission");
      context.abortSignal.throwIfAborted();
      const execution = context.executionPort.run(
        {
          command: { mode: "argv", file: request.recipe.executable, args: request.recipe.args },
          cwd: input.cwd,
          timeoutMs: request.recipe.timeoutMs,
          outputLimit: { maxInlineBytes: 65536, maxBufferBytes: 131072, persistOutput: "none" },
          trace: context.traceContext,
        },
        {
          signal: context.abortSignal,
          onEvent: (event) => {
            if (event.type === "started" && event.pid !== undefined)
              input.onStarted(event.timestamp.getTime());
          },
        },
      );
      input.onExecution(execution);
      const result = await execution;
      return { outcome: result.status };
    },
  };
}
