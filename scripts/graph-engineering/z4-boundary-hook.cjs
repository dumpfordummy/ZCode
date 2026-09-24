const fs = require("node:fs/promises");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const root = path.resolve(__dirname, "../..");
const profile = path.resolve(process.env.Z4_GRAPH_BOUNDARY_PROFILE ?? "");
if (
  path.dirname(profile) !== path.join(root, ".tmp") ||
  !/^z1-native-\d+-[a-f0-9]{6}$/.test(path.basename(profile)) ||
  path.resolve(process.env.USERPROFILE ?? "") !== path.join(profile, "home")
)
  throw new Error("Z4 write hook rejected a foreign profile.");
const directory = path.join(profile, "data/.zcode/v2/graph-engineering");
const originalWrite = fs.writeFile;
let intercepted = false;
fs.writeFile = async function (file, content, options) {
  const temporary =
    typeof file === "string"
      ? path
          .basename(file)
          .match(
            /^(?:([a-f0-9]{64})\.json\.[a-f0-9-]+|\.([a-f0-9]{64})\.json\.\d+\.\d+\.[a-f0-9]+)\.tmp$/,
          )
      : null;
  if (
    !intercepted &&
    typeof file === "string" &&
    path.dirname(path.resolve(file)) === directory &&
    temporary &&
    typeof content === "string"
  ) {
    const proposed = JSON.parse(content);
    const run = proposed.runs?.at(-1);
    const attempt = run?.toolAttempts?.find((item) => item.recipe?.id === "fixture-test");
    if (
      run?.version === 4 &&
      attempt?.dispatchPhase === "accepted" &&
      attempt.operation?.status === "awaiting_permission"
    ) {
      intercepted = true;
      const destination = path.join(directory, `${temporary[1] ?? temporary[2]}.json`);
      const persisted = JSON.parse(await fs.readFile(destination, "utf8"));
      const before = persisted.runs.at(-1);
      const owned = before.toolAttempts.find((item) => item.attemptId === attempt.attemptId);
      if (
        before.id !== run.id ||
        owned.operationId !== attempt.operationId ||
        owned.dispatchPhase !== "sending" ||
        owned.sessionId !== attempt.sessionId ||
        owned.operation !== undefined ||
        !attempt.operation.requestDigest
      )
        throw new Error("Unexpected native operation acknowledgement checkpoint.");
      const checkpoint = path.join(profile, "z4-boundary-checkpoint.json");
      await originalWrite(
        `${checkpoint}.tmp`,
        JSON.stringify({ observedAt: Date.now(), destination, persisted, proposed }, null, 2),
        { flag: "wx" },
      );
      await fs.rename(`${checkpoint}.tmp`, checkpoint);
      // 仅暂停本次合成 Test 的原始 accepted 写入；真实会话权限和进程仍由原生运行时处理。
      await new Promise(() => {});
    }
  }
  return originalWrite.call(this, file, content, options);
};
syncBuiltinESMExports();
