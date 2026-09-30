/**
 * UX-M4 copy (spec: docs/graph-engineering/ux-audit/UX_M4_SPEC.md).
 *
 * 只包含 UI 自有的标签与解释。工作流名称与描述（Host 提供）、用户输入、存储的 id、摘要与 Host 诊断保持原文。
 */
const messages: Record<string, [string, string]> = {
  // 运行详情的单层标签：次要信息一键可达，决定所需的内容始终在横幅或操作栏里。
  runTabs: ["Run details", "运行详情"],
  tabSteps: ["Steps", "步骤"],
  tabRequest: ["Request and result", "请求与结果"],
  tabEvidence: ["Evidence", "证据"],
  tabTechnical: ["Technical details", "技术详情"],
  // 新建运行：就绪只表示可以进入审阅，不表示检查通过。
  readyToReview: [
    "Ready to review. Nothing starts until you confirm.",
    "可以审阅。你确认之前不会开始任何执行。",
  ],
};
export const graphM4En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m4.${key}`, value[0]]),
);
export const graphM4Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m4.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M4_MESSAGE_KEYS = Object.keys(messages);
