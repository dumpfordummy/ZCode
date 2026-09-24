import assert from "node:assert/strict";
import path from "node:path";
import { captureNative, readGraphRecord, readNativeLedger } from "./z2-native-helpers.mjs";

export async function verifyInterruptedRestart(isolation, summary, waiting) {
  summary.beforeRestart = waiting;
  const ledger = readNativeLedger(isolation);
  await isolation.stopApp();
  const requests = isolation.fixture.requests.filter((request) => request.model).length;
  const window = await isolation.launch();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  await window
    .locator('[data-testid="graph-run"][data-status="Interrupted"]')
    .waitFor({ timeout: 30000 });
  const interrupted = (await readGraphRecord(isolation)).runs.at(-1);
  assert.equal(interrupted.id, waiting.id);
  assert.deepEqual(
    interrupted.nodeAttempts.map((node) => node.sessionId),
    waiting.nodeAttempts.map((node) => node.sessionId),
  );
  assert.deepEqual(readNativeLedger(isolation), ledger);
  assert.equal(isolation.fixture.requests.filter((request) => request.model).length, requests);
  await window.getByTestId("graph-reconcile").click();
  await window.locator('[data-testid="graph-recovery-state"][data-state="unknown"]').waitFor();
  assert.equal(await window.getByTestId("graph-release").count(), 0);
  summary.afterRestart = (await readGraphRecord(isolation)).runs.at(-1);
  assert.equal(summary.afterRestart.recovery.state, "unknown");
  assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
  summary.assertions.push(
    "Real app restart preserves interruption, original identities and pending successors; no native replay; previous-Host retirement is unproven and release stays disabled",
  );
  const file = path.join(isolation.home, "z2-interrupted-recovery-refused.png");
  await captureNative(isolation, window, file);
  summary.screenshots.push(file);
  return window;
}
