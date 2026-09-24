import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as wait } from "node:timers/promises";
import { captureNative, readGraphRecord, selectNode, selectValue } from "./z2-native-helpers.mjs";
import { ledger, modelCount, showGraph } from "./z3-native-helpers.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { acceptancePaths } from "./acceptance-paths.mjs";

export { ledger, modelCount, readGraphRecord, selectNode, selectValue, showGraph };
export const currentIteration = (run) =>
  run.routing.iterations.find((item) => item.id === run.routing.currentIterationId);
export const attemptFor = (run, iteration, nodeId) =>
  [
    ...run.nodeAttempts,
    ...(run.toolAttempts ?? []),
    ...(run.approvalAttempts ?? []),
    ...run.routing.conditionAttempts,
  ].find((item) => item.attemptId === iteration.attemptIds[nodeId]);

export function nativeSessions(isolation, run) {
  const ids = [
    ...new Set(
      [...(run?.nodeAttempts ?? []), ...(run?.toolAttempts ?? [])].flatMap((item) =>
        item.sessionId ? [item.sessionId] : [],
      ),
    ),
  ];
  if (!ids.length) return [];
  const db = new DatabaseSync(acceptancePaths(isolation).ledger, { readOnly: true });
  try {
    const statement = db.prepare(
      "SELECT id, directory, parent_id, workspace_id FROM session WHERE id = ?",
    );
    return ids.flatMap((id) => {
      const row = statement.get(id);
      return row ? [row] : [];
    });
  } finally {
    db.close();
  }
}

