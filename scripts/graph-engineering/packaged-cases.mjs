export const packagedCases = [
  { name: "ordinary-chat", script: "native-smoke.mjs", args: ["--chat"] },
  { name: "no-provider", script: "native-smoke.mjs", args: ["--no-provider"] },
  // Z8.1：继承的遥测端点（ARMS、数仓、OTLP）指向本机金丝雀；Graph 安装包必须零命中且不初始化 ARMS。
  { name: "telemetry-canary", script: "native-smoke.mjs", args: ["--chat", "--telemetry-canary"] },
  { name: "z1-literal-compatibility", script: "z2-z1-regression.mjs", args: [] },
  ...[
    "complete",
    "question",
    "cancel-question",
    "cancel-permission",
    "cancel-progress",
    "restart-interrupted",
    "restart-permission",
    "persistence-recovery",
  ].map((scenario) => ({
    name: `z2-${scenario}`,
    script: "z2-native-smoke.mjs",
    args: [`--scenario=${scenario}`],
  })),
];
