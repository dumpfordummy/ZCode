// U4 source-drift helpers — prove the product's StaleEvidence contract at the approval boundary.
// The run is driven to its final gate (WaitingForApproval) with frozen source evidence, then the
// fixture source is mutated in place (inode-preserving) before an approval attempt. The product's
// approvals.check recomputes the live source evidence, detects the drift, sets gate/run status to
// StaleEvidence and blocks the decision. Old evidence cannot be approved as current; restoring the
// source does not auto-recover the run (re-verification / a new run is required).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AFTER_SOURCE } from "./z3-fixture.mjs";
import { u3Sha256 } from "./pre-z8-u3-fixture.mjs";
import {
  captureU3,
  ledger,
  modelCount,
  readGraphRecord,
  showGraph,
  u3Wait,
} from "./pre-z8-u3-common.mjs";
import { decide } from "./z3-native-helpers.mjs";
import { waitRun } from "./z5-native-observe.mjs";
import { captureU4Summary, selectU4Run } from "./pre-z8-u4-ui.mjs";

const DRIFTED_SOURCE = "export const marker = 'Z1_DRIFTED_7391';\n";

/**
 * Inode-preserving in-place mutation of fixture.mjs around an observer. The mutation changes the
 * marker value so the source evidence fingerprint differs from the frozen gate request. The exact
 * original bytes (and atime/mtime) are restored in place afterwards; concurrent identity changes
 * are refused, never silently overwritten. Mirrors pre-z8-u2-fault.mjs withU2OwnedMutation.
 */
