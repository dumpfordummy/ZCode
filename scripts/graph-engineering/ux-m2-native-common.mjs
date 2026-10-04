// UX-M2 Windows acceptance: shared pieces of the native journeys. Real Electron app, real Graph Host,
// real recipe store, real native sessions and permissions, a loopback controlled provider and a
// disposable workspace. Builds on the UX-M1.4 native harness (`ux-m1-native-common.mjs`).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { root } from "./isolation.mjs";
import {
  REQUEST,
  T,
  flush,
  launchUx as launchM1,
  openNewRun,
  snapshot,
  waitRecord,
} from "./ux-m1-native-common.mjs";
import { pickRecipe } from "./ux-m1-native-checks-helpers.mjs";

export * from "./ux-m1-native-common.mjs";
export { pickRecipe };

const OS_DIALOG = path.join(root, "scripts/graph-engineering/ux-m2-os-file-dialog.ps1");

/**
 * Launch as UX-M1 does. Raw evidence (receipts, screenshots) goes to the gitignored `.tmp/m2-evidence`;
 * a reviewed subset is copied into the documentation folder afterwards.
 */
export async function launchUx(journey, options = {}) {
  const launched = await launchM1(journey, options);
  const { mkdir, rm } = await import("node:fs/promises");
  await rm(launched.receipt.evidenceDir, { recursive: true, force: true });
  launched.receipt.evidenceDir = path.join(
    root,
    ".tmp/m2-evidence",
    `${journey}-${path.basename(launched.isolation.home)}`,
  );
  await mkdir(launched.receipt.evidenceDir, { recursive: true });
  await ensureShellFolders(launched.isolation);
  return launched;
}

/**
 * The isolated profile has a private HOME. The real Windows dialog opens on `%USERPROFILE%\Desktop` and shows
 * "Location is not available" first when that folder does not exist; create the usual empty folders.
 */
export async function ensureShellFolders(isolation) {
  const { mkdir } = await import("node:fs/promises");
  // 已安装模式（Z8.4-I1）下，应用进程内的 USERPROFILE 是 Graph 私有 home，对话框也可能按它解析默认文件夹；两处都建。
  const roots = new Set([
    isolation.shellHome ?? path.join(isolation.home, "home"),
    ...(isolation.installedProfile && isolation.graphProfile
      ? [isolation.graphProfile.env.HOME]
      : []),
  ]);
  for (const root of roots)
    for (const name of ["Desktop", "Documents", "Downloads"])
      await mkdir(path.join(root, name), { recursive: true });
}

/**
 * Drive the REAL Windows file dialog that Electron opened (no controlled-dialog intent is set for the
 * channel). Returns the script's JSON result; a dialog that never appears rejects.
 */
export async function driveOsDialog(isolation, action, filePath = "") {
  const pid = isolation.app.process().pid;
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    OS_DIALOG,
    "-ProcessId",
    String(pid),
    "-Action",
    action,
    ...(filePath ? ["-Path", filePath] : []),
  ];
  try {
    const { stdout } = await promisify(execFile)("powershell.exe", args, { windowsHide: true });
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  } catch (error) {
    throw new Error(`OS file dialog automation failed: ${error.stdout ?? ""}${error.message}`);
  }
}

/** Make sure New run is open on the Sequential engineering workflow with the reviewer checks chosen. */
export async function prepareNewRun(window, request = REQUEST) {
  await openNewRun(window);
  if (!(await T(window, "graph-template-recipe-build").count())) {
    await T(window, "graph-library-entry").click();
    await window.locator('[role="option"][data-value="generic"]').click();
    await T(window, "graph-template-recipe-build").waitFor();
  }
  await T(window, "graph-template-parameter-request").fill(request);
  await pickRecipe(window, "graph-template-recipe-build", "reviewer-build");
  await pickRecipe(window, "graph-template-recipe-test", "reviewer-test");
}

/** Review and run -> explicit acknowledgment -> Start, from the New-run pane. Returns the admitted run. */
export async function startFromNewRun(isolation, window, request = REQUEST) {
  const before = (await snapshot(isolation)).runCount;
  await prepareNewRun(window, request);
  await window.waitForFunction(
    () => !document.querySelector('[data-testid="graph-review-run"]')?.disabled,
    undefined,
    { timeout: 30000 },
  );
  await T(window, "graph-review-run").click();
  await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
  await T(window, "graph-preflight-ack").click();
  await T(window, "graph-confirm-run").click();
  const { record } = await waitRecord(
    isolation,
    (item) => item.runs.length === before + 1,
    "the admitted run",
  );
  return record.runs.at(-1);
}

/** Stop the run with the real Cancel control (selecting it first when it is on the shown page). */
export async function cancelRun(isolation, window, runId) {
  const row = window.locator(`[data-testid="graph-run"][data-run-id="${runId}"]`);
  if (await row.count()) await row.click();
  await T(window, "graph-run-summary").waitFor();
  assert.equal(await T(window, "graph-run-summary").getAttribute("data-run-id"), runId);
  await T(window, "graph-cancel").click();
  await waitRecord(
    isolation,
    (item) =>
      ["Cancelled", "Interrupted"].includes(item.runs.find((run) => run.id === runId)?.status),
    `run ${runId} to stop`,
  );
}

/** Run ids on the shown history page, in the order the user sees them. */
export const pageIds = (window) =>
  window
    .locator('[data-testid="graph-run"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-run-id")));
export const selectedRunId = (window) =>
  window
    .locator('[data-testid="graph-run"][aria-current="true"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-run-id")));
export const rangeText = async (window) =>
  (await T(window, "graph-history-range").innerText()).replace(/\s+/g, " ").trim();
export const waitUntil = (window, fn, arg, what, timeout = 20000) =>
  window.waitForFunction(fn, arg, { timeout }).catch((error) => {
    throw new Error(`Timed out waiting for ${what}: ${error.message}`);
  });
export { flush };
