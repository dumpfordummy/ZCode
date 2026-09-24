export const packagedCases = [
  { name: "ordinary-chat", script: "native-smoke.mjs", args: ["--chat"] },
  { name: "no-provider", script: "native-smoke.mjs", args: ["--no-provider"] },
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
