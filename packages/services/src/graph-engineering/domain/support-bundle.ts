/**
 * Z8.3-S1：本地 Graph 支持包的“封闭模型”。spec: docs/graph-engineering/z8/Z8_3_S1_SPEC.md。
 *
 * 设计原则：这个 schema 里没有凭据、提供商配置、环境、头、cookie、代理、绝对路径、提示词、对话/模型内容、源码、
 * 工具输入输出、终端输出、日志、原始记录、产物内容、附件、快照或提供商响应的字段。投影只读取下面列出的结构化字段，
 * 不是“先收集再脱敏”。脱敏与路径检查只是失败即中止的最后一道防线。
 */
import { redactFeedbackText } from "@zcode/shared";
import { z } from "zod";
import {
  GRAPH_SUPPORT_BUNDLE_MAX_BYTES,
  GRAPH_SUPPORT_BUNDLE_SCHEMA,
  GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION,
  type GraphSupportBundleErrorCode,
} from "../support-bundle-types.js";
import { runStatus } from "./native-record.js";

const ERROR_TEXT: Record<GraphSupportBundleErrorCode, string> = {
  unavailable: "The support bundle is not available in this build.",
  "profile-unreadable": "The local Graph data could not be read to build the support bundle.",
  "too-large": "The support bundle is larger than the allowed size and was not created.",
  "privacy-check-failed": "The support bundle failed its privacy self-check and was not created.",
};

/** 固定文本、不含路径、不转述底层错误；前缀便于 UI 映射为本地化文本。 */
export class GraphSupportBundleError extends Error {
  constructor(readonly code: GraphSupportBundleErrorCode) {
    super(`graph-support-bundle:${code}: ${ERROR_TEXT[code]}`);
    this.name = "GraphSupportBundleError";
  }
}

const count = z.number().int().nonnegative();
const epoch = z.number().finite().nonnegative();
/** 版本/提交/构建时间等编译期常量：字符集受限，无斜杠，无空白。 */
export const VERSION_TEXT = /^[A-Za-z0-9._+:-]{1,64}$/;
const versionText = z.string().regex(VERSION_TEXT);
const hash64 = z.string().regex(/^[0-9a-f]{64}$/);
/** 不透明 id：受限字符集；不合规的 id 在投影时被 `hash-<32 hex>` 替换。 */
export const OPAQUE_ID = /^(?!.*\.\.)[A-Za-z0-9._-]{1,200}$/;
const opaqueId = z.string().regex(OPAQUE_ID);

const READ_STATUSES = ["ok", "unsupported-newer-version", "integrity-error", "invalid"] as const;
export const NODE_KINDS = [
  "start",
  "task",
  "tool",
  "approval",
  "condition",
  "end",
  "other",
] as const;
export const ERROR_CLASSES = [
  "run-failed",
  "run-rejected",
  "run-stale-evidence",
  "run-interrupted",
  "run-unknown",
  "routing-stop",
  "native-failed",
  "output-invalid",
  "output-issue",
  "attempt-failed",
] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

/** 键集合封闭的计数表：键必须来自给定集合，值是非负整数。 */
const closedMap = (keys: readonly string[]) =>
  z.record(z.string(), count).superRefine((value, ctx) => {
    for (const key of Object.keys(value))
      if (!keys.includes(key)) ctx.addIssue({ code: "custom", message: "Unknown map key." });
  });
const statusKeys: readonly string[] = runStatus.options;
const versionKeys = ["1", "2", "3", "4", "5", "unknown"] as const;

const storeShape = {
  present: z.boolean(),
  fileCount: count,
  totalBytes: count,
  truncated: z.boolean(),
};

const runSchema = z
  .object({
    runId: opaqueId,
    status: runStatus,
    runVersion: count,
    createdAt: epoch,
    updatedAt: epoch,
    nodeKinds: closedMap(NODE_KINDS),
    errorClasses: z.array(z.enum(ERROR_CLASSES)),
    nativeSessionIds: z.array(opaqueId),
    commandIds: z.array(opaqueId),
  })
  .strict();

const workspaceSchema = z
  .object({
    workspaceHash: hash64,
    recordBytes: count,
    readStatus: z.enum(READ_STATUSES),
    storedVersion: count.nullable(),
    runCount: count,
    runsByStatus: closedMap(statusKeys),
    runs: z.array(runSchema),
  })
  .strict();

