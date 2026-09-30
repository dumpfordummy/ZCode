/**
 * UX-M2 copy (spec: docs/graph-engineering/ux-audit/UX_M2_SPEC.md).
 *
 * 只包含 UI 自有的标签与解释。用户输入、原生指令、检查名称、存储的 id、Host 诊断与证据保持原文，不在这里翻译。
 */
const messages: Record<string, [string, string]> = {
  // UX-M2.1：历史按创建顺序由新到旧；分页措辞与实际顺序一致。
  historyNewer: ["Newer runs", "较新的运行"],
  historyOlder: ["Older runs", "较早的运行"],
  timeNotRecorded: ["Time not recorded", "未记录时间"],
};
export const graphM2En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m2.${key}`, value[0]]),
);
export const graphM2Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m2.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M2_MESSAGE_KEYS = Object.keys(messages);
