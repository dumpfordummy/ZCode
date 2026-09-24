const fs = require("node:fs/promises");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");
const profile = path.resolve(process.env.Z2_GRAPH_BOUNDARY_PROFILE ?? "");
const root = path.resolve(__dirname, "../..");
if (
  path.dirname(profile) !== path.join(root, ".tmp") ||
  !/^z1-native-\d+-[a-f0-9]{6}$/.test(path.basename(profile)) ||
  path.resolve(process.env.USERPROFILE ?? "") !== path.join(profile, "home")
)
  throw new Error("Z2 write boundary hook rejected an unrecognized profile.");
const directory = path.join(profile, "data/.zcode/v2/graph-engineering");
const originalWrite = fs.writeFile;
let held = false;
fs.writeFile = async function (file, content, options) {
  if (
    !held &&
    typeof file === "string" &&
    path.dirname(path.resolve(file)) === directory &&
    /^[a-f0-9]{64}\.json\.[a-f0-9-]+\.tmp$/.test(path.basename(file)) &&
    typeof content === "string"
  ) {
    const proposed = JSON.parse(content);
    const run = proposed.runs?.at(-1);
    if (
      run?.version === 2 &&
      run.nodeAttempts[0]?.terminalProof?.state === "completedSuccess" &&
      run.nodeAttempts[1]?.dispatchPhase === "creating" &&
      !run.nodeAttempts[1].sessionId
    ) {
      held = true;
      const destination = file.replace(/\.[a-f0-9-]+\.tmp$/, "");
      const persisted = JSON.parse(await fs.readFile(destination, "utf8"));
      const previous = persisted.runs.at(-1);
      if (
        previous.id !== run.id ||
        previous.nodeAttempts[0]?.terminalProof?.state !== "completedSuccess" ||
        !previous.nodeAttempts[0]?.finalOutput?.text ||
        previous.nodeAttempts[1]?.dispatchPhase !== "planned" ||
        previous.nodeAttempts[1]?.sessionId
      )
        throw new Error(
          "Z2 expected persisted predecessor/next-dispatch boundary was not observed.",
        );
      await originalWrite(
        path.join(profile, "z2-boundary-checkpoint.json"),
        JSON.stringify(
          {
            kind: "actual-native-persisted-predecessor-before-successor-create",
            observedAt: Date.now(),
            destination,
            persisted,
            proposed,
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
      // Only this synthetic Host write is paused. No native session or command is fabricated.
      await new Promise(() => {});
    }
  }
  return originalWrite.call(this, file, content, options);
};
syncBuiltinESMExports();
