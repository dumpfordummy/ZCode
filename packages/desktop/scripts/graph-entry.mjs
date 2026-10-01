import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { createGraphProfile, graphAutomaticTelemetryEnv } from "./graph-profile.mjs";

// 原因：业务模块在 import 时缓存 home 路径，Preview 名称不隔离业务配置。
// ESM 入口用顶层 await 先隔离路径，再加载 Main，避免读取正式版凭据或错过 ready。
const profile = createGraphProfile(homedir(), process.env);
Object.assign(process.env, profile.env);
// 自动遥测在 Graph 安装包中被有意关闭；必须先于下面的动态导入清理继承的端点变量。
const telemetry = graphAutomaticTelemetryEnv(process.env);
for (const key of telemetry.remove) delete process.env[key];
Object.assign(process.env, telemetry.set);
await Promise.all(
  [...new Set(Object.values(profile.env))].map((directory) =>
    mkdir(directory, { recursive: true }),
  ),
);
await import("./index.js");
