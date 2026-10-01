import path from "node:path";

/** Pure profile mapping, also used by the packaged-app acceptance harness. */
export function createGraphProfile(originalHome, env = {}) {
  const previous = env.ZCODE_GRAPH_PROFILE_ROOT;
  const root =
    previous &&
    path.isAbsolute(previous) &&
    path.basename(previous) === ".zcode-graph-engineering" &&
    path.resolve(originalHome) === path.join(previous, "home")
      ? previous
      : path.join(path.resolve(originalHome), ".zcode-graph-engineering");
  const home = path.join(root, "home");
  return {
    root,
    env: {
      ZCODE_GRAPH_PROFILE_ROOT: root,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(root, "appdata"),
      LOCALAPPDATA: path.join(root, "localappdata"),
      ZCODE_HOME: path.join(home, ".zcode"),
      ZCODE_STORAGE_DIR: path.join(home, ".zcode"),
      ZCODE_DATA_BASE_DIR: home,
      ZCODE_DESKTOP_HOME_DIR: home,
      ZCODE_DESKTOP_USER_DATA_DIR: path.join(root, "electron"),
      ZCODE_DESKTOP_SESSION_DATA_DIR: path.join(root, "electron", "session"),
    },
  };
}

const GRAPH_TELEMETRY_ENDPOINT_KEYS = new Set(["ZCODE_ARMS_RUM_ENDPOINT", "ZCODE_TELEMETRY_REPORT_ENDPOINT"]);

/**
 * Graph 安装包有意关闭自动遥测。继承的端点/OTLP 变量必须在应用模块导入前清除：
 * `@zcode/shared` 在模块加载时读取端点，Main 随后还会把 OTEL_* 捕获后传给 Agent 进程，
 * 导入之后再改环境变量已经来不及。这是第一道防线；共享策略与 Agent 启动环境是独立的第二、三道。
 * 纯函数，供入口与测试共用；Windows 环境变量不区分大小写，所以按大写比较。
 */
export function graphAutomaticTelemetryEnv(env = {}) {
  const remove = Object.keys(env).filter((key) => {
    const name = key.toUpperCase();
    return (
      name.startsWith("OTEL_") ||
      name.startsWith("ZCODE_TELEMETRY_") ||
      GRAPH_TELEMETRY_ENDPOINT_KEYS.has(name)
    );
  });
  return { remove, set: { ZCODE_MODEL_TELEMETRY_ENABLED: "0" } };
}
