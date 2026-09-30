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
  // UX-M1.2：所选检查、未解决的选择、去检查页并返回草稿。检查名称、id、命令与路径保持原文。
  nextRunLabel: ["For the next run", "用于下一次运行"],
  stepChecksLabel: ["Selected checks for {step}", "{step} 已选检查"],
  checkSavedNotRun: ["Saved · not run", "已保存 · 未运行"],
  noCheckSelected: ["No check selected", "尚未选择检查"],
  checksUnread: ["Saved checks are not read yet", "尚未读取已保存的检查"],
  checkMissing: [
    "{id} is no longer in the saved checks. Choose another check or restore it in Checks.",
    "已保存的检查中不再有 {id}。请另选检查，或在“检查”中恢复它。",
  ],
  checkIncompatible: [
    "{id} is saved but cannot be used for this step.",
    "{id} 已保存，但不能用于此步骤。",
  ],
  editCheck: ["Edit check", "编辑检查"],
  editCheckNamed: ["Edit check {name}", "编辑检查 {name}"],
  openChecks: ["Open Checks", "打开检查"],
  openChecksFor: ["Open Checks for {id}", "为 {id} 打开检查"],
  returnKept: [
    "Your request, context and check choices are kept. A check choice stays selected only if that saved check still exists and fits its step.",
    "请求、上下文和检查选择都会保留。只有该已保存检查仍然存在且适用于对应步骤时，选择才会保持。",
  ],
  recipeSaveBlockedByRun: [
    "Saving checks is blocked while a run is unresolved. You can keep editing; your changes stay as a draft.",
    "运行尚未结束时不能保存检查。可以继续编辑，更改会作为草稿保留。",
  ],
};
export const graphM1En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m1.${key}`, value[0]]),
);
export const graphM1Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m1.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M1_MESSAGE_KEYS = Object.keys(messages);
