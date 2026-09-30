/**
 * UX-M3 copy (spec: docs/graph-engineering/ux-audit/UX_M3_SPEC.md).
 *
 * 只包含 UI 自有的标签与解释。工作流名称与描述（Host 提供）、用户输入、存储的 id、摘要与 Host 诊断保持原文。
 */
const messages: Record<string, [string, string]> = {
  // UX-M3.1：单一资料库界面的分区。
  sectionWorkflow: ["Workflow", "工作流"],
  sectionVersions: ["Versions", "版本"],
  sectionUse: ["Use", "使用"],
  sectionShare: ["Share", "分享"],
  sectionAdvanced: ["Advanced", "高级"],
  kindBuiltin: ["Built-in", "内置"],
  kindYours: ["Yours", "我的"],
  archivedTag: ["Archived", "已归档"],
  archivedNote: [
    "Archived workflows keep their versions but cannot be used or given new versions. Restore it first.",
    "已归档的工作流会保留其版本，但不能使用，也不能新增版本。请先恢复。",
  ],
  versionLabel: ["Version {version}", "版本 {version}"],
  latest: ["Latest", "最新"],
  usedByDesign: ["Used by current design", "当前设计正在使用"],
  createdOn: ["Created {date}", "创建于 {date}"],
  notSupported: ["Not supported by this app", "此应用不支持"],
  versionsHelp: [
    "Every version is immutable. Designs and runs stay pinned to the version they used.",
    "每个版本都不可变。设计和运行始终固定在它们所用的版本上。",
  ],
  versionsGroup: ["Versions of this workflow", "此工作流的版本"],
  noVersions: ["This workflow offers no versions.", "此工作流没有可用版本。"],
  // 新建运行：这一次运行将实例化哪个工作流的哪个版本。
  runWillUse: [
    "This run will use {name} · Version {version} · {kind}",
    "本次运行将使用 {name} · 版本 {version} · {kind}",
  ],
  runVersionLabel: ["Version", "版本"],
  designOrigin: ["Started from {name} · Version {version}", "由 {name} · 版本 {version} 创建"],
  // 只读浏览与被阻止的修改。
  blockedBrowse: [
    "A run still owns this workspace. You can browse workflows, inspect versions and preview; changes are unavailable until it finishes.",
    "仍有运行占用此工作区。你可以浏览工作流、查看版本和预览；在它结束之前，无法进行任何更改。",
  ],
  blockedExport: [
    "Exporting to a file is unavailable while a run owns this workspace: the save dialog could write inside it.",
    "有运行占用此工作区时无法导出为文件：保存对话框可能把文件写进工作区。",
  ],
  builtinNoArchive: [
    "Built-in workflows cannot be archived. Duplicate to edit.",
    "内置工作流不能归档。请复制后再编辑。",
  ],
  builtinNoVersion: [
    "Built-in workflows cannot get new versions. Duplicate to edit.",
    "内置工作流不能新增版本。请复制后再编辑。",
  ],
  duplicateToEdit: ["Duplicate to edit", "复制后编辑"],
  loadIntoDesign: ["Load into design", "载入设计"],
  // 高级：技术标识。
  advancedHelp: [
    "Technical identities of the selected version and of the library. Most tasks do not need them.",
    "所选版本与资料库的技术标识。大多数任务不需要它们。",
  ],
  versionDigest: ["Version digest", "版本摘要"],
  // UX-M3.3：在 Runs 中打开，以及历史固定版本。
  openInRuns: ["Open in Runs", "在 Runs 中打开"],
  openInRunsHelp: [
    "Opens New run with this workflow and version. Nothing is reviewed or started.",
    "打开“新建运行”并带上此工作流与版本。不会审阅或启动任何内容。",
  ],
  pinNotOffered: [
    "Version {requested} used by this run is no longer offered. Version {offered} is available.",
    "该运行使用的版本 {requested} 已不再提供。可用的是版本 {offered}。",
  ],
  pinNoneOffered: [
    "Version {requested} used by this run is no longer offered, and no other version of this workflow can be used.",
    "该运行使用的版本 {requested} 已不再提供，此工作流也没有其他可用版本。",
  ],
  pinChanged: [
    "Version {requested} used by this run has changed since it ran. The version offered now has a different definition.",
    "该运行使用的版本 {requested} 自运行以来已发生变化。现在提供的版本定义不同。",
  ],
  pinWorkflowMissing: [
    "The workflow used by this run is no longer in the library.",
    "该运行使用的工作流已不在资料库中。",
  ],
  pinExplain: [
    "Your request and choices from that run are kept. Nothing starts: continue explicitly, or choose another workflow above.",
    "该运行的请求和选择已保留。不会启动任何内容：请明确选择继续，或在上方选择其他工作流。",
  ],
  pinContinue: ["Continue with version {offered}", "继续使用版本 {offered}"],
  carryTitle: ["Carried over from version {from}", "从版本 {from} 带过来的内容"],
  carryCarried: ["Carried over: {items}", "已带过来：{items}"],
  carryNone: ["Nothing could be carried over.", "没有内容可以带过来。"],
  carryNotCarried: ["Not carried over", "未带过来"],
  carryStillRequired: [
    "Required values that were not carried over are still missing; Review and run stays unavailable until you fill them.",
    "未带过来的必填项仍然缺失；填好之前“审阅并运行”保持不可用。",
  ],
  carryDismiss: ["Dismiss", "关闭"],
  kindParameter: ["parameter", "参数"],
  kindReference: ["context", "上下文"],
  kindCheck: ["check", "检查"],
  kindSourcePaths: ["repair source paths", "修复源路径"],
  reasonAbsent: ["not declared in this version", "此版本未声明"],
  reasonType: ["a different type in this version", "此版本中类型不同"],
  reasonKind: ["a different kind in this version", "此版本中种类不同"],
  reasonNode: ["its step or region is not in this version", "此版本没有对应的步骤或区域"],
  // UX-M3.2：Share 里的三个独立任务，以及 Advanced 里的手动 JSON。
  shareSaveTitle: ["Save current design", "保存当前设计"],
  shareExportTitle: ["Export a version", "导出某个版本"],
  shareImportTitle: ["Import a file", "导入文件"],
  manualTitle: ["Manual JSON", "手动 JSON"],
  manualHelp: [
    "Paste a portable workflow when this environment cannot select a file. It is checked and reviewed exactly like an imported file.",
    "当此环境无法选择文件时，可在此粘贴可移植工作流。它会像导入的文件一样被检查和审阅。",
  ],
  saveHelp: [
    "Turn the design shown in Workflows into a reusable workflow, or add it as a new version of one of yours.",
    "把 Workflows 中显示的设计变成可复用的工作流，或作为你自己某个工作流的新版本。",
  ],
  saveNeedsV5: [
    "This design is not a version-5 graph, so it cannot be saved as a workflow yet.",
    "此设计不是第 5 版图，暂时不能保存为工作流。",
  ],
  saveTarget: ["Save as", "保存为"],
  targetNew: ["A new workflow", "一个新工作流"],
  targetVersion: ["New version of {name}", "{name} 的新版本"],
  unsavedVersion: [
    "This version includes your current unsaved design edits.",
    "此版本包含你当前尚未保存的设计修改。",
  ],
  unsavedWorkflow: [
    "This workflow includes your current unsaved design edits.",
    "此工作流包含你当前尚未保存的设计修改。",
  ],
  builtinOrigin: [
    "This design came from a built-in workflow. Built-ins cannot get new versions, so saving creates your own workflow.",
    "此设计来自内置工作流。内置工作流不能新增版本，因此保存会创建你自己的工作流。",
  ],
  renameNotice: [
    "The workflow will be renamed from “{from}” to “{to}”.",
    "工作流将从“{from}”重命名为“{to}”。",
  ],
  willCreate: [
    "Confirming creates a new workflow named “{name}”. Nothing is saved until you confirm.",
    "确认后将创建名为“{name}”的新工作流。确认之前不会保存任何内容。",
  ],
  willAddVersion: [
    "Confirming adds a new version to “{name}”. Existing versions, designs and runs are not changed.",
    "确认后将为“{name}”添加一个新版本。已有版本、设计和运行不会改变。",
  ],
  confirmNew: ["Save as new workflow", "保存为新工作流"],
  confirmVersion: ["Save as new version of “{name}”", "保存为“{name}”的新版本"],
  reviewFirst: ["Preview and tick the review box first.", "请先预览并勾选审阅确认框。"],
  saved: [
    "Saved: {name} · Version {version} is now selected.",
    "已保存：{name} · 版本 {version} 已被选中。",
  ],
  savedUnknown: [
    "The library was updated. Choose the workflow in Workflow to see it.",
    "资料库已更新。请在“工作流”中选择它查看。",
  ],
  exportSubject: ["{name} · Version {version}", "{name} · 版本 {version}"],
  exportNone: [
    "Choose a workflow and a version in Versions to export it.",
    "请先在“版本”中选择要导出的工作流和版本。",
  ],
  exportScope: [
    "Exports this stored version exactly. The unsaved design in Workflows is not part of it.",
    "按存储的原样导出此版本。Workflows 中尚未保存的设计不包含在内。",
  ],
  exportedAs: [
    "Saved {name} · Version {version} to a file.",
    "已把 {name} · 版本 {version} 保存到文件。",
  ],
  importHelp: [
    "Choose a portable workflow file. Choosing and previewing change nothing; saving is a separate step.",
    "选择一个可移植工作流文件。选择和预览不会改变任何内容；保存是单独的一步。",
  ],
  importChoose: ["Choose file…", "选择文件…"],
  importNoFile: [
    "Choosing a file is not available in this environment. Paste the JSON under Advanced instead.",
    "此环境无法选择文件。请改在“高级”中粘贴 JSON。",
  ],
  jsonReadOnly: ["Portable workflow JSON (read-only)", "可移植工作流 JSON（只读）"],
  shareIntro: [
    "Save the current design as a workflow, export a version, or import a file.",
    "把当前设计保存为工作流、导出某个版本，或导入文件。",
  ],
};
export const graphM3En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m3.${key}`, value[0]]),
);
export const graphM3Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.m3.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales and every key the code reads is defined. */
export const GRAPH_M3_MESSAGE_KEYS = Object.keys(messages);
