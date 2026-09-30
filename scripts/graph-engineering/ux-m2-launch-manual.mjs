// UX-M2 manual acceptance launcher: the freshly built Desktop in a NEW isolated profile with a
// disposable workspace, a second empty workspace folder, the controlled loopback provider (no
// credentials, no network) and the REAL Windows file dialog (no controlled-dialog seam is set).
// Nothing is clicked for you except the optional history seeding below: answer every permission and
// approval yourself.
//   node scripts/graph-engineering/ux-m2-launch-manual.mjs [--seed-runs=26] [--locale=zh-CN] [--smoke]
// `--seed-runs=N` first starts N real runs through the app's own New run -> Review -> Start path and
// stops each with its Cancel control, so the history already spans more than one page (25 per page).
// `--locale=zh-CN` starts the app in Simplified Chinese (Windows keeps its own display language).
// `--smoke` only proves the launch and closes the app again (used to verify this launcher itself).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "./reviewer-native-responses.mjs";
import { REQUEST, prepareUxWorkspace } from "./ux-m1-native-common.mjs";
import { cancelRun, ensureShellFolders, startFromNewRun } from "./ux-m2-native-common.mjs";

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
const smoke = process.argv.includes("--smoke");
const seedRuns = Number(arg("seed-runs") ?? 0);
const locale = arg("locale");

const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, "pass", reviewerNativeResponse),
});
const files = await prepareUxWorkspace(isolation);
await ensureShellFolders(isolation);
if (locale) {
  const settingPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
  const setting = JSON.parse(await readFile(settingPath, "utf8"));
  await writeFile(settingPath, JSON.stringify({ ...setting, localePreference: locale }));
}
const second = path.join(isolation.home, "workspace-b");
await mkdir(path.join(second, "docs"), { recursive: true });
await writeFile(
  path.join(second, "AGENTS.md"),
  "Second disposable workspace for the switch test.\n",
);
await writeFile(
  path.join(second, "docs/Other.md"),
  "A document that only exists in workspace B.\n",
);
const window = await isolation.launch({
  bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
});
if (seedRuns > 0) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  for (let count = 0; count < seedRuns; count += 1) {
    const run = await startFromNewRun(isolation, window);
    await cancelRun(isolation, window, run.id);
  }
}
console.log(
  JSON.stringify(
    {
      profile: isolation.home,
      workspace: isolation.workspace,
      secondWorkspaceFolder: second,
      fileOutsideTheWorkspace: files.outside,
      controlledProvider: isolation.fixture.origin,
      seededRuns: seedRuns,
      sentence: "Every request you run must CONTAIN this sentence (extra text is fine): " + REQUEST,
      note: "The file chooser is the real Windows dialog. Quit the app normally (window close) to end this launcher. Nothing outside the profile is touched.",
    },
    null,
    2,
  ),
);
if (smoke) {
  await isolation.close();
} else {
  await new Promise((resolve) => isolation.app.process().once("exit", resolve));
  await isolation.close();
}
