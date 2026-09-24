const fs = require("node:fs/promises");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const root = path.resolve(__dirname, "../..");
const profile = path.resolve(process.env.Z5_GRAPH_BOUNDARY_PROFILE ?? "");
const kind = process.env.Z5_GRAPH_BOUNDARY_KIND;
if (
  path.dirname(profile) !== path.join(root, ".tmp") ||
  !/^z1-native-\d+-[a-f0-9]{6}$/.test(path.basename(profile)) ||
  path.resolve(process.env.USERPROFILE ?? "") !== path.join(profile, "home") ||
  !["planned", "accepted"].includes(kind)
)
  throw new Error("Z5 hook rejected a foreign profile or unsupported checkpoint.");
const directory = path.join(profile, "data/.zcode/v2/graph-engineering");
const original = fs.writeFile;
let intercepted = false;
fs.writeFile = async function (file, content, options) {
  const match =
    typeof file === "string"
      ? path
          .basename(file)
          .match(
            /^(?:([a-f0-9]{64})\.json\.[a-f0-9-]+|\.([a-f0-9]{64})\.json\.\d+\.\d+\.[a-f0-9]+)\.tmp$/,
          )
      : null;
  if (
    !intercepted &&
    match &&
    path.dirname(path.resolve(file)) === directory &&
    typeof content === "string"
  ) {
    const proposed = JSON.parse(content),
      run = proposed.runs?.at(-1),
      routing = run?.routing;
    const iteration = routing?.iterations.find((item) => item.id === routing.currentIterationId);
    const repairId = run?.definition.routing?.region?.repairEntryNodeId;
    const repair = run?.nodeAttempts.find(
      (item) => item.attemptId === iteration?.attemptIds[repairId],
    );
    if (
      run?.version === 5 &&
      iteration?.index === 1 &&
      repair?.dispatchPhase === (kind === "planned" ? "creating" : "accepted")
    ) {
      intercepted = true;
      const destination = path.join(directory, `${match[1] ?? match[2]}.json`);
      const persisted = JSON.parse(await fs.readFile(destination, "utf8"));
      const before = persisted.runs.at(-1),
        owned = before.nodeAttempts.find((item) => item.attemptId === repair.attemptId);
      const checkpoint = before.routing.checkpoints.at(-1);
      if (
        before.id !== run.id ||
        owned.dispatchPhase !== (kind === "planned" ? "planned" : "sending") ||
        checkpoint.successorNodeId !== repair.nodeId ||
        checkpoint.iterationId !== iteration.id ||
        !checkpoint.decisionId ||
        (kind === "planned" && owned.sessionId) ||
        (kind === "accepted" && (!owned.sessionId || owned.sessionId !== repair.sessionId))
      )
        throw new Error("Unexpected original repair decision/dispatch checkpoint.");
      const evidence = path.join(profile, "z5-boundary-checkpoint.json");
      await original(
        `${evidence}.tmp`,
        JSON.stringify({ kind, observedAt: Date.now(), destination, persisted, proposed }, null, 2),
        { flag: "wx" },
      );
      await fs.rename(`${evidence}.tmp`, evidence);
      // 仅暂停当前合成 Repair 的一条原始写入；不伪造决策、预算、输入或执行结果。
      await new Promise(() => {});
    }
  }
  return original.call(this, file, content, options);
};
syncBuiltinESMExports();
