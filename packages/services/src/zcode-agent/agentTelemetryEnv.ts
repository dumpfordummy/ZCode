import { createHash } from "node:crypto";
import { ZCODE_PRODUCT_FLAVOR, type ZCodeProductFlavor } from "@zcode/shared";

interface BuildAgentTelemetrySpawnEnvInput {
  telemetryEnv: Record<string, string>;
  deviceMid?: string;
  userId?: string;
  runtimeSurface: "desktop_local_host" | "remote_workspace_host";
  /** 仅供测试覆盖；运行时使用编译期身份。 */
  flavor?: ZCodeProductFlavor;
}

export function buildAgentTelemetrySpawnEnv(
  input: BuildAgentTelemetrySpawnEnvInput,
): Record<string, string> {
  // Graph 安装包有意关闭自动遥测：即使宿主进程继承了 OTLP 变量，也不向 Agent 进程传递。
  if ((input.flavor ?? ZCODE_PRODUCT_FLAVOR) === "graph") return {};
  if (
    !input.telemetryEnv.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT &&
    !input.telemetryEnv.OTEL_EXPORTER_OTLP_ENDPOINT
  ) {
    return {};
  }
  const deviceMid = input.deviceMid?.trim();
  const userId = input.userId?.trim();
  return {
    ...input.telemetryEnv,
    ...(deviceMid ? { ZCODE_TELEMETRY_DEVICE_MID: deviceMid } : {}),
    ...(userId
      ? {
          ZCODE_TELEMETRY_IDENTITY_STATE: "authenticated",
          // Desktop 原始账号只在 Host 凭据边界可见；Agent 仅收到不可读的 subject，
          // Trace 可以按用户关联，但不会上传账号、邮箱或登录名。
          ZCODE_TELEMETRY_USER_SUBJECT_ID: createHash("sha256").update(userId).digest("hex"),
        }
      : {
          ZCODE_TELEMETRY_IDENTITY_STATE: deviceMid ? "anonymous" : "unknown",
        }),
    ZCODE_TELEMETRY_RUNTIME_SURFACE: input.runtimeSurface,
  };
}
