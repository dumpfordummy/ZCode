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
