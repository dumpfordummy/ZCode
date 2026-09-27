import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "./isolation.mjs";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { readGraphRecord, selectValue } from "./z2-native-helpers.mjs";
import { withOwnedRecordWriteFailure } from "./pre-z8-u1-record-fault.mjs";

const SECOND_REQUEST = "Second isolated workspace draft; do not execute.";
const SECOND_DESIGN = "PRE_Z8_U1_SECOND_WORKSPACE_DRAFT";

async function selectWorkspace(window, workspace) {
  const item = window.getByTestId(`workspace-item-${workspace}`);
  await item.waitFor();
  // 侧栏已展开行先收起再展开；真实展开事件才执行该 workspace 的草稿导航。
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

export async function verifyWorkspaceDraftRetention(
  isolation,
  window,
  summary,
  { request, name, capture, idle },
) {
  const ownedHome = await realpath(isolation.home);
  const secondary = path.join(ownedHome, "workspace-u1-second");
  assert.equal(path.dirname(secondary), ownedHome);
  await mkdir(secondary);
  for (const [file, text] of [
    [".env", ""],
    [
      "AGENTS.md",
      "Synthetic second-workspace UI fixture. Do not execute commands or modify source.\n",
    ],
    ["README.txt", "Separate workspace draft-retention fixture; no execution.\n"],
  ])
    await writeFile(path.join(secondary, file), text, { flag: "wx" });
  assert.equal(await realpath(secondary), secondary);
  await promisify(execFile)("git", ["-c", "init.templateDir=", "init", "--quiet", secondary], {
    env: isolation.env,
    windowsHide: true,
  });
  const savedBefore = await readGraphRecord(isolation);
  const executable = path.join(root, "node_modules/electron/dist/electron.exe");
  const args = [
    path.join(root, "scripts/graph-engineering/native-bootstrap.cjs"),
    "--open-workspace",
    secondary,
  ];
  const publicOpen = await promisify(execFile)(executable, args, {
    env: isolation.env,
    cwd: root,
    windowsHide: true,
    timeout: 30000,
  });
  summary.workspaceSwitch = {
    primary: isolation.workspace,
    secondary,
    publicEntry: args,
    stdout: publicOpen.stdout,
    stderr: publicOpen.stderr,
  };
  await selectWorkspace(window, secondary);
  await window.getByTestId("graph-view-design").click();
  assert.notEqual(await window.getByTestId("graph-name").inputValue(), name);
  await window.getByTestId("graph-name").fill(SECOND_DESIGN);
  await window.getByTestId("graph-view-workflows").click();
  await selectValue(window, "graph-library-entry", "agent-assisted");
  assert.equal(await window.getByTestId("graph-template-parameter-request").inputValue(), "");
  await window.getByTestId("graph-template-parameter-request").fill(SECOND_REQUEST);
  await idle("second workspace draft entry");
  await capture("pre-z8-u1-second-workspace-draft");
  await selectWorkspace(window, isolation.workspace);
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), name);
  await window.getByTestId("graph-view-workflows").click();
  assert.equal(await window.getByTestId("graph-template-parameter-request").inputValue(), request);
  assert.deepEqual(await readGraphRecord(isolation), savedBefore);
  await selectWorkspace(window, secondary);
  await window.getByTestId("graph-view-workflows").click();
  assert.equal(
    await window.getByTestId("graph-template-parameter-request").inputValue(),
    SECOND_REQUEST,
  );
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), SECOND_DESIGN);
  await selectWorkspace(window, isolation.workspace);
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), name);
  await idle("workspace switch/back");
  await capture("pre-z8-u1-primary-draft-restored");
  summary.assertions.push(
    "Actual public second-instance workspace open and sidebar switches retain separate task/design drafts in two owned synthetic workspaces with zero native admissions or model requests.",
  );
}

export async function verifyFailedSaveReplacement(
  isolation,
  window,
  summary,
  { request, name, capture, idle },
) {
  const record = acceptancePaths(isolation).record;
  const original = await readGraphRecord(isolation);
  await withOwnedRecordWriteFailure({ home: isolation.home, record }, async () => {
    await window.getByTestId("graph-library-instantiate").click();
    const dialog = window.getByTestId("graph-replace-dialog");
    await dialog.waitFor();
    await window.getByTestId("graph-replace-save").click();
    const error = dialog.getByRole("alert").first();
    await error.waitFor();
    summary.saveFailure = await error.innerText();
    assert.match(
      summary.saveFailure,
      /EISDIR|EPERM|EACCES|directory|operation not permitted|permission denied/i,
    );
    await window.waitForFunction(
      () => !document.querySelector('[data-testid="graph-replace-cancel"]')?.disabled,
    );
    assert.equal(
      await window.getByTestId("graph-template-parameter-request").inputValue(),
      request,
    );
    await idle("failed Save-and-replace");
    await capture("pre-z8-u1-save-replace-failed");
  });
  summary.saveRestoration = JSON.parse(
    await readFile(path.join(isolation.home, "pre-z8-u1-save-restoration.json"), "utf8"),
  );
  assert.equal(summary.saveRestoration.restoration, "restored-exact-bytes");
  assert.deepEqual(await readGraphRecord(isolation), original);
  await window.getByTestId("graph-replace-cancel").click();
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), name);
  await window.getByTestId("graph-view-workflows").click();
  assert.equal(await window.getByTestId("graph-template-parameter-request").inputValue(), request);
  await idle("restored Save-and-replace failure");
  summary.assertions.push(
    "Real owned-record atomic-write failure leaves saved bytes and unsaved task/design intact, admits nothing, and records exact finally restoration before explicit replacement retry.",
  );
}
