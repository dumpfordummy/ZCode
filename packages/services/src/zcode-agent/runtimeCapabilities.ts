import { z } from "zod";
import { zcodeProtocolMethods } from "@zcode/shared";
import type { ZCodeProtocolClient } from "./zcodeProtocolClient.js";

/** `supported: false` 只表示 method-not-found（旧 agent）；传输失败会抛出，由调用方按失败关闭。 */
export type ZCodeAgentRuntimeCapabilitiesRead =
  | { supported: false }
  | { supported: true; capabilities: unknown };

const reads = new WeakMap<object, Promise<ZCodeAgentRuntimeCapabilitiesRead>>();

const isMethodNotFound = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === -32601;

/**
 * 读取 `runtime/capabilities` 的原始结果，不做兼容判断：判断由调用方的纯函数完成。
 * 结果按 client 缓存——agent 重启或被替换就是新 client，会重新探测；失败不缓存。
 */
export function readRuntimeCapabilities(
  client: Pick<ZCodeProtocolClient, "request">,
): Promise<ZCodeAgentRuntimeCapabilitiesRead> {
  const cached = reads.get(client);
  if (cached) return cached;
  const read = client
    .request(zcodeProtocolMethods.runtimeCapabilities, {}, z.unknown())
    .then((capabilities): ZCodeAgentRuntimeCapabilitiesRead => ({ supported: true, capabilities }))
    .catch((error: unknown): ZCodeAgentRuntimeCapabilitiesRead => {
      if (isMethodNotFound(error)) return { supported: false };
      reads.delete(client);
      throw error;
    });
  reads.set(client, read);
  return read;
}
