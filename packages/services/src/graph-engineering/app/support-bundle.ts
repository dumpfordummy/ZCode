/**
 * Z8.3-S1：把只读的记录清单与已知常量投影成封闭的支持包模型。spec: docs/graph-engineering/z8/Z8_3_S1_SPEC.md。
 * 投影只读取下面列出的结构化字段；没有任何自由文本被复制，也没有“先收集再脱敏”的步骤。
 */
import type { GraphRun } from "../contract.js";
import {
  ERROR_CLASSES,
  NODE_KINDS,
  OPAQUE_ID,
  VERSION_TEXT,
  type ErrorClass,
  type GraphSupportBundle,
} from "../domain/support-bundle.js";
import {
  GRAPH_SUPPORT_BUNDLE_SCHEMA,
  GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION,
  type GraphSupportBundleSection,
} from "../support-bundle-types.js";
import type { GraphRecordInventoryEntry } from "./ports.js";

/** 非记录存储的形状：只有存在性、大小、数量；由适配器通过 stat/目录列表得到。 */
export interface GraphStoreShapes {
  workflowLibrary: GraphSupportBundle["profile"]["workflowLibrary"];
  artifacts: GraphSupportBundle["profile"]["artifacts"];
  reconcileSnapshots: GraphSupportBundle["profile"]["reconcileSnapshots"];
  parallelWorkspaces: GraphSupportBundle["profile"]["parallelWorkspaces"];
}

/** 编译期常量与进程版本；调用方负责从已有来源取值。非法值在这里被替换为 "unknown"。 */
export interface GraphSupportBundleFacts {
  appVersion: string;
  buildCommit: string;
  buildTime: string;
  electron: string | null;
  node: string;
  protocol: { name: string; version: number; v4WireVersion: number };
  recordVersionMax: number;
  instructionContractMax: number;
  platform: string;
  arch: string;
  parallelWorkflows: "disabled" | "experimental";
  automaticNetwork: Readonly<Record<string, boolean>>;
  automaticTelemetry: boolean;
  feedbackSubmission: boolean;
}

export interface BuildSupportBundleInput {
  facts: GraphSupportBundleFacts;
  records: readonly GraphRecordInventoryEntry[];
  stores: GraphStoreShapes;
  sha256(text: string): string;
}

const increment = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};
const sortedUnique = (values: Iterable<string>) => [...new Set(values)].sort();

function projectRun(run: GraphRun, safeId: (value: string) => string) {
  const sessions: string[] = [];
  const commands: string[] = [];
  const nodeKinds: Record<string, number> = {};
  const errors = new Set<ErrorClass>();
  const statusErrors: Partial<Record<string, ErrorClass>> = {
    Failed: "run-failed",
    Rejected: "run-rejected",
    StaleEvidence: "run-stale-evidence",
    Interrupted: "run-interrupted",
    Unknown: "run-unknown",
    NeedsHuman: "routing-stop",
    BudgetExhausted: "routing-stop",
    NoProgress: "routing-stop",
  };
  const statusError = statusErrors[run.status];
  if (statusError) errors.add(statusError);
  // 未知的未来节点类型计入 "other"，不让整个包因此失败，也不复制类型名。
  for (const node of run.definition.nodes)
    increment(
      nodeKinds,
      (NODE_KINDS as readonly string[]).includes(node.type) ? node.type : "other",
    );
  if (run.version === undefined) {
    // Z1 旧运行：会话与命令 id 在运行本身上。
    if (run.sessionId) sessions.push(safeId(run.sessionId));
    commands.push(safeId(run.commandId));
    if (run.terminalProof?.state === "failed") errors.add("native-failed");
  } else {
    for (const attempt of run.nodeAttempts) {
      if (attempt.sessionId) sessions.push(safeId(attempt.sessionId));
      commands.push(safeId(attempt.commandId));
      if (attempt.terminalProof?.state === "failed") errors.add("native-failed");
      if (attempt.outputValidation?.status === "invalid") errors.add("output-invalid");
      // 只看是否存在，不复制其文本。
      if (attempt.outputIssue) errors.add("output-issue");
      if (attempt.status === "Failed") errors.add("attempt-failed");
    }
    for (const attempt of run.toolAttempts ?? [])
      if (attempt.status === "Failed") errors.add("attempt-failed");
  }
  return {
    runId: safeId(run.id),
    status: run.status,
    runVersion: run.version ?? 1,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    nodeKinds,
    errorClasses: ERROR_CLASSES.filter((name) => errors.has(name)),
    nativeSessionIds: sortedUnique(sessions),
    commandIds: sortedUnique(commands),
  };
}

