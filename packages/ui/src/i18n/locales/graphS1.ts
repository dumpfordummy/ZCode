/**
 * Z8.3-S1 copy (spec: docs/graph-engineering/z8/Z8_3_S1_SPEC.md)。
 * 只描述本地、可预览的支持包：没有任何上传、提交、发送或重试上传的措辞。
 */
const messages: Record<string, [string, string]> = {
  menu: ["Graph support bundle…", "Graph 支持包…"],
  title: ["Graph support bundle", "Graph 支持包"],
  description: [
    "A local file you can read before saving. It is never uploaded or sent anywhere, and nothing is saved until you choose Save.",
    "一个保存前可以先阅读的本地文件。它不会被上传或发送到任何地方，在你选择“保存”之前不会写入任何文件。",
  ],
  preparing: ["Preparing the bundle…", "正在生成支持包…"],
  includedTitle: ["Included", "包含的内容"],
  notIncludedTitle: ["Not included", "不包含的内容"],
  notIncluded: [
    "Credentials, provider settings and URLs, environment variables, headers, cookies, proxy settings, workspace paths, prompts and instructions, conversation and model content, source code, tool and terminal output, logs, raw records, artifacts, attachments, snapshots and backups.",
    "凭据、提供商设置与地址、环境变量、请求头、Cookie、代理设置、工作区路径、提示词与指令、对话与模型内容、源代码、工具与终端输出、日志、原始记录、产物、附件、快照与备份。",
  ],
  workspaceNote: [
    "Workspaces appear only as hashes. A hash identifies a workspace for support; it does not make it anonymous.",
    "工作区仅以哈希表示。哈希用于在支持时识别工作区，并不能让它匿名。",
  ],
  sectionIdentity: ["Product identity and build", "产品标识与构建"],
  sectionRuntime: ["Runtime and protocol versions", "运行时与协议版本"],
  sectionOs: ["Operating system and architecture", "操作系统与架构"],
  sectionCapabilities: ["Capability flags", "能力开关"],
  sectionPolicy: ["Network and telemetry policy in effect", "当前生效的网络与遥测策略"],
  sectionProfile: [
    "Shape of the Graph data (stores, sizes, versions)",
    "Graph 数据概况（存储、大小、版本）",
  ],
  sectionWorkspaces: ["Workspaces (hashes): {count}", "工作区（哈希）：{count}"],
  sectionRuns: [
    "Runs (ids, statuses, node kinds, timestamps, error classes): {count}",
    "运行（编号、状态、节点类型、时间、错误类别）：{count}",
  ],
  size: ["Exact size: {bytes} bytes", "精确大小：{bytes} 字节"],
  previewLabel: ["Exact file contents", "文件的完整内容"],
  save: ["Save…", "保存…"],
  saving: ["Saving…", "正在保存…"],
  saved: ["Saved to {path}", "已保存到 {path}"],
  savedNoPath: ["Saved.", "已保存。"],
  regenerate: ["Prepare again", "重新生成"],
  close: ["Close", "关闭"],
  errorUnavailable: ["The support bundle is not available in this build.", "此版本不提供支持包。"],
  errorProfileUnreadable: [
    "The local Graph data could not be read, so no bundle was created. Nothing was saved.",
    "无法读取本地 Graph 数据，未生成支持包。没有保存任何文件。",
  ],
  errorTooLarge: [
    "The bundle would be larger than the allowed size, so it was not created. Nothing was saved.",
    "支持包会超过允许的大小，因此未生成。没有保存任何文件。",
  ],
  errorPrivacyCheckFailed: [
    "The bundle failed its own privacy check, so it was not created. Nothing was saved.",
    "支持包未通过自身的隐私检查，因此未生成。没有保存任何文件。",
  ],
  errorMismatch: [
    "The bundle did not match its reported size, so it cannot be saved. Nothing was saved.",
    "支持包与其报告的大小不一致，无法保存。没有保存任何文件。",
  ],
  errorSaveFailed: [
    "The file could not be saved ({code}). Nothing was uploaded.",
    "无法保存文件（{code}）。没有上传任何内容。",
  ],
  errorGeneric: [
    "The bundle could not be created. Nothing was saved.",
    "无法生成支持包。没有保存任何文件。",
  ],
};
export const graphS1En = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.s1.${key}`, value[0]]),
);
export const graphS1Zh = Object.fromEntries(
  Object.entries(messages).map(([key, value]) => [`graph.s1.${key}`, value[1]]),
);
/** Message keys, so tests can prove every one exists in both locales. */
export const GRAPH_S1_MESSAGE_KEYS = Object.keys(messages);
