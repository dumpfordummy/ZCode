// UX-M4 manual acceptance launcher: the freshly built Desktop in a NEW isolated profile with a
// disposable workspace, a second empty workspace folder, the controlled loopback provider (no
// credentials, no network) and the REAL Windows file dialogs (no controlled-dialog seam is set).
// Nothing is answered for you: answer every permission and approval yourself.
//   node scripts/graph-engineering/ux-m4-launch-manual.mjs [--theme=zai-light|zai-dark]
//        [--locale=zh-CN] [--seed-runs=3] [--smoke]
// `--theme` starts in Zai Light or Zai Dark (default: the app's own default). `--locale=zh-CN` starts in
// Simplified Chinese. `--seed-runs=N` first starts N real runs through New run -> Review -> Start and
// stops each with its Cancel control, so the list of runs is populated. `--smoke` only proves the launch and closes the app again (used to verify this launcher itself).
// This launcher does not change any global display setting.
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
const theme = arg("theme");

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
const window = await isolation.launch({
  bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
});
if (theme) {
  // 只写这个隔离配置档里的主题偏好，不改系统或全局显示设置。
  await window.evaluate((value) => localStorage.setItem("zcode-theme", value), theme);
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
}
if (seedRuns > 0) {
  await window
    .getByTestId("graph-engineering-open")
    .or(window.getByTestId("graph-engineering-panel"))
    .first()
    .waitFor({ timeout: 45000 });
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
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
      theme: theme ?? "app default",
      locale: locale ?? "app default",
      sentence: "Every request you run must CONTAIN this sentence (extra text is fine): " + REQUEST,
      note: "The file dialogs are the real Windows dialogs. Quit the app normally (window close) to end this launcher. Nothing outside the profile is touched.",
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
