/**
 * UX-M1 copy (spec: docs/graph-engineering/ux-audit/UX_M1_SPEC.md).
 *
 * 只包含 UI 自有的标签与解释。用户输入、原生指令、存储的 id、Host 诊断与证据保持原文，不在这里翻译。
 */
const messages: Record<string, [string, string]> = {
  admissionBlocked: [
    "The current run still owns this workspace. Your draft is kept; Review and run is available once that run is resolved.",
    "当前运行仍占用此工作区。草稿会保留；该运行结束后即可审阅并运行。",
  ],
  viewCurrentRun: ["View current run", "查看当前运行"],
};
export const graphM1En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m1.${key}`, value[0]]),
);
export const graphM1Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m1.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M1_MESSAGE_KEYS = Object.keys(messages);
