import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { openRunNode, selectNode } from "./z2-native-helpers.mjs";
import { nativeSessions, readGraphRecord, showGraph } from "./z5-native-observe.mjs";
import { SDK_VERSION } from "./pre-z8-dotnet-source.mjs";
import { assertU2CapturedRun, assertU2NoModels, assertU2Preserved } from "./pre-z8-u2-proof.mjs";
import { captureNativeCheckpoint, prepareU2Review, selectU2Checks } from "./pre-z8-u2-ui.mjs";

const terminal = new Set([
  "Completed",
  "Failed",
  "Unknown",
  "Interrupted",
  "Cancelled",
  "Rejected",
]);

export async function initializeU2NativeWorkspace(isolation, window, summary) {
  await window.getByTestId("task-new-button").click();
  const composer = window.getByTestId("v4-composer-input");
  await composer.waitFor();
  assert.equal(
    (
      await composer.evaluate((element) =>
        "value" in element ? element.value : element.textContent,
      )
    ).trim(),
    "",
  );
  await window.waitForFunction(
    () =>
      [
        ...document.querySelectorAll('[data-testid^="v4-session-pane"][data-session-id="draft"]'),
      ].some(
        (pane) =>
          pane.getBoundingClientRect().width > 0 &&
          Boolean(pane.getAttribute("data-projection-seq")),
      ),
    undefined,
    { timeout: 45000 },
  );
  await assertU2NoModels(isolation, "public empty native Chat initialization");
  summary.nativeInitialization = {
    publicEntry: "task-new-button",
    promptSubmitted: false,
    syntheticLoopbackProvider: true,
    nativeDraftProjectionObserved: true,
  };
  await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-empty-native-chat");
}

export async function waitU2Run(isolation, runId, predicate, timeout = 150000) {
  const deadline = Date.now() + timeout;
  let run;
  do {
    run = (await readGraphRecord(isolation)).runs.find((entry) => entry.id === runId);
    if (run && predicate(run)) return run;
    if (run && terminal.has(run.status))
      throw new Error(`Unexpected native calibration terminal state: ${JSON.stringify(run)}`);
    await wait(75);
  } while (Date.now() < deadline);
  throw new Error(`Native calibration boundary was not reached: ${JSON.stringify(run)}`);
}

export async function confirmU2Review(isolation, window, baseline, preview) {
  const prior = new Set(baseline.runs.map((run) => run.id));
  await window.getByTestId("graph-check-ack").setChecked(true);
  await window.getByTestId("graph-check-confirm").click();
  await window.getByTestId("graph-check-preview").waitFor({ state: "hidden" });
  await showGraph(window);
  const deadline = Date.now() + 30000;
  do {
    const appended = (await readGraphRecord(isolation)).runs.filter((run) => !prior.has(run.id));
    assert.ok(appended.length <= 1, "One confirmation must admit at most one checks run.");
    if (appended.length) {
      assert.deepEqual(appended[0].definition, preview.definition);
      return appended[0].id;
    }
    await wait(50);
  } while (Date.now() < deadline);
  throw new Error("Confirmed checks run was not persisted.");
}

export async function openU2Permission(isolation, window, summary, runId, nodeId, name) {
  const run = await waitU2Run(
    isolation,
    runId,
    (value) =>
      value.toolAttempts.find((attempt) => attempt.nodeId === nodeId)?.operation?.status ===
      "awaiting_permission",
  );
  const attempt = run.toolAttempts.find((entry) => entry.nodeId === nodeId);
  assert.equal(attempt.operation.processStarted, false);
  assert.equal(attempt.operation.operationId, attempt.operationId);
  assert.equal(attempt.operation.sessionId, attempt.sessionId);
  assert.equal(attempt.operation.recipeId, attempt.recipe.id);
  assert.equal(attempt.dispatchPhase, "accepted");
  assert.equal(
    nativeSessions(isolation, run).some((session) => session.id === attempt.sessionId),
    true,
  );
  await showGraph(window);
  await selectNode(window, nodeId);
  const inspector = window.getByTestId("graph-tool-inspector");
  assert.equal(await inspector.getAttribute("data-operation-id"), attempt.operationId);
  assert.equal(await inspector.getAttribute("data-session-id"), attempt.sessionId);
  assert.equal(await openRunNode(window, nodeId), attempt.sessionId);
  await window.getByTestId("graph-input-owned").waitFor();
  await window.getByRole("option", { name: "Allow", exact: true }).waitFor({ timeout: 30000 });
  await assertU2NoModels(isolation, "opening the existing native checks permission");
  const current = (await readGraphRecord(isolation)).runs.find((entry) => entry.id === runId);
  assert.deepEqual(
    current.toolAttempts.map((entry) => entry.operationId),
    run.toolAttempts.map((entry) => entry.operationId),
  );
  assert.equal(
    current.toolAttempts.find((entry) => entry.nodeId === nodeId).operation.processStarted,
    false,
  );
  await captureNativeCheckpoint(isolation, window, summary, name);
  (summary.permissions ??= []).push({
    runId,
    nodeId,
    attemptId: attempt.attemptId,
    operationId: attempt.operationId,
    sessionId: attempt.sessionId,
    processStartedBeforeAllow: false,
  });
  return attempt;
}

export async function allowU2Permission(window) {
  await approveNativePermissionOnce(window);
  await showGraph(window);
}

export async function runU2Probe(isolation, window, summary, baseline, configuration) {
  await selectU2Checks(window, "dotnet-probe");
  const preview = await prepareU2Review(
    isolation,
    window,
    summary,
    baseline,
    "pre-z8-u2-sdk-probe-review",
  );
  assert.equal(preview.selection.kind, "dotnet-probe");
  assert.equal(preview.recipes.length, 1);
  assert.deepEqual(preview.recipes[0].args, ["--version"]);
  const runId = await confirmU2Review(isolation, window, baseline, preview);
  const nodeId = preview.definition.nodes.find((node) => node.type === "tool").id;
  await openU2Permission(
    isolation,
    window,
    summary,
    runId,
    nodeId,
    "pre-z8-u2-sdk-probe-permission",
  );
  await allowU2Permission(window);
  const run = await waitU2Run(isolation, runId, (value) => value.status === "Completed");
  assertU2CapturedRun(run, preview);
  assert.equal(run.toolAttempts[0].operation.result.stdout.text.trim(), SDK_VERSION);
  assert.equal(run.toolAttempts[0].verification.classification, "command");
  assert.equal(
    run.artifacts.some((artifact) => artifact.type === "test"),
    false,
  );
  assert.equal(nativeSessions(isolation, run).length, 1);
  const record = await assertU2Preserved(isolation, baseline, configuration);
  summary.probe = { runId, preview, version: SDK_VERSION, classification: "command" };
  summary.assertions.push(
    "Metadata availability admitted no work; a separate reviewed and individually permitted native SDK probe returned the pinned version without fabricated Build/Test evidence.",
  );
  await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-sdk-probe-completed");
  await window.getByTestId("graph-view-setup").click();
  return record;
}
