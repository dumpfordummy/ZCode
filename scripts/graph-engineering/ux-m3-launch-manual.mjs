// UX-M3 manual acceptance launcher: the freshly built Desktop in a NEW isolated profile with a
// disposable workspace, a second empty workspace folder, the controlled loopback provider (no
// credentials, no network) and the REAL Windows file dialogs (no controlled-dialog seam is set).
// Nothing is answered for you: answer every permission and approval yourself.
//   node scripts/graph-engineering/ux-m3-launch-manual.mjs [--historical-run] [--locale=zh-CN] [--smoke]
// `--historical-run` first drives ONE real run through the app (New run -> Review -> Start) and cancels it,
// then closes the app, rewrites that run's captured workflow pin on disk to built-in version 1 with a
// digest the library never published, and relaunches. It creates a *historical run record* for the
// "Run again on a pin that is no longer offered" check. It does NOT create a library version: the
// library still offers only what the Host publishes. Not exercised in the Cloud (no Electron here):
// if the app refuses the rewritten record, report it and use a real profile from a build before
// 2026-09-28, or record the check as NOT RUN.
// `--locale=zh-CN` starts the app in Simplified Chinese. `--smoke` proves the launch and closes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { createIsolation, root } from "./isolation.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { reviewerNativeResponse } from "./reviewer-native-responses.mjs";
import { REQUEST, prepareUxWorkspace } from "./ux-m1-native-common.mjs";
import { cancelRun, ensureShellFolders, startFromNewRun } from "./ux-m2-native-common.mjs";

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
const smoke = process.argv.includes("--smoke");
const historical = process.argv.includes("--historical-run");
const locale = arg("locale");
const HISTORICAL_DIGEST = "e".repeat(64);

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
const launchOptions = {
  bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
};
let window = await isolation.launch(launchOptions);
let rewritten;
if (historical) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  const run = await startFromNewRun(isolation, window);
  await cancelRun(isolation, window, run.id);
  await isolation.stopApp();
  const file = acceptancePaths(isolation).record;
  const record = JSON.parse(await readFile(file, "utf8"));
  const target = record.runs.find((item) => item.id === run.id);
  if (!target?.definition?.template) throw new Error("The cancelled run carries no workflow pin.");
  rewritten = {
    runId: run.id,
    workflow: target.definition.template.id,
    from: {
      version: target.definition.template.version,
      digest: target.definition.template.digest,
    },
    to: { version: 1, digest: HISTORICAL_DIGEST },
  };
  // 宿主要求运行的冻结出处与定义里的模板逐字节相同（"Template run must preserve its exact frozen
  // provenance."）；只改定义会被产品校验拒绝（UX-M3 Windows 验收实测），所以两份副本一起改。
  for (const copy of [target.definition.template, target.provenance.template]) {
    copy.version = 1;
    copy.digest = HISTORICAL_DIGEST;
  }
  await writeFile(file, JSON.stringify(record, null, 2));
  window = await isolation.launch(launchOptions);
}
console.log(
  JSON.stringify(
    {
      profile: isolation.home,
      workspace: isolation.workspace,
      secondWorkspaceFolder: second,
      fileOutsideTheWorkspace: files.outside,
      controlledProvider: isolation.fixture.origin,
      historicalRun: rewritten ?? null,
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
