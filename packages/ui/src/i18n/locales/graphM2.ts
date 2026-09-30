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
  // UX-M2.2：未保存的检查编辑。检查名称与 id 原样显示，不翻译。
  unsavedTitle: ["Unsaved changes to saved checks", "已保存的检查有未保存的更改"],
  unsavedNotUsed: [
    "They are not used by the next run. Review and runs use the saved checks until you save.",
    "下一次运行不会使用这些更改。保存之前，审阅和运行都使用已保存的检查。",
  ],
  saveScope: [
    "Save checks writes the whole check list, including every change listed here, also those made earlier in this workspace.",
    "“保存检查”会写入整个检查清单，包括这里列出的每一项更改，也包括之前在此工作区所做的更改。",
  ],
  changeAdded: ["Added", "新增"],
  changeModified: ["Changed", "已更改"],
  changeRemoved: ["Removed", "已删除"],
  changeReordered: ["The order of the checks changed.", "检查的顺序已改变。"],
  changeFormattingOnly: [
    "Only the formatting differs; saving writes the same checks.",
    "仅格式不同；保存会写入相同的检查。",
  ],
  "unsummarizable.invalid-json": [
    "The changes cannot be listed: the check list is not valid JSON. Save validates the list first and refuses an invalid one.",
    "无法列出更改：检查清单不是有效的 JSON。保存前会先校验清单，并拒绝无效的清单。",
  ],
  "unsummarizable.missing-id": [
    "The changes cannot be listed: a check has no id. Save validates the list first and refuses an invalid one.",
    "无法列出更改：有检查缺少 id。保存前会先校验清单，并拒绝无效的清单。",
  ],
  "unsummarizable.duplicate-id": [
    "The changes cannot be listed: two checks have the same id. Save validates the list first and refuses an invalid one.",
    "无法列出更改：有两个检查使用相同的 id。保存前会先校验清单，并拒绝无效的清单。",
  ],
  comparedEarlier: [
    "Compared with the saved checks loaded earlier; they are not loaded right now.",
    "对比对象是之前加载的已保存检查；它们当前未加载。",
  ],
  comparedStarted: [
    "Compared with the saved checks these edits started from; the saved checks have changed since (see below).",
    "对比对象是这些编辑开始时的已保存检查；此后已保存的检查已发生变化（见下文）。",
  ],
  discardOpen: ["Discard all unsaved check edits…", "放弃所有未保存的检查编辑…"],
  discardQuestion: [
    "Discard all unsaved edits to the check list? Every check returns to the saved checks, not only the one that is open.",
    "要放弃检查清单的全部未保存编辑吗？所有检查都会恢复为已保存的检查，而不只是当前打开的那一项。",
  ],
  discardConfirm: ["Discard all edits", "放弃全部编辑"],
  keepEditing: ["Keep editing", "继续编辑"],
  discardNeedsSaved: [
    "Load the saved checks before discarding, so the edits are replaced by the current saved checks.",
    "请先加载已保存的检查再放弃，这样编辑会被当前已保存的检查替换。",
  ],
  discarded: [
    "Unsaved check edits were discarded; the saved checks are shown.",
    "已放弃未保存的检查编辑；现在显示的是已保存的检查。",
  ],
  rowUnsaved: ["Unsaved changes", "有未保存的更改"],
  rowNew: ["New · not saved", "新增 · 未保存"],
  returnUnsaved: [
    "Unsaved check edits stay in Checks and are not used by the next run.",
    "未保存的检查编辑保留在“检查”中，下一次运行不会使用它们。",
  ],
  newRunUnsaved: [
    "Checks has unsaved edits. Review and the next run use the saved checks shown here.",
    "“检查”中有未保存的编辑。审阅和下一次运行使用这里显示的已保存检查。",
  ],
  newRunUnsavedUnlisted: [
    "Checks has unsaved edits that cannot be listed. Review and the next run use the saved checks shown here.",
    "“检查”中有无法列出的未保存编辑。审阅和下一次运行使用这里显示的已保存检查。",
  ],
  selectedModified: ["Unsaved edits in Checks are not used", "“检查”中的未保存编辑不会被使用"],
  selectedRemoved: [
    "Removed in unsaved edits; the saved check is still used",
    "已在未保存的编辑中删除；仍使用已保存的检查",
  ],
  // UX-M2.3：失败说明（UI 自有）。其下原样显示 Host/校验/平台的诊断；文件名、路径与诊断不翻译。
  couldNotUseKept: [
    "Could not use {file}. The previous selection {previous} was kept.",
    "无法使用 {file}。已保留原选择 {previous}。",
  ],
  couldNotUseNothing: [
    "Could not use {file}. Nothing is selected for this slot.",
    "无法使用 {file}。此槽位没有选择任何内容。",
  ],
  chooserFailedKept: [
    "The file chooser did not return a file. The previous selection {previous} was kept.",
    "文件选择器没有返回文件。已保留原选择 {previous}。",
  ],
  chooserFailedNothing: [
    "The file chooser did not return a file. Nothing is selected for this slot.",
    "文件选择器没有返回文件。此槽位没有选择任何内容。",
  ],
  checksSaveFailed: [
    "The saved checks were not changed. Your unsaved edits are kept.",
    "已保存的检查没有改变。未保存的编辑仍然保留。",
  ],
  reviewFailed: [
    "Review could not be prepared. Nothing was started; your request, context and check choices are kept.",
    "无法准备审阅。没有启动任何运行；请求、上下文和检查选择都会保留。",
  ],
  startFailed: [
    "Start did not complete. Check the run list to see whether a run was admitted before you start again.",
    "启动未完成。再次启动前，请在运行列表中确认是否已有运行被接纳。",
  ],
};
export const graphM2En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m2.${key}`, value[0]]),
);
export const graphM2Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m2.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M2_MESSAGE_KEYS = Object.keys(messages);
