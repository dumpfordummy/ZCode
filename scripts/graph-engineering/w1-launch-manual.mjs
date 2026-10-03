// Z8.3-W1 manual check launcher: the detached packaged ZCode Graph in a NEW synthetic profile (loopback model fixture,
// no credentials, redirected endpoints, no operator profile). It first drives the same harmless Tool-only run as the
// automated case (approving the synthetic fixture command) so that the support bundle has one run to describe, then leaves
// the app open for YOU: nothing else is answered for you, and the real Windows Save dialog is not intercepted.
//   $env:Z1_PACKAGED_EXE = "<detached copy>\ZCode Graph.exe"; node scripts/graph-engineering/w1-launch-manual.mjs [--smoke]
// `--smoke` proves the launch and the prepared state, prints what the loopback recorder saw, and closes.
// A temporary profile is not an OS sandbox: this is an isolation convenience, not containment.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createW1Isolation, packagedExe, recorderSnapshot } from "./w1-common.mjs";
import { createToolOnlyGraph, prepareToolFixture, WORKFLOW_CANARY } from "./w1-tool-graph.mjs";
import { allowTool, openToolPermission, waitStatus, waitTool } from "./z4-native-helpers.mjs";

const smoke = process.argv.includes("--smoke");
packagedExe();
const isolation = await createW1Isolation({ provider: true });
await prepareToolFixture(isolation);
const dataHome = isolation.graphProfile.env.ZCODE_DATA_BASE_DIR;
await mkdir(path.join(dataHome, ".zcode", "v2", "logs"), { recursive: true });
await writeFile(path.join(dataHome, ".zcode", "v2", "credentials.json"), JSON.stringify({ token: "W1_MANUAL_CANARY_CREDENTIAL" }));
let prepared = "not prepared";
try {
  const window = await isolation.launch();
  const summary = { assertions: [], screenshots: [] };
  const ids = await createToolOnlyGraph(window, summary);
  await window.getByTestId("graph-run-button").click();
  await openToolPermission(isolation, window, summary, ids.build, "w1-manual");
  await allowTool(window);
  await waitTool(isolation, ids.build, (attempt) => attempt.status === "Completed");
  await waitStatus(window, isolation, "Completed");
  const back = window.getByRole("button", { name: "Back to chat", exact: true });
  if (await back.isVisible()) await back.click();
  prepared = "one completed Tool-only run exists";
} catch (error) {
  prepared = `preparation stopped: ${String(error.message).split("\n")[0]}`;
}
console.log(`Synthetic profile: ${isolation.home}`);
console.log(`Prepared state: ${prepared}. Workflow name carries the canary ${WORKFLOW_CANARY} (it must NOT appear in the bundle).`);
console.log(`Loopback recorder so far: ${JSON.stringify(recorderSnapshot(isolation).map((item) => `${item.method} ${item.path}`))}`);
if (smoke) {
  await isolation.close();
} else {
  console.log("The app is open. Follow the manual checklist, then quit the app to finish.");
  await new Promise((resolve) => isolation.app.process().once("exit", resolve));
  console.log(`Requests the loopback recorder saw during your session: ${JSON.stringify(recorderSnapshot(isolation).map((item) => `${item.method} ${item.path}`))}`);
  await isolation.close();
}
