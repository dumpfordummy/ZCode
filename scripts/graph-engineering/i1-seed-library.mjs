// Z8.4-I1: create workflow-library data with the INSTALLED app on the guest's real profile. A built-in engineering
// workflow is instantiated in a synthetic workspace (the same steps as reviewer-native.mjs), then the current design is
// captured into the workflow library as a reviewed, portable first version, which is what creates workflow-library.json.
// Guest-only (isolation.mjs refuses Z1_INSTALLED_PROFILE elsewhere). No model provider, no credentials.
//   Z1_INSTALLED_PROFILE=1 Z1_PACKAGED_EXE=<installed exe> node i1-seed-library.mjs [--out=<file>]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "./reviewer-native-responses.mjs";
import { prepareReviewerFixture } from "./reviewer-native-fixture.mjs";
import { instantiateReviewer } from "./reviewer-native-ui.mjs";
import { openShare } from "./ux-m3-native-library.mjs";

const arg = (name) =>
  process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, "pass", reviewerNativeResponse),
});
const summary = { assertions: [], screenshots: [], notes: [] };
let failure;
try {
  await prepareReviewerFixture(isolation);
  const window = await isolation.launch();
  summary.identity = await isolation.app.evaluate(({ app }) => ({
    name: app.getName(),
    version: app.getVersion(),
    exePath: app.getPath("exe"),
  }));
  await instantiateReviewer(isolation, window, summary, false);
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-library-open").click();
  await openShare(window);
  await window.getByTestId("graph-library-name").fill("I1 synthetic library design");
  await window
    .getByTestId("graph-library-description")
    .fill("Synthetic workflow-library entry for the installer lifecycle test.");
  await window.getByTestId("graph-library-capture").click();
  await window.getByTestId("graph-save-reviewed").waitFor();
  await window.getByTestId("graph-save-reviewed").setChecked(true);
  await window.getByTestId("graph-save-confirm").click();
  await window.getByTestId("graph-library-result").waitFor({ timeout: 30000 });
  const dataHome = isolation.graphProfile.env.ZCODE_DATA_BASE_DIR;
  const library = JSON.parse(
    await readFile(
      path.join(dataHome, ".zcode/v2/graph-engineering/workflow-library.json"),
      "utf8",
    ),
  );
  summary.library = library.entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    versions: entry.versions?.length,
  }));
} catch (error) {
  failure = error;
  summary.error = error instanceof Error ? error.stack : String(error);
}
summary.status = failure ? "FAIL" : "PASS";
summary.home = isolation.home;
summary.workspace = isolation.workspace;
await isolation.stopApp();
await isolation.fixture.close();
const text = JSON.stringify(summary, null, 2);
if (arg("out")) await writeFile(arg("out"), text);
console.log(text);
if (failure) process.exitCode = 1;