const textOrUnknown = (value: string | null | undefined) =>
  typeof value === "string" && VERSION_TEXT.test(value) ? value : "unknown";

/** 把已解析的 Graph 记录与已知常量投影成封闭模型。不做序列化、不做检查；见 serializeSupportBundle。 */
export function buildSupportBundle(input: BuildSupportBundleInput): {
  bundle: GraphSupportBundle;
  sections: GraphSupportBundleSection[];
} {
  const { facts } = input;
  const safeId = (value: string) =>
    OPAQUE_ID.test(value) ? value : `hash-${input.sha256(value).slice(0, 32)}`;
  const byReadStatus: Record<string, number> = {};
  const byStoredVersion: Record<string, number> = {};
  const profileRunsByStatus: Record<string, number> = {};
  let runCount = 0;
  let totalBytes = 0;
  const workspaces = [...input.records]
    .sort((left, right) => (left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0))
    .map((entry) => {
      totalBytes += entry.bytes;
      increment(byReadStatus, entry.readStatus);
      increment(
        byStoredVersion,
        entry.storedVersion !== null && entry.storedVersion >= 1 && entry.storedVersion <= 5
          ? String(entry.storedVersion)
          : "unknown",
      );
      const runs = (entry.readStatus === "ok" ? (entry.record?.runs ?? []) : [])
        .map((run) => projectRun(run, safeId))
        .sort((left, right) =>
          left.createdAt !== right.createdAt
            ? left.createdAt - right.createdAt
            : left.runId < right.runId
              ? -1
              : left.runId > right.runId
                ? 1
                : 0,
        );
      const runsByStatus: Record<string, number> = {};
      for (const run of runs) {
        increment(runsByStatus, run.status);
        increment(profileRunsByStatus, run.status);
      }
      runCount += runs.length;
      return {
        workspaceHash: entry.hash,
        recordBytes: entry.bytes,
        readStatus: entry.readStatus,
        storedVersion: entry.storedVersion,
        runCount: runs.length,
        runsByStatus,
        runs,
      };
    });
  const bundle: GraphSupportBundle = {
    schema: GRAPH_SUPPORT_BUNDLE_SCHEMA,
    schemaVersion: GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION,
    scope: { graphOnly: true, localOnly: true, transmitted: false },
    identity: {
      productFlavor: "graph",
      appVersion: textOrUnknown(facts.appVersion),
      buildCommit: textOrUnknown(facts.buildCommit),
      buildTime: textOrUnknown(facts.buildTime),
    },
    runtime: {
      electron: facts.electron === null ? null : textOrUnknown(facts.electron),
      node: textOrUnknown(facts.node),
      cli: null,
      protocol: { ...facts.protocol },
      recordVersionMax: facts.recordVersionMax,
      instructionContractMax: facts.instructionContractMax,
    },
    os: { platform: facts.platform, arch: facts.arch },
    capabilities: {
      parallelWorkflows: facts.parallelWorkflows,
      feedbackUpload: false,
      supportBundleSchemaVersion: GRAPH_SUPPORT_BUNDLE_SCHEMA_VERSION,
    },
    policy: {
      automaticNetwork: { ...facts.automaticNetwork },
      automaticTelemetry: facts.automaticTelemetry,
      feedbackSubmission: facts.feedbackSubmission,
    },
    profile: {
      records: {
        fileCount: input.records.length,
        totalBytes,
        runCount,
        byReadStatus,
        byStoredVersion,
        runsByStatus: profileRunsByStatus,
      },
      workflowLibrary: { ...input.stores.workflowLibrary },
      artifacts: { ...input.stores.artifacts },
      reconcileSnapshots: { ...input.stores.reconcileSnapshots },
      parallelWorkspaces: { ...input.stores.parallelWorkspaces },
    },
    workspaces,
  };
  return {
    bundle,
    sections: [
      { id: "identity", count: 1 },
      { id: "runtime", count: 1 },
      { id: "os", count: 1 },
      { id: "capabilities", count: 1 },
      { id: "policy", count: 1 },
      { id: "profile", count: 1 },
      { id: "workspaces", count: workspaces.length },
      { id: "runs", count: runCount },
    ],
  };
}
