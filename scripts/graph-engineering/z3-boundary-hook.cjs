const fs = require("node:fs/promises");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const root = path.resolve(__dirname, "../..");
const profile = path.resolve(process.env.Z3_GRAPH_BOUNDARY_PROFILE ?? "");
const kind = process.env.Z3_GRAPH_BOUNDARY_KIND;
if (
  path.dirname(profile) !== path.join(root, ".tmp") ||
  !/^z1-native-\d+-[a-f0-9]{6}$/.test(path.basename(profile)) ||
  path.resolve(process.env.USERPROFILE ?? "") !== path.join(profile, "home") ||
  !["planned", "accepted", "decision-failure"].includes(kind)
)
  throw new Error("Z3 write hook rejected a foreign profile or checkpoint.");
const directory = path.join(profile, "data/.zcode/v2/graph-engineering");
const originalWrite = fs.writeFile;
let intercepted = false;
fs.writeFile = async function (file, content, options) {
  // Graph 复用已有私有原子写入器后临时名加入 PID/时间；只接受同一隔离目录内已知两种哈希文件名。
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
    const gate = run?.approvalAttempts?.find(
      (attempt) =>
        attempt.request?.title === "Approve interpretation" &&
        attempt.decision?.value === "approve",
    );
    const next = run?.nodeAttempts?.find(
      (attempt) => attempt.nodeId === gate?.request.successorNodeId,
    );
    const phase = kind === "planned" ? "creating" : "accepted";
    if (
      run?.version === 3 &&
      gate &&
      (kind === "decision-failure" || next?.dispatchPhase === phase)
    ) {
      intercepted = true;
      const destination = path.join(directory, `${temporary[1] ?? temporary[2]}.json`);
      const persisted = JSON.parse(await fs.readFile(destination, "utf8"));
      const before = persisted.runs.at(-1);
      const priorGate = before.approvalAttempts.find(
        (attempt) => attempt.attemptId === gate.attemptId,
      );
      const priorNext = before.nodeAttempts.find(
        (attempt) => attempt.nodeId === gate.request.successorNodeId,
      );
      if (
        before.id !== run.id ||
        (kind !== "decision-failure" && priorGate.decision?.id !== gate.decision.id) ||
        (kind === "planned" && priorNext.dispatchPhase !== "planned") ||
        (kind === "accepted" && priorNext.dispatchPhase !== "sending")
      )
        throw new Error("Unexpected actual persisted approval/dispatch checkpoint.");
      await originalWrite(
        path.join(profile, "z3-boundary-checkpoint.json"),
        JSON.stringify({ kind, observedAt: Date.now(), destination, persisted, proposed }, null, 2),
        { flag: "wx" },
      );
      if (kind === "decision-failure")
        throw new Error("Z3 isolated injected decision persistence failure.");
      // 只暂停当前合成 Host 的这一条元数据写入；没有伪造 session、input 或工具结果。
      await new Promise(() => {});
    }
  }
  return originalWrite.call(this, file, content, options);
};
syncBuiltinESMExports();
