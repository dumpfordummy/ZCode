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

/** 自动（非用户触发）上游配置/目录请求的分类；每一类对应一个具体出口。 */
export const AUTOMATIC_NETWORK_CLASSES = [
  "desktopRollout",
  "helpConfig",
  "clientConfig",
  "clientScenes",
  "builtinProviderCatalog",
  "pluginMarketplace",
] as const;
export type AutomaticNetworkClass = (typeof AUTOMATIC_NETWORK_CLASSES)[number];
export type AutomaticNetworkPolicy = Readonly<Record<AutomaticNetworkClass, boolean>>;

function buildAutomaticNetworkPolicy(allowed: boolean): AutomaticNetworkPolicy {
  return Object.freeze(
    Object.fromEntries(AUTOMATIC_NETWORK_CLASSES.map((name) => [name, allowed])) as Record<
      AutomaticNetworkClass,
      boolean
    >,
  );
}

function isSupportedUpstreamFlavor(flavor: ZCodeProductFlavor): boolean {
  return flavor === "production" || flavor === "preview";
}

/**
 * 自动网络请求策略的唯一计算处（Z8.3-N1）。Graph 不发起任何自动的上游配置/目录请求，
 * 使用随包的默认配置；Production/Preview 与改动前完全一致。
 * 未知 flavor 同样拒绝：策略缺失或无法识别时，受影响的自动动作一律不执行。
 * 用户显式触发的操作（强制刷新、设置页刷新等）不经过本策略。
 */
export function resolveAutomaticNetworkPolicy(flavor: ZCodeProductFlavor): AutomaticNetworkPolicy {
  return buildAutomaticNetworkPolicy(isSupportedUpstreamFlavor(flavor));
}

/** Feedback 提交与上传（工单、附件、日志）的策略；与自动网络策略同一判据，Graph 内部版不提供上传。 */
export function resolveFeedbackSubmissionPolicy(flavor: ZCodeProductFlavor): {
  readonly allowed: boolean;
} {
  return Object.freeze({ allowed: isSupportedUpstreamFlavor(flavor) });
}

/**
 * 本地 Graph 支持包（Z8.3-S1）的可用性策略。仅 Graph 内部版提供；Production/Preview 不出现入口，Host 方法也拒绝。
 * 未知 flavor 同样不可用（fail closed）。Host 与 UI 读取同一个结果，不各自判断 flavor。
 */
export function resolveGraphSupportBundlePolicy(flavor: ZCodeProductFlavor): {
  readonly available: boolean;
} {
  return Object.freeze({ available: flavor === "graph" });
}

/** Host 经既有的 Agent spawn 环境通道下发被拒绝的类别（逗号分隔）；Agent 进程不再自行判断 flavor。 */
export const ZCODE_AUTOMATIC_NETWORK_DENY_ENV = "ZCODE_AUTOMATIC_NETWORK_DENY" as const;

export function encodeAutomaticNetworkDeny(policy: AutomaticNetworkPolicy): string {
  return AUTOMATIC_NETWORK_CLASSES.filter((name) => policy[name] !== true).join(",");
}

/**
 * 从 Host 下发的环境值还原策略。变量缺失或为空表示进程不受产品 flavor 约束（独立 CLI），
 * Host 启动的 Agent 一定带有该变量；出现任何未知类别名则整体拒绝（fail closed）。
 */
export function resolveAutomaticNetworkPolicyFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): AutomaticNetworkPolicy {
  const raw = env[ZCODE_AUTOMATIC_NETWORK_DENY_ENV]?.trim();
  if (!raw) return buildAutomaticNetworkPolicy(true);
  const denied = new Set<string>();
  for (const token of raw.split(",")) {
    const name = token.trim();
    if (!(AUTOMATIC_NETWORK_CLASSES as readonly string[]).includes(name)) {
      return buildAutomaticNetworkPolicy(false);
    }
    denied.add(name);
  }
  return Object.freeze(
    Object.fromEntries(
      AUTOMATIC_NETWORK_CLASSES.map((name) => [name, !denied.has(name)]),
    ) as Record<AutomaticNetworkClass, boolean>,
  );
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
