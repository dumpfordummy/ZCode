import type { GraphSupportBundleResult, IGraphSupportService } from "@zcode/services";
import {
  ZCODE_PRODUCT_FLAVOR,
  resolveGraphSupportBundlePolicy,
  type IPlatformService,
} from "@zcode/shared";

/**
 * Z8.3-S1：本地 Graph 支持包的 renderer 侧逻辑（纯函数，便于测试）。
 * 所有者划分：Host 生成并给出完整 JSON 文本；renderer 只负责展示、核对字节数并显式请求保存；
 * 保存对话框与写文件仍由 Main 的既有保存文件边界完成。这里没有任何网络、上传或自动保存。
 */

/** 可用性只来自 shared 的策略（与 Host 同一判据）；Production/Preview 不出现入口。 */
export const GRAPH_SUPPORT_BUNDLE_AVAILABLE: boolean =
  resolveGraphSupportBundlePolicy(ZCODE_PRODUCT_FLAVOR).available;

export const SUPPORT_BUNDLE_FILE_NAME = "zcode-graph-support-bundle.json";

export type SupportBundleErrorId =
  | "unavailable"
  | "profile-unreadable"
  | "too-large"
  | "privacy-check-failed"
  | "mismatch"
  | "save-failed"
  | "generic";

const HOST_CODES = [
  "unavailable",
  "profile-unreadable",
  "too-large",
  "privacy-check-failed",
] as const;

/** Host 的错误文本以 `graph-support-bundle:<code>:` 开头（固定、不含路径）；其它任何错误都归为 generic，不显示其原文。 */
export function supportBundleErrorId(error: unknown): SupportBundleErrorId {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = /graph-support-bundle:([a-z-]+):/.exec(message);
  return (HOST_CODES as readonly string[]).includes(match?.[1] ?? "")
    ? (match![1] as SupportBundleErrorId)
    : "generic";
}

export interface PreparedSupportBundle {
  /** 交给 saveFile 的字节；与展示的字节数是同一份。 */
  bytes: ArrayBuffer;
  byteLength: number;
}

/** 将 Host 给出的 JSON 文本编码为将要保存的字节，并核对 Host 报告的字节数；不一致则拒绝（绝不保存一个“和预览不同”的文件）。 */
export function prepareSupportBundle(result: GraphSupportBundleResult): PreparedSupportBundle {
  const encoded = new TextEncoder().encode(result.json);
  if (
    result.schema !== "zcode.graph.support-bundle" ||
    typeof result.json !== "string" ||
    encoded.byteLength === 0 ||
    encoded.byteLength !== result.byteLength
  )
    throw new SupportBundleMismatchError();
  const bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return { bytes, byteLength: encoded.byteLength };
}

export class SupportBundleMismatchError extends Error {
  constructor() {
    super("The support bundle did not match its reported size.");
  }
}

export type SupportBundleGeneration =
  | {
      status: "ready";
      result: GraphSupportBundleResult;
      prepared: PreparedSupportBundle;
    }
  | { status: "error"; errorId: SupportBundleErrorId };

export async function generateSupportBundle(
  service: Pick<IGraphSupportService, "supportBundle"> | undefined,
): Promise<SupportBundleGeneration> {
  if (!service) return { status: "error", errorId: "unavailable" };
  try {
    const result = await service.supportBundle();
    return { status: "ready", result, prepared: prepareSupportBundle(result) };
  } catch (error) {
    return {
      status: "error",
      errorId:
        error instanceof SupportBundleMismatchError ? "mismatch" : supportBundleErrorId(error),
    };
  }
}

export type SupportBundleSave =
  | { status: "saved"; path?: string }
  | { status: "canceled" }
  | { status: "error"; errorId: "save-failed"; code?: string };

/**
 * 显式保存：只经 IPlatformService.saveFile（Main 的既有保存文件边界）。取消不写任何东西，也不提示；
 * 没有 saveFile 的平台（Web）得到 save-failed，入口本来就不会显示。
 */
export async function saveSupportBundle(
  platform: Pick<IPlatformService, "saveFile">,
  prepared: PreparedSupportBundle,
): Promise<SupportBundleSave> {
  if (!platform.saveFile) return { status: "error", errorId: "save-failed" };
  try {
    const result = await platform.saveFile({
      data: prepared.bytes,
      suggestedName: SUPPORT_BUNDLE_FILE_NAME,
    });
    if (result.canceled) return { status: "canceled" };
    if (result.success) return { status: "saved", ...(result.path ? { path: result.path } : {}) };
    return {
      status: "error",
      errorId: "save-failed",
      ...(result.error ? { code: result.error } : {}),
    };
  } catch {
    return { status: "error", errorId: "save-failed" };
  }
}

export type SupportBundleState =
  | { status: "idle" }
  | { status: "generating" }
  | {
      status: "ready" | "saving";
      result: GraphSupportBundleResult;
      prepared: PreparedSupportBundle;
      saved?: { path?: string };
      saveError?: { code?: string };
    }
  | { status: "error"; errorId: SupportBundleErrorId };

/**
 * 生成与显式保存的状态机（纯逻辑，无 React）。Host 拥有生成；这里只持有“当前预览”的状态，用代际计数忽略过期结果。
 * 保存只在 `ready` 状态且用户调用 save() 时发生一次；生成失败时不存在可保存的包，save() 是空操作；
 * 取消保持预览不变且不提示。
 */
export function createSupportBundleController(deps: {
  service: Pick<IGraphSupportService, "supportBundle"> | undefined;
  platform: Pick<IPlatformService, "saveFile"> | null;
  onState: (state: SupportBundleState) => void;
}) {
  let state: SupportBundleState = { status: "idle" };
  let generation = 0;
  const publish = (next: SupportBundleState) => {
    state = next;
    deps.onState(next);
  };
  return {
    getState: () => state,
    async generate() {
      const current = ++generation;
      publish({ status: "generating" });
      const outcome = await generateSupportBundle(deps.service);
      if (current !== generation) return;
      publish(
        outcome.status === "ready"
          ? { status: "ready", result: outcome.result, prepared: outcome.prepared }
          : { status: "error", errorId: outcome.errorId },
      );
    },
    async save() {
      if (state.status !== "ready" || !deps.platform) return;
      const { result, prepared } = state;
      const current = generation;
      publish({ status: "saving", result, prepared });
      const outcome = await saveSupportBundle(deps.platform, prepared);
      if (current !== generation) return;
      publish({
        status: "ready",
        result,
        prepared,
        ...(outcome.status === "saved" ? { saved: { path: outcome.path } } : {}),
        ...(outcome.status === "error" ? { saveError: { code: outcome.code } } : {}),
      });
    },
    /** 关闭对话框：丢弃预览并让进行中的异步结果失效。 */
    reset() {
      generation += 1;
      publish({ status: "idle" });
    },
  };
}
