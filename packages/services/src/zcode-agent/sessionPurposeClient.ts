/** Select native control access only for an explicitly non-model session purpose. */
export async function sessionPurposeClient<T>(
  params: { purpose?: "native-recipe"; model?: unknown },
  ports: { native(): Promise<T>; model(): Promise<T> },
): Promise<T> {
  if (params.purpose === "native-recipe") {
    // 工具会话不应触发供应商就绪或标题模型；显式模型配置仍需走普通 Chat 的准入。
    if (params.model !== undefined)
      throw new Error("Native recipe sessions cannot select a model.");
    return ports.native();
  }
  return ports.model();
}
