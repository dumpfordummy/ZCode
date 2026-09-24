import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import {
  captureNative,
  openRunNode,
  readGraphRecord,
  selectNode,
  waitForRecord,
} from "./z2-native-helpers.mjs";
import { ledger, modelCount, showGraph, waitStatus } from "./z3-native-helpers.mjs";

export { ledger, modelCount, readGraphRecord, selectNode, showGraph, waitForRecord, waitStatus };
export async function capture(isolation, window, summary, name) {
  const file = path.join(isolation.home, `${name}.png`);
  await captureNative(isolation, window, file);
  summary.screenshots.push(file);
}
export async function waitTool(isolation, nodeId, predicate) {
  const record = await waitForRecord(
    isolation,
    (value) => {
      const run = value.runs.at(-1);
      const attempt = run?.toolAttempts?.find((item) => item.nodeId === nodeId);
      if (!attempt) return false;
      if (predicate(attempt, run)) return true;
      if (["Failed", "Unknown", "Interrupted"].includes(run.status))
        throw new Error(
          `Actual native Tool did not reach the required state: ${JSON.stringify({ status: run.status, message: run.message, attempt })}`,
        );
      return false;
    },
    90000,
  );
  const run = record.runs.at(-1);
  return { run, attempt: run.toolAttempts.find((item) => item.nodeId === nodeId) };
}
export async function openToolPermission(isolation, window, summary, nodeId, name) {
  if (isolation.uiFirstWait) {
    await showGraph(window);
    await selectNode(window, nodeId);
    await window.waitForFunction(
      () => {
        const status = document
          .querySelector('[data-testid="graph-tool-inspector"]')
          ?.getAttribute("data-status");
        const run = document
          .querySelector('[data-testid="graph-run"]')
          ?.getAttribute("data-status");
        return (
          status === "WaitingForPermission" ||
          ["Failed", "Unknown", "Interrupted"].includes(run ?? "")
        );
      },
      undefined,
      { timeout: 45000 },
    );
    assert.equal(
      await window.getByTestId("graph-tool-inspector").getAttribute("data-status"),
      "WaitingForPermission",
      await window.locator("body").innerText(),
    );
  }
  const pending = await waitTool(
    isolation,
    nodeId,
    (attempt) => attempt.operation?.status === "awaiting_permission",
  );
  await showGraph(window);
  await selectNode(window, nodeId);
  const inspector = window.getByTestId("graph-tool-inspector");
  assert.equal(await inspector.getAttribute("data-operation-id"), pending.attempt.operationId);
  assert.equal(await inspector.getAttribute("data-session-id"), pending.attempt.sessionId);
  assert.equal(pending.attempt.operation.processStarted, false);
  const inputs = await ledger(isolation),
    requests = modelCount(isolation);
  assert.equal(await openRunNode(window, nodeId), pending.attempt.sessionId);
  await window.getByTestId("graph-input-owned").waitFor();
  await window.getByRole("option", { name: "Allow", exact: true }).waitFor({ timeout: 30000 });
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  await capture(isolation, window, summary, `z4-${name}-native-permission`);
  return pending;
}
export async function allowTool(window) {
  await approveNativePermissionOnce(window);
  await showGraph(window);
}
export async function readArtifactUi(window, run, artifact) {
  await selectNode(window, artifact.nodeId);
  const button = window.getByTestId(`graph-artifact-open-${artifact.id}`);
  const details = button.locator("xpath=ancestor::details[1]");
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
  await button.click();
  const preview = window.locator(
    `[data-testid="graph-artifact-content"][data-artifact-id="${artifact.id}"]`,
  );
  await preview.waitFor();
  await preview.scrollIntoViewIfNeeded();
  const content = await preview.textContent();
  assert.equal(Buffer.byteLength(content), artifact.bytes);
  assert.equal(createHash("sha256").update(content).digest("hex"), artifact.digest);
  assert.equal(artifact.runId, run.id);
  const owner = [...run.nodeAttempts, ...run.toolAttempts].find(
    (item) => item.nodeId === artifact.nodeId,
  );
  assert.equal(artifact.attemptId, owner.attemptId);
  return content;
}
export async function verifyManifestUi(window, isolation, run, summary) {
  await window.getByTestId("graph-export-manifest").click();
  const field = window.getByTestId("graph-artifact-manifest");
  await field.waitFor();
  const text = await field.inputValue();
  const manifest = JSON.parse(text);
  assert.equal(manifest.runId, run.id);
  assert.equal(manifest.artifacts.length, run.artifacts.length);
  assert.equal(text.includes(isolation.fixture.marker), false);
  for (const artifact of manifest.artifacts) {
    assert.equal(artifact.digest, run.artifacts.find((item) => item.id === artifact.id).digest);
    for (const forbidden of [
      "content",
      "sourcePath",
      "sourceBaseline",
      "sessionId",
      "commandId",
      "args",
      "stdout",
      "stderr",
      "issue",
    ])
      assert.equal(artifact[forbidden], undefined);
  }
  summary.exportedManifest = manifest;
}
export async function waitReadyReceipt(isolation, name = "native-ready.json") {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(path.join(isolation.workspace, "results", name), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await wait(25);
  }
  throw new Error("Actual C# process did not produce its readiness receipt.");
}
export async function finishEvidence(isolation, summary, window, error) {
  summary.status = error ? "FAIL" : "PASS";
  if (error) {
    summary.error = error instanceof Error ? error.stack : String(error);
    summary.body = await window
      ?.locator("body")
      .innerText()
      .catch(() => "Unavailable");
    if (window) await capture(isolation, window, summary, "z4-failure").catch(() => {});
    process.exitCode = 1;
  }
  summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  summary.nativeToolResults = isolation.fixture.toolResults;
  summary.providerErrors = isolation.fixture.errors;
  summary.modelRequests = modelCount(isolation);
  summary.marker = isolation.fixture.marker;
  await writeFile(path.join(isolation.home, "z4-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
