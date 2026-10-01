import { createHash } from "node:crypto";
import {
  ZCODE_PROTOCOL_NAME,
  ZCODE_PROTOCOL_V4_WIRE_VERSION,
  ZCODE_PROTOCOL_VERSION,
  resolveAutomaticNetworkPolicy,
  resolveAutomaticTelemetryPolicy,
  resolveFeedbackSubmissionPolicy,
  resolveGraphParallelPolicy,
  resolveGraphSupportBundlePolicy,
  ZCODE_BUILD_TIME,
  ZCODE_COMMIT,
  ZCODE_PRODUCT_FLAVOR,
  ZCODE_VERSION,
  type GraphParallelPolicy,
  type ZCodeProductFlavor,
} from "@zcode/shared";
import {
  buildSupportBundle,
  type GraphRecordInventory,
  type GraphSupportBundleFacts,
} from "../app/support-bundle.js";
import type { IGraphSupportService } from "../support-contract.js";
import { GraphSupportBundleError, serializeSupportBundle } from "../domain/support-bundle.js";
import {
  MAX_SUPPORTED_INSTRUCTION_CONTRACT,
  MAX_SUPPORTED_RECORD_VERSION,
} from "../domain/record-version.js";
import type { GraphSupportBundleResult } from "../support-bundle-types.js";
import { createGraphStoreInventory } from "./support-bundle-stores.js";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * 编译期常量与进程版本，没有任何环境变量读取：遥测策略以空环境求值，只取 enabled 布尔，不取端点。
 * 测试可以覆盖 flavor 与事实（例如固定版本号）。
 */
function defaultSupportBundleFacts(
  flavor: ZCodeProductFlavor,
  parallelPolicy: () => GraphParallelPolicy,
): GraphSupportBundleFacts {
  return {
    appVersion: ZCODE_VERSION,
    buildCommit: ZCODE_COMMIT,
    buildTime: ZCODE_BUILD_TIME,
    electron: process.versions.electron ?? null,
    node: process.versions.node,
    protocol: {
      name: ZCODE_PROTOCOL_NAME,
      version: ZCODE_PROTOCOL_VERSION,
      v4WireVersion: ZCODE_PROTOCOL_V4_WIRE_VERSION,
    },
    recordVersionMax: MAX_SUPPORTED_RECORD_VERSION,
    instructionContractMax: MAX_SUPPORTED_INSTRUCTION_CONTRACT,
    platform: process.platform,
    arch: process.arch,
    parallelWorkflows: parallelPolicy().mode,
    automaticNetwork: { ...resolveAutomaticNetworkPolicy(flavor) },
    automaticTelemetry: resolveAutomaticTelemetryPolicy(flavor, {}).enabled,
    feedbackSubmission: resolveFeedbackSubmissionPolicy(flavor).allowed,
  };
}

/**
 * Z8.3-S1：Graph Host 的支持包构造。只读：经既有 GraphRepository.inventory 读记录，经适配器 stat 其它存储。
 * 任何内部错误都折叠成固定代码，不带路径或底层消息。
 */
export function createGraphSupportService(options: {
  directory: string;
  repository: GraphRecordInventory;
  flavor?: ZCodeProductFlavor;
  parallelPolicy?: () => GraphParallelPolicy;
  facts?: (flavor: ZCodeProductFlavor) => GraphSupportBundleFacts;
}): IGraphSupportService {
  const flavor = options.flavor ?? ZCODE_PRODUCT_FLAVOR;
  const stores = createGraphStoreInventory(options.directory);
  const parallelPolicy =
    options.parallelPolicy ?? (() => resolveGraphParallelPolicy({ flavor, env: {} }));
  return {
    async supportBundle(): Promise<GraphSupportBundleResult> {
      if (!resolveGraphSupportBundlePolicy(flavor).available || !options.repository.inventory)
        throw new GraphSupportBundleError("unavailable");
      let built: ReturnType<typeof buildSupportBundle>;
      try {
        built = buildSupportBundle({
          facts: options.facts?.(flavor) ?? defaultSupportBundleFacts(flavor, parallelPolicy),
          records: await options.repository.inventory(),
          stores: await stores(),
          sha256,
        });
      } catch (error) {
        if (error instanceof GraphSupportBundleError) throw error;
        throw new GraphSupportBundleError("profile-unreadable");
      }
      const { json, byteLength } = serializeSupportBundle(built.bundle);
      return {
        schema: built.bundle.schema,
        schemaVersion: built.bundle.schemaVersion,
        json,
        byteLength,
        sections: built.sections,
      };
    },
  };
}
