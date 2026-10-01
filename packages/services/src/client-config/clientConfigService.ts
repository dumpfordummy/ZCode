import {
  buildZCodeEndpointUrls,
  clientConfigReadOptionsSchema,
  parseClientConfigSnapshot,
  resolveAutomaticNetworkPolicy,
  ZCODE_PRODUCT_FLAVOR,
  type ApiClient,
  type AutomaticNetworkPolicy,
  type ClientConfigSnapshot,
} from "@zcode/shared";
import type { IClientConfigService } from "./clientConfig.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

interface RequestContext {
  endpointOrigin: string;
  appVersion: string;
  platform: string;
}

interface CacheEntry {
  snapshot?: ClientConfigSnapshot;
  expiresAt: number;
  pending?: Promise<ClientConfigSnapshot>;
}

/** 首期仅公开配置；账户灰度不得通过此实例或缓存复用。 */
export function createClientConfigService(dependencies: {
  apiClient: ApiClient;
  resolveRequestContext: () => RequestContext | Promise<RequestContext>;
  /** 仅供测试覆盖；运行时使用编译期产品身份对应的策略。 */
  automaticNetworkPolicy?: AutomaticNetworkPolicy;
}): IClientConfigService {
  const entries = new Map<string, CacheEntry>();
  const automaticFetchAllowed = (
    dependencies.automaticNetworkPolicy ?? resolveAutomaticNetworkPolicy(ZCODE_PRODUCT_FLAVOR)
  ).clientConfig;

  async function fetchSnapshot(url: URL): Promise<ClientConfigSnapshot> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Public client config request timed out"));
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await dependencies.apiClient.request(url, {
            method: "GET",
            credentials: "omit",
            redirect: "error",
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Public client config HTTP ${response.status}`);
          // 设置中的 endpoint 可能在两次 await 之间变化；不能把新地址的响应缓存到旧地址。
          if (response.url && response.url !== url.toString()) {
            throw new Error("Public client config request context changed");
          }
          return parseClientConfigSnapshot(await response.json());
        })(),
        timedOut,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return {
    async getSnapshot(options = {}) {
      const { forceRefresh } = clientConfigReadOptionsSchema.parse(options);
      // Z8.3-N1：策略拒绝自动请求（Graph）时，非强制读取一律返回随包默认快照，
      // 不解析请求上下文、不碰缓存、不发请求。forceRefresh 是插件商店「刷新」按钮的显式用户操作，保持可用。
      if (!automaticFetchAllowed && forceRefresh !== true) return { pluginStoreOrder: null };
      const context = await dependencies.resolveRequestContext();
      const url = new URL(
        "/api/v1/client/configs",
        buildZCodeEndpointUrls(context.endpointOrigin).origin,
      );
      url.searchParams.set("app_version", context.appVersion);
      url.searchParams.set("platform", context.platform);
      const key = url.toString();
      const entry = entries.get(key) ?? { expiresAt: 0 };
      entries.set(key, entry);
      if (!forceRefresh && entry.snapshot && entry.expiresAt > Date.now()) {
        return structuredClone(entry.snapshot);
      }
      if (!entry.pending) {
        entry.pending = fetchSnapshot(url)
          .then((snapshot) => {
            entry.snapshot = snapshot;
            entry.expiresAt = Date.now() + CACHE_TTL_MS;
            return snapshot;
          })
          .finally(() => {
            entry.pending = undefined;
          });
      }
      return structuredClone(await entry.pending);
    },
  };
}
