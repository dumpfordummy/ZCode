let entries = 0;
/** Observation only: never includes argv, paths, environment values or permission input. */
export function observeRecipePermission(
  enabled: boolean,
  request: { toolName: string; toolCallId: unknown },
  phase: "permission-request" | "permission-response",
) {
  if (!enabled || request.toolName !== "GraphRecipe" || entries++ >= 4096) return;
  if (typeof request.toolCallId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(request.toolCallId))
    return;
  try {
    console.error(
      "[graph-phase]" +
        JSON.stringify({
          operationId: request.toolCallId,
          phase,
          clock: "native-monotonic",
          timeMs: performance.now(),
        }),
    );
  } catch {
    /* Diagnostics cannot affect the ordinary permission owner. */
  }
}