export async function capture(isolation, window, summary, name) {
  const file = path.join(isolation.home, `${name}.png`);
  if (await window.locator('[role="dialog"]:visible').count()) {
    // 确认弹窗会遮挡画布的 Fit 按钮；直接截取真实窗口，避免截图助手误操作背景控件。
    const nativeWindow = await isolation.app.browserWindow(window);
    try {
      const encoded = await nativeWindow.evaluate(async (browserWindow) =>
        (await browserWindow.capturePage()).toPNG().toString("base64"),
      );
      await writeFile(file, Buffer.from(encoded, "base64"));
    } finally {
      await nativeWindow.dispose();
    }
  } else await captureNative(isolation, window, file);
  summary.screenshots.push(file);
}
export async function selectAttempt(window, attempt) {
  await showGraph(window);
  await selectNode(window, attempt.nodeId);
  await selectValue(window, "graph-attempt-select", attempt.attemptId);
  const inspector = window.getByTestId("graph-node-inspector");
  assert.equal(await inspector.getAttribute("data-attempt-id"), attempt.attemptId);
  assert.equal(await inspector.getAttribute("data-iteration-id"), attempt.iterationId);
}
export async function openNativeAttempt(isolation, window, summary, attempt) {
  const before = await ledger(isolation),
    requests = modelCount(isolation);
  await selectAttempt(window, attempt);
  await window.getByTestId("graph-open-conversation").click();
  await window
    .locator(`[data-testid^="v4-session-pane"][data-session-id="${attempt.sessionId}"]:visible`)
    .waitFor();
  assert.deepEqual(await ledger(isolation), before);
  assert.equal(modelCount(isolation), requests);
  (summary.conversations ??= []).push({
    attemptId: attempt.attemptId,
    iterationId: attempt.iterationId,
    sessionId: attempt.sessionId,
    nativeInputCount: before.length,
  });
}
export async function waitRun(isolation, predicate, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let run;
  do {
    run = (await readGraphRecord(isolation)).runs.at(-1);
    if (run && predicate(run)) return run;
    await wait(75);
  } while (Date.now() < deadline);
  throw new Error(`Expected Z5 native state not reached: ${JSON.stringify(run)}`);
}
export async function driveUntil(isolation, window, summary, predicate, timeout = 120000) {
  const handled = new Set(summary.allowedAttempts ?? []);
  const deadline = Date.now() + timeout;
  let run;
  do {
    run = (await readGraphRecord(isolation)).runs.at(-1);
    if (run && predicate(run)) return run;
    if (run) {
      if (
        [
          "Completed",
          "Failed",
          "Unknown",
          "Interrupted",
          "Cancelled",
          "Rejected",
          "NeedsHuman",
          "BudgetExhausted",
          "NoProgress",
          "StaleEvidence",
        ].includes(run.status)
      )
        throw new Error(
          `Unexpected Z5 stop: ${JSON.stringify({ status: run.status, message: run.message, routing: run.routing })}`,
        );
      const pending = [...run.nodeAttempts, ...(run.toolAttempts ?? [])].find(
        (item) => item.status === "WaitingForPermission" && !handled.has(item.attemptId),
      );
      if (pending) {
        await openNativeAttempt(isolation, window, summary, pending);
        await window
          .getByRole("option", { name: "Allow", exact: true })
          .waitFor({ timeout: 30000 });
        await capture(
          isolation,
          window,
          summary,
          `z5-native-permission-${pending.nodeId}-${pending.iteration}`,
        );
        await approveNativePermissionOnce(window);
        handled.add(pending.attemptId);
        summary.allowedAttempts = [...handled];
        await showGraph(window);
      }
    }
    await wait(75);
  } while (Date.now() < deadline);
  throw new Error(`Native Z5 sequence timed out: ${JSON.stringify(run)}`);
}
export async function startRun(isolation, window, summary, ids) {
  const before = await ledger(isolation),
    requests = modelCount(isolation);
  await window.getByTestId("graph-run-button").click();
  const confirmation = window.getByTestId("graph-run-confirmation");
  await confirmation.waitFor();
  const snapshot = JSON.parse(
    await window.getByTestId("graph-confirmation-definition").locator("pre").textContent(),
  );
  assert.equal(snapshot.definition.routing.limits.maxNodeAdmissions, ids.admissions);
  assert.equal(snapshot.definition.routing.limits.deadlineMs, ids.deadline);
  if (snapshot.definition.routing.region)
    assert.equal(snapshot.definition.routing.region.maxRepairIterations, 2);
  assert.deepEqual(await ledger(isolation), before);
  assert.equal(modelCount(isolation), requests);
  summary.confirmedSnapshot = snapshot;
  await capture(isolation, window, summary, "z5-run-confirmation");
  await window.getByTestId("graph-confirm-run").click();
  await showGraph(window);
  const run = await waitRun(isolation, (value) => value.version === 5);
  assert.deepEqual(run.definition, snapshot.definition);
  assert.deepEqual(run.defaults, snapshot.settings);
  return run;
}
export async function readArtifact(window, run, attempt, selector) {
  const ref = run.artifactBindings.find(
    (item) => item.attemptId === attempt.attemptId && item.selector === selector,
  );
  assert.ok(ref, `Exact attempt lacks ${selector} artifact.`);
  const artifact = run.artifacts.find((item) => item.id === ref.artifactId);
  await selectAttempt(window, attempt);
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
  assert.equal(artifact.attemptId, attempt.attemptId);
  assert.equal(artifact.nodeId, attempt.nodeId);
  assert.equal(artifact.runId, run.id);
  return { artifact, content, value: JSON.parse(content) };
}
export async function finishEvidence(isolation, summary, window, error) {
  summary.status = error ? "FAIL" : "PASS";
  if (error) {
    summary.error = error instanceof Error ? error.stack : String(error);
    summary.body = await window
      ?.locator("body")
      .innerText()
      .catch(() => "Unavailable");
    if (window) await capture(isolation, window, summary, "z5-failure").catch(() => {});
    process.exitCode = 1;
  }
  summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  try {
    summary.nativeSessions = nativeSessions(isolation, summary.finalRecord?.runs?.at(-1));
  } catch (cause) {
    summary.status = "FAIL";
    summary.error ??= `Native session ledger inspection failed: ${String(cause)}`;
    process.exitCode = 1;
  }
  summary.nativeToolResults = isolation.fixture.toolResults;
  summary.providerErrors = isolation.fixture.errors;
  summary.modelRequests = modelCount(isolation);
  await writeFile(path.join(isolation.home, "z5-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
