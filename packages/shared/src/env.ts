import type { ZCodeRuntimeEnv } from "./runtimeEnv.js";

export type ZCodeEnv = "test" | "production";
/** 安装包身份：决定应用名、app id、Electron 数据目录与更新策略；与后端环境 `ZCodeEnv` 是两个轴。 */
export type ZCodeProductFlavor = "production" | "preview" | "graph";
export type ArmsRumEnv = "local" | "prod";

// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，用 typeof 检查 + fallback 避免 ReferenceError
declare const __ZCODE_ENV__: string;
declare const __ZCODE_PRODUCT_FLAVOR__: string;

export function normalizeZCodeEnv(value: string | undefined): ZCodeEnv {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

export const ZCODE_ENV = normalizeZCodeEnv(
  typeof __ZCODE_ENV__ !== "undefined" ? __ZCODE_ENV__ : undefined,
);

/**
 * 身份缺省跟随后端环境（test → preview，production → production）。
 * 桌面构建通过 `ZCODE_PREVIEW_IDENTITY=1` 显式注入 preview，得到连接生产后端的 Preview 包；
 * 未注入 define 的 bundle（web、CLI、测试）沿用旧的单轴语义。
 */
export function normalizeZCodeProductFlavor(
  value: string | undefined,
  zcodeEnv: ZCodeEnv,
): ZCodeProductFlavor {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production" || normalized === "preview" || normalized === "graph") {
    return normalized;
  }
  return zcodeEnv === "production" ? "production" : "preview";
}

export const ZCODE_PRODUCT_FLAVOR = normalizeZCodeProductFlavor(
  typeof __ZCODE_PRODUCT_FLAVOR__ !== "undefined" ? __ZCODE_PRODUCT_FLAVOR__ : undefined,
  ZCODE_ENV,
);
export const ZCODE_APP_VERSION_ENV = "ZCODE_APP_VERSION" as const;
export const ZCODE_BUILD_COMMIT_ID_ENV = "ZCODE_BUILD_COMMIT_ID" as const;

// ── 运行时环境变量（不经过编译打包，启动时从 process.env 读取） ──
// 启用调试模式，值为 inspect-brk 的端口号，如 ZCODE_DEBUG=9230
export const RUNTIME_ZCODE_DEBUG =
  typeof process !== "undefined" ? process.env.ZCODE_DEBUG : undefined;

/**
 * 自动遥测策略的唯一计算处。Graph 安装包有意关闭自动遥测：即使继承了端点环境变量也不启用。
 * 其它身份与改动前完全一致：功能保持可用，实际出网由各出口的运行时端点检查决定，未配置不上报。
 * 注意这些常量在模块加载时求值；Graph 入口在导入应用前就清理继承的变量，本函数是第二道独立防线。
 */
export function resolveAutomaticTelemetryPolicy(
  flavor: ZCodeProductFlavor,
  env: Record<string, string | undefined>,
): { enabled: boolean; reportEndpoint: string; armsRumEndpoint: string } {
  if (flavor === "graph") return { enabled: false, reportEndpoint: "", armsRumEndpoint: "" };
  return {
    enabled: true,
    reportEndpoint: env.ZCODE_TELEMETRY_REPORT_ENDPOINT ?? "",
    armsRumEndpoint: env.ZCODE_ARMS_RUM_ENDPOINT ?? "",
  };
}

const automaticTelemetry = resolveAutomaticTelemetryPolicy(
  ZCODE_PRODUCT_FLAVOR,
  typeof process !== "undefined" ? process.env : {},
);

export const ZCODE_TELEMETRY_ENABLED: boolean = automaticTelemetry.enabled;

/** 数仓事件上报端点：由运行时环境变量提供，未配置即停用，构建产物不内嵌。Graph 安装包恒为空。 */
export const ZCODE_TELEMETRY_REPORT_ENDPOINT = automaticTelemetry.reportEndpoint;

/** ARMS RUM 接入端点：由运行时环境变量提供，未配置即停用，构建产物不内嵌。Graph 安装包恒为空。 */
export const ZCODE_ARMS_RUM_ENDPOINT = automaticTelemetry.armsRumEndpoint;

/** 将本地运行态与编译期 ZCODE_ENV 映射为 ARMS 控制台识别的上报环境标签 */
export function mapZCodeEnvToArmsRumEnv(runtimeEnv: ZCodeRuntimeEnv): ArmsRumEnv {
  return runtimeEnv !== "development" && ZCODE_ENV === "production" ? "prod" : "local";
}
