import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import path from "node:path";
import { acceptancePaths } from "./acceptance-paths.mjs";
import {
  captureNative,
  readGraphRecord,
  readNativeLedger,
  selectNode,
  waitForRecord,
} from "./z2-native-helpers.mjs";

export async function ledger(isolation) {
  try {
    await access(acceptancePaths(isolation).ledger);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return readNativeLedger(isolation);
}
export const modelCount = (isolation) =>
  isolation.fixture.requests.filter((request) => request.model).length;
export async function showGraph(window) {
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
}
export async function waitStatus(window, isolation, status) {
  await window
    .locator(`[data-testid="graph-run"][data-status="${status}"]`)
    .first()
    .waitFor({ timeout: 45000 });
  return (
    await waitForRecord(isolation, (record) => record.runs.at(-1)?.status === status)
  ).runs.at(-1);
}
export async function waitGate(window, isolation, nodeId, status = "WaitingForApproval") {
  const run = await waitStatus(window, isolation, status);
  await selectNode(window, nodeId);
  const gate = run.approvalAttempts.find((attempt) => attempt.nodeId === nodeId);
  assert.ok(gate?.request);
  const panel = window.getByTestId("graph-approval-request");
  await panel.waitFor();
  assert.equal(await panel.getAttribute("data-request-id"), gate.request.id);
  assert.equal(await panel.getAttribute("data-request-version"), String(gate.request.version));
  assert.equal(await panel.getAttribute("data-digest"), gate.request.digest);
  assert.equal(gate.request.runId, run.id);
  assert.equal(gate.request.attemptId, gate.attemptId);
  assert.equal(gate.request.nodeId, nodeId);
  assert.deepEqual(gate.request.target, run.target);
  for (const key of ["sessionId", "inputId", "commandId", "runtimeIdentity"])
    assert.equal(gate[key], undefined);
  return { run, gate };
}
export async function decide(
  window,
  value,
  comment = "Reviewed the exact frozen synthetic evidence.",
) {
  await window.getByTestId("graph-approval-comment").fill(comment);
  await window.getByTestId(`graph-approval-${value}`).click();
}
export async function capture(isolation, window, summary, name) {
  const file = path.join(isolation.home, `${name}.png`);
  await captureNative(isolation, window, file);
  summary.screenshots.push(file);
}
export async function captureGateEvidence(isolation, window, summary, alias, sourcePath) {
  const evidence = window.getByTestId(`graph-approval-evidence-details-${alias}`);
  await evidence.locator("pre").first().scrollIntoViewIfNeeded();
  await capture(isolation, window, summary, `z3-${alias}-frozen-text`);
  const file = window.locator(
    `[data-testid="graph-approval-source-file"][data-path="${sourcePath}"]`,
  );
  if ((await file.getAttribute("open")) === null) await file.locator(":scope > summary").click();
  if (sourcePath === "review-note.txt") {
    await file.locator("details").last().locator(":scope > summary").click();
  }
  await file.locator("pre:visible").last().scrollIntoViewIfNeeded();
  await capture(isolation, window, summary, `z3-${alias}-source-snapshot`);
}
export async function captureGateCanvasDetail(isolation, window, summary, nodeId) {
  const node = window.locator(`.react-flow__node[data-id="${nodeId}"]`);
  const bounds = await node.boundingBox();
  assert.ok(bounds);
  await window.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await window.mouse.wheel(0, -800);
  await window.waitForFunction(
    (id) =>
      document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect().width >
      150,
    nodeId,
  );
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    const encoded = await nativeWindow.evaluate(async (browserWindow) =>
      (await browserWindow.capturePage()).toPNG().toString("base64"),
    );
    const file = path.join(isolation.home, "z3-pending-canvas-detail.png");
    await writeFile(file, Buffer.from(encoded, "base64"));
    summary.screenshots.push(file);
  } finally {
    await nativeWindow.dispose();
  }
}
export async function readCheckpoint(isolation) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(
        await readFile(path.join(isolation.home, "z3-boundary-checkpoint.json"), "utf8"),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await wait(25);
  }
  throw new Error("No actual persisted Z3 decision/dispatch checkpoint was observed.");
}
export async function finishEvidence(isolation, summary, window, error) {
  if (error) {
    summary.status = "FAIL";
    summary.error = error instanceof Error ? error.stack : String(error);
    summary.body = await window
      ?.locator("body")
      .innerText()
      .catch(() => "Unavailable");
    if (window)
      await capture(isolation, window, summary, "z3-failure").catch((failure) => {
        summary.screenshotError = String(failure);
      });
    process.exitCode = 1;
  } else summary.status = "PASS";
  summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  summary.nativeToolResults = isolation.fixture.toolResults;
  summary.providerErrors = isolation.fixture.errors;
  summary.marker = isolation.fixture.marker;
  await writeFile(path.join(isolation.home, "z3-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
