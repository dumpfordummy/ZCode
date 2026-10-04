// Z8.4-I1: create synthetic Graph state with the INSTALLED app on the guest's real profile: one saved Tool-only workflow
// (Start -> Tool -> End, a harmless owned fixture command) and one completed run of it. Used with the old build (z8.2) to
// seed state before the upgrade, and with the new build afterwards to prove a new workflow still runs.
// Guest-only (isolation.mjs refuses Z1_INSTALLED_PROFILE elsewhere). No model provider, no credentials, no canaries.
//   Z1_INSTALLED_PROFILE=1 Z1_PACKAGED_EXE=<installed exe> node i1-seed-tool.mjs [--out=<file>]
import { writeFile } from "node:fs/promises";
import { createW1Isolation, packagedExe } from "./w1-common.mjs";
import { createToolOnlyGraph, prepareToolFixture, WORKFLOW_CANARY } from "./w1-tool-graph.mjs";
import { allowTool, openToolPermission, waitStatus, waitTool } from "./z4-native-helpers.mjs";

const arg = (name) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
packagedExe();
const isolation = await createW1Isolation({ provider: false });
const summary = { assertions: [], screenshots: [], notes: [] };
let failure;
try {
  await prepareToolFixture(isolation);
  const window = await isolation.launch();
  summary.identity = await isolation.app.evaluate(({ app }) => ({
    name: app.getName(),
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    exePath: app.getPath("exe"),
  }));
  const ids = await createToolOnlyGraph(window, summary);
  await window.getByTestId("graph-run-button").click();
  await openToolPermission(isolation, window, summary, ids.build, "i1-seed");
  await allowTool(window);
  await waitTool(isolation, ids.build, (attempt) => attempt.status === "Completed");
  const run = await waitStatus(window, isolation, "Completed");
  summary.run = { id: run.id, status: run.status, name: run.definition?.name };
  summary.workflowName = WORKFLOW_CANARY;
} catch (error) {
  failure = error;
  summary.error = error instanceof Error ? error.stack : String(error);
}
summary.status = failure ? "FAIL" : "PASS";
summary.home = isolation.home;
summary.workspace = isolation.workspace;
summary.recorderRequests = isolation.fixture.requests.map(
  (item) => `${item.method ?? "HTTP"} ${item.path}`,
);
await isolation.stopApp();
await isolation.fixture.close();
const text = JSON.stringify(summary, null, 2);
if (arg("out")) await writeFile(arg("out"), text);
console.log(text);
if (failure) process.exitCode = 1;
