import {
  zcodeRecipeStartParamsSchema,
  zcodeRecipeTargetSchema,
  type ZCodeRecipeSnapshot,
} from "@zcode/shared";
import {
  parseParams,
  requireSession,
  type ZCodeProtocolAgentServerContext,
} from "./server-types.js";

export async function startNativeRecipe(
  context: ZCodeProtocolAgentServerContext,
  raw: unknown,
): Promise<ZCodeRecipeSnapshot> {
  const params = parseParams(zcodeRecipeStartParamsSchema, raw);
  const record = requireSession(context, params.sessionId, { operation: "recipe/start" });
  if (!record.app.nativeRecipes) throw new Error("Native recipe capability unavailable");
  return record.app.nativeRecipes.start(params.request);
}

export function readNativeRecipe(
  context: ZCodeProtocolAgentServerContext,
  raw: unknown,
  cancel = false,
): ZCodeRecipeSnapshot {
  const params = parseParams(zcodeRecipeTargetSchema, raw);
  // 冷查询不能物化会话或重放命令；未知运行态必须保留为 unknown。
  const operations = context.sessions.get(params.sessionId)?.app.nativeRecipes;
  return operations
    ? cancel
      ? operations.cancel(params.operationId)
      : operations.inspect(params.operationId)
    : {
        operationId: params.operationId,
        sessionId: params.sessionId,
        status: "unknown",
        processStarted: false,
      };
}
