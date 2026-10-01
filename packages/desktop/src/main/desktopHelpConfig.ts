import {
  buildHelpAppConfigUrl,
  buildZCodeSourceHeadersFromContext,
  createHelpAppConfigReader,
  ZCODE_ENV,
} from "@zcode/shared";

export function createDesktopHelpConfigReader(options: {
  resolveEndpointOrigin: () => Promise<string>;
  appVersion: string;
  deviceMid: string;
  /** 自动网络策略的裁决（`helpConfig`），必须显式传入。 */
  automaticFetchAllowed: boolean;
  /** 仅供测试注入回环 fixture；运行时使用 Electron `net.fetch`。 */
  fetchImpl?: typeof fetch;
}) {
  if (options.automaticFetchAllowed !== true) {
    // Z8.3-N1：Graph 不请求远端帮助配置。返回「无远端配置」，由调用方按既有契约回退到随包 config/default.json。
    return async (): Promise<unknown> => undefined;
  }
  const read = createHelpAppConfigReader({
    // 与 createElectronDesktopContextPromptConfigFetcher 一致：Electron 仅在真正发请求时才动态加载。
    fetchImpl:
      options.fetchImpl ??
      (async (input, init) => (await import("electron")).net.fetch(input, init)),
  });
  return async () => {
    const endpointOrigin = await options.resolveEndpointOrigin();
    return read(
      buildHelpAppConfigUrl(
        endpointOrigin,
        options.appVersion,
        `${process.platform}-${process.arch}`,
      ),
      buildZCodeSourceHeadersFromContext({
        endpointOrigin,
        appVersion: options.appVersion,
        deviceMid: options.deviceMid,
        platform: process.platform,
        arch: process.arch,
        releaseChannel: ZCODE_ENV,
        sourceTitle: "electron",
      }),
    );
  };
}