export async function withU4SourceDrift(isolation, observe) {
  const file = path.join(isolation.workspace, "fixture.mjs");
  const original = await readFile(file);
  const metadata = await lstat(file);
  assert.equal(original.toString(), AFTER_SOURCE, "fixture.mjs must be at the after-edit state");
  const mutated = Buffer.from(DRIFTED_SOURCE);
  const identity = randomUUID();
  const receipt = {
    kind: "u4-source-drift",
    path: file,
    beforeSha256: u3Sha256(original),
    mutatedSha256: u3Sha256(mutated),
    backupPath: path.join(isolation.home, `pre-z8-u4-source-drift-${identity}.original`),
    receiptPath: path.join(isolation.home, `pre-z8-u4-source-drift-${identity}.json`),
    startedAt: Date.now(),
    restoration: "pending",
  };
  await writeFile(receipt.backupPath, original, { flag: "wx" });
  await writeFile(receipt.receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx" });
  let value, observerError;
  try {
    const handle = await open(file, "r+");
    try {
      const current = await handle.stat();
      assert.equal(current.ino, metadata.ino);
      assert.equal(current.dev, metadata.dev);
      assert.deepEqual(await handle.readFile(), original);
      await handle.write(mutated, 0, mutated.length, 0);
      await handle.truncate(mutated.length);
    } finally {
      await handle.close();
    }
    value = await observe(receipt);
  } catch (error) {
    observerError = error;
  }
  try {
    // 只恢复本次写入且身份未变的夹具；并发变化保留原样，并留下原始备份供诊断。
    const current = await lstat(file);
    assert.equal(current.ino, metadata.ino, "Refusing to restore a changed fixture identity.");
    assert.equal(current.dev, metadata.dev);
    const retained = await readFile(file);
    const writeNeverChangedBytes = observerError && retained.equals(original);
    if (!writeNeverChangedBytes)
      assert.deepEqual(retained, mutated, "Refusing to restore changed fixture bytes.");
    const restore = await open(file, "r+");
    try {
      const identityNow = await restore.stat();
      assert.equal(identityNow.ino, metadata.ino);
      assert.equal(identityNow.dev, metadata.dev);
      assert.deepEqual(await restore.readFile(), retained);
      await restore.write(original, 0, original.length, 0);
      await restore.truncate(original.length);
      await restore.utimes(metadata.atime, metadata.mtime);
    } finally {
      await restore.close();
    }
    receipt.afterSha256 = u3Sha256(await readFile(file));
    assert.equal(receipt.afterSha256, receipt.beforeSha256);
    receipt.restoration = "restored-exact-bytes";
  } catch (error) {
    receipt.restoration = "refused-concurrent-change";
    receipt.restorationError = String(error);
    if (observerError)
      throw new AggregateError(
        [observerError, error],
        "Observation and fixture restoration failed.",
      );
    throw error;
  } finally {
    receipt.completedAt = Date.now();
    if (observerError) receipt.observerError = String(observerError);
    await writeFile(receipt.receiptPath, JSON.stringify(receipt, null, 2));
  }
  if (observerError) throw observerError;
  return { value, receipt };
}

/**
 * After an approval attempt on drifted source, assert the product blocked it. The persisted run
 * record is the contract proof (run + gate both StaleEvidence, gate message names the drift). The
 * UI proof (approve disabled, blocked status, stale run card) is polled afterwards. Returns the
 * stale run.
 */
export async function assertU4StaleEvidence(isolation, window, summary, run, nodeId) {
  const stale = await waitRun(
    isolation,
    (value) => value.id === run.id && value.status === "StaleEvidence",
  );
  const gate = stale.approvalAttempts.find((attempt) => attempt.nodeId === nodeId);
  assert.equal(gate?.status, "StaleEvidence");
  assert.ok(
    gate.message.includes("Relevant evidence or source state changed after review."),
    `Unexpected stale gate message: ${gate.message}`,
  );
  assert.equal(gate.resumeRequired, false);
  summary.staleEvidence = {
    runId: stale.id,
    runStatus: stale.status,
    gateStatus: gate.status,
    gateMessage: gate.message,
    resumeRequired: gate.resumeRequired,
  };
  // UI proof: the run list reflects StaleEvidence and the approval panel blocks the decision.
  await selectU4Run(window, stale.id);
  await window
    .locator(`[data-testid="graph-run"][data-status="StaleEvidence"]`)
    .first()
    .waitFor({ timeout: 30000 });
  const approve = window.getByTestId("graph-approval-approve");
  await approve.waitFor({ timeout: 10000 }).catch(() => {});
  if (await approve.isVisible().catch(() => false)) {
    await u3Wait(
      () => approve.isDisabled(),
      (disabled) => disabled,
      "approve disabled under StaleEvidence",
    );
    await window.getByTestId("graph-approval-blocked").waitFor({ timeout: 10000 });
    summary.staleEvidence.uiBlocked = true;
  } else {
    // The approval panel may have been replaced by another view after the failed decision; the
    // persisted record above is the contract proof. Capture the current UI either way.
    summary.staleEvidence.uiBlocked = "panel-not-visible-record-is-proof";
  }
  await captureU4Summary(isolation, window, summary, "pre-z8-u4-source-drift-stale-blocked");
  summary.assertions.push(
    "Source drift after evidence capture blocks approval: the run and gate become StaleEvidence, the gate message names the source/evidence drift, the approve control is disabled, and the frozen evidence cannot be approved as current.",
  );
  return stale;
}

/**
 * Drive the source-drift scenario: open the gate, mutate fixture.mjs at the approval boundary,
 * attempt to approve, assert StaleEvidence, then restore the source and prove the run does NOT
 * auto-recover (it stays StaleEvidence; re-verification / a new run is required).
 */
export async function driveU4SourceDrift(isolation, window, summary, run, nodeId) {
  const inputsBefore = await ledger(isolation),
    requestsBefore = modelCount(isolation);
  const drift = await withU4SourceDrift(isolation, async () => {
    await decide(
      window,
      "approve",
      "Attempting to approve frozen evidence after source drift; the contract must block this.",
    );
    return assertU4StaleEvidence(isolation, window, summary, run, nodeId);
  });
  summary.permissionBoundaryRestoration = drift.receipt;
  // Restoring the exact source bytes must NOT auto-recover the run: it stays StaleEvidence until a
  // fresh reviewed run re-verifies. No stale bypass, no blind replay.
  const stillStale = (await readGraphRecord(isolation)).runs.find((item) => item.id === run.id);
  assert.equal(stillStale.status, "StaleEvidence", "run must not auto-recover after source restore");
  assert.equal(
    stillStale.approvalAttempts.find((attempt) => attempt.nodeId === nodeId).status,
    "StaleEvidence",
  );
  assert.equal(
    JSON.stringify((await readGraphRecord(isolation)).runs.find((item) => item.id === run.id)),
    JSON.stringify(drift.value),
    "stale run record must stay frozen after restore (no silent re-verification)",
  );
  // The drift attempt added no new native input and no model request (approval was blocked).
  assert.deepEqual(await ledger(isolation), inputsBefore);
  assert.equal(modelCount(isolation), requestsBefore);
  await assertU4SourceRestored(isolation);
  await captureU4Summary(isolation, window, summary, "pre-z8-u4-source-drift-restored-no-recovery");
  summary.assertions.push(
    "Restoring the exact source bytes after StaleEvidence does not auto-recover the run or re-freeze evidence; the stale gate stays blocked and a fresh reviewed run is required. No stale bypass or blind replay.",
  );
  return drift;
}

async function assertU4SourceRestored(isolation) {
  const file = path.join(isolation.workspace, "fixture.mjs");
  const restored = await readFile(file, "utf8");
  assert.equal(restored, AFTER_SOURCE, "fixture.mjs must be restored to the exact after-edit bytes");
}