export const supportBundleSchema = z
  .object({
    schema: z.literal(GRAPH_SUPPORT_BUNDLE_SCHEMA),
    schemaVersion: z.literal(GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION),
    scope: z
      .object({
        graphOnly: z.literal(true),
        localOnly: z.literal(true),
        transmitted: z.literal(false),
      })
      .strict(),
    identity: z
      .object({
        productFlavor: z.literal("graph"),
        appVersion: versionText,
        buildCommit: versionText,
        buildTime: versionText,
      })
      .strict(),
    runtime: z
      .object({
        electron: versionText.nullable(),
        node: versionText,
        cli: z.null(),
        protocol: z
          .object({
            name: z.string().regex(/^[A-Za-z0-9 ._-]{1,64}$/),
            version: count,
            v4WireVersion: count,
          })
          .strict(),
        recordVersionMax: count,
        instructionContractMax: count,
      })
      .strict(),
    os: z
      .object({
        platform: z.string().regex(/^[a-z0-9_-]{1,32}$/i),
        arch: z.string().regex(/^[a-z0-9_-]{1,32}$/i),
      })
      .strict(),
    capabilities: z
      .object({
        parallelWorkflows: z.enum(["disabled", "experimental"]),
        feedbackUpload: z.literal(false),
        supportBundleSchemaVersion: z.literal(GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION),
      })
      .strict(),
    policy: z
      .object({
        automaticNetwork: z.record(z.string().regex(/^[A-Za-z]{1,40}$/), z.boolean()),
        automaticTelemetry: z.boolean(),
        feedbackSubmission: z.boolean(),
      })
      .strict(),
    profile: z
      .object({
        records: z
          .object({
            fileCount: count,
            totalBytes: count,
            runCount: count,
            byReadStatus: closedMap(READ_STATUSES),
            byStoredVersion: closedMap(versionKeys),
            runsByStatus: closedMap(statusKeys),
          })
          .strict(),
        workflowLibrary: z
          .object({
            present: z.boolean(),
            bytes: count,
            readable: z.boolean(),
            revision: count.nullable(),
            entryCount: count.nullable(),
          })
          .strict(),
        artifacts: z.object(storeShape).strict(),
        reconcileSnapshots: z.object({ ...storeShape, workspaceCount: count }).strict(),
        parallelWorkspaces: z.object({ present: z.boolean(), entryCount: count }).strict(),
      })
      .strict(),
    workspaces: z.array(workspaceSchema),
  })
  .strict();
export type GraphSupportBundle = z.infer<typeof supportBundleSchema>;

/** 递归地按键排序，使序列化与源数据的插入顺序无关；数组顺序由投影明确给出。 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}

function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* strings(item);
  else if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      yield key;
      yield* strings(item);
    }
}

/** 任何路径形状（分隔符或盘符前缀）都视为泄露。 */
const PATH_SHAPE = /[\\/]|^[A-Za-z]:/;

/**
 * 严格校验 + 规范化序列化 + 防线检查。任何失败都抛出固定文本的 GraphSupportBundleError；
 * 不会返回部分结果。返回的 json 就是将被保存的完整文本。
 */
export function serializeSupportBundle(candidate: unknown): { json: string; byteLength: number } {
  const parsed = supportBundleSchema.safeParse(candidate);
  if (!parsed.success) throw new GraphSupportBundleError("privacy-check-failed");
  const canonical = canonicalize(parsed.data);
  for (const text of strings(canonical))
    if (PATH_SHAPE.test(text)) throw new GraphSupportBundleError("privacy-check-failed");
  // 干净的包是诊断脱敏器的不动点；脱敏改变了任何字节就说明有东西不该在里面。
  const compact = JSON.stringify(canonical);
  if (redactFeedbackText(compact, { diagnostic: true }) !== compact)
    throw new GraphSupportBundleError("privacy-check-failed");
  const json = `${JSON.stringify(canonical, null, 2)}\n`;
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > GRAPH_SUPPORT_BUNDLE_MAX_BYTES) throw new GraphSupportBundleError("too-large");
  return { json, byteLength };
}
