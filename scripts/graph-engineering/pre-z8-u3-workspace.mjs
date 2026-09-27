import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "./isolation.mjs";
import { assertU3Profile } from "./pre-z8-u3-fixture.mjs";

export async function selectU3Workspace(window, workspace) {
  const item = window.getByTestId(`workspace-item-${workspace}`);
  await item.waitFor();
  // 真实侧栏展开事件负责草稿导航；不能仅点击已展开行而误认已切换 workspace。
  if ((await item.getAttribute("aria-expanded")) === "true") await item.click();
  await item.click();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.waitForFunction(
    (expected) =>
      document.querySelector('[data-testid="graph-workspace"]')?.textContent === expected,
    workspace,
  );
}

export async function prepareU3SecondaryWorkspace(isolation, window, summary) {
  const home = await assertU3Profile(isolation);
  const secondary = path.join(home, "workspace-u3-second");
  assert.equal(path.dirname(secondary), home);
  await mkdir(secondary);
  for (const [file, contents] of [
    [".env", ""],
    [
      "AGENTS.md",
      "Synthetic secondary U3 workspace. No input, execution, edits or external access is authorized.\n",
    ],
    ["README.txt", "Owned UI draft isolation fixture.\n"],
  ])
    await writeFile(path.join(secondary, file), contents, { flag: "wx" });
  assert.equal(await realpath(secondary), secondary);
  await promisify(execFile)("git", ["-c", "init.templateDir=", "init", "--quiet", secondary], {
    env: isolation.env,
    windowsHide: true,
  });
  const executable = path.join(root, "node_modules/electron/dist/electron.exe");
  const args = [
    path.join(root, "scripts/graph-engineering/native-bootstrap.cjs"),
    "--open-workspace",
    secondary,
  ];
  const opened = await promisify(execFile)(executable, args, {
    env: isolation.env,
    cwd: root,
    windowsHide: true,
    timeout: 30000,
  });
  await selectU3Workspace(window, secondary);
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-name").fill("PRE_Z8_U3_SECONDARY_UNSAVED_DRAFT");
  await selectU3Workspace(window, isolation.workspace);
  summary.secondaryWorkspace = {
    path: secondary,
    publicEntry: args,
    stdout: opened.stdout,
    stderr: opened.stderr,
  };
  return secondary;
}
