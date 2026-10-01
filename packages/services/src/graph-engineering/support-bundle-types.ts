/**
 * Z8.3-S1：本地、可预览的 Graph 支持包的公开类型。spec: docs/graph-engineering/z8/Z8_3_S1_SPEC.md。
 * 这里只有 Host 返回给 renderer 的 DTO；包内容本身由 domain/support-bundle.ts 的严格 schema 定义。
 */
export const GRAPH_SUPPORT_BUNDLE_SCHEMA = "zcode.graph.support-bundle" as const;
export const GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION = 1 as const;
/** 8 MiB：远小于 Main 保存文件的 50 MiB 上限；超过即报错，绝不静默截断。 */
export const GRAPH_SUPPORT_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;

/** 预览里列出的“包含的类别”；与 schema 顶层段一一对应，由 Host 根据真实内容给出计数。 */
export const GRAPH_SUPPORT_BUNDLE_SECTION_IDS = [
  "identity",
  "runtime",
  "os",
  "capabilities",
  "policy",
  "profile",
  "workspaces",
  "runs",
] as const;
export type GraphSupportBundleSectionId = (typeof GRAPH_SUPPORT_BUNDLE_SECTION_IDS)[number];

export interface GraphSupportBundleSection {
  id: GraphSupportBundleSectionId;
  /** identity/runtime/os/capabilities/policy/profile 为 1；workspaces 为工作区哈希数；runs 为运行数。 */
  count: number;
}

/** 生成失败的固定代码；对应的文本不含路径，也不转述底层错误。 */
export const GRAPH_SUPPORT_BUNDLE_ERROR_CODES = [
  "unavailable",
  "profile-unreadable",
  "too-large",
  "privacy-check-failed",
] as const;
export type GraphSupportBundleErrorCode = (typeof GRAPH_SUPPORT_BUNDLE_ERROR_CODES)[number];

export interface GraphSupportBundleResult {
  schema: typeof GRAPH_SUPPORT_BUNDLE_SCHEMA;
  schemaVersion: typeof GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION;
  /** 将要保存的完整 UTF-8 文本；保存的字节就是它的 UTF-8 编码，没有任何后处理。 */
  json: string;
  /** `json` 的 UTF-8 字节数（Host 计算；renderer 在保存前核对）。 */
  byteLength: number;
  sections: GraphSupportBundleSection[];
}
