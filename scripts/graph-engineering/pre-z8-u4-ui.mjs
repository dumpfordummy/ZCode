import assert from "node:assert/strict";
import {
  captureU3,
  ledger,
  modelCount,
  openU3Details,
  readGraphRecord,
  selectNode,
  showGraph,
  u3Wait,
} from "./pre-z8-u3-common.mjs";

export async function selectU4Run(window, runId) {
  await showGraph(window);
  const row = window.locator(`[data-testid="graph-run"][data-run-id="${runId}"]`);
  await row.waitFor();
  assert.equal(await row.count(), 1);
  if ((await row.getAttribute("aria-current")) !== "true") await row.click();
  await window.locator(`[data-testid="graph-run-summary"][data-run-id="${runId}"]`).waitFor();
}

export async function assertU4Summary(window, summary, run, expected) {
  await selectU4Run(window, run.id);
  for (const [axis, value] of Object.entries({ execution: run.status, ...expected })) {
    await u3Wait(
      () => window.getByTestId(`graph-run-${axis}`).getAttribute("data-state"),
      (state) => state === value,
      `U4 ${axis} axis ${value}`,
    );
  }
  const details = window.getByTestId("graph-run-technical-details");
  await openU3Details(details);
  const snapshot = window.getByTestId("graph-run-summary-snapshot");
  await snapshot.waitFor();
  assert.equal(await snapshot.count(), 1);
  const projection = JSON.parse(await snapshot.textContent());
  assert.equal(projection.runId, run.id);
  assert.deepEqual(projection.target, run.target);
  assert.equal(projection.requestText, run.startInput);
  assert.equal(projection.execution.status, run.status);
  assert.equal(projection.evidence.state, expected.evidence);
  assert.equal(projection.human.state, expected.human);
  assert.equal(
    await window.getByTestId("graph-run-request").locator("p").textContent(),
    run.startInput,
  );
  assert.ok(
    (await window.getByTestId("graph-run-workspace").textContent()).includes(
      run.target.workspacePath,
    ),
  );
  if (!run.toolAttempts?.length) assert.equal(projection.evidence.configuredTestCount, 0);
  if (run.result) assert.deepEqual(projection.result, { kind: "text", text: run.result.text });
  else if (run.resultArtifactId)
    assert.deepEqual(projection.result, { kind: "artifact", artifactId: run.resultArtifactId });
  else assert.deepEqual(projection.result, { kind: "absent" });
  for (const change of projection.sourceChanges) {
    const gate = run.approvalAttempts.find((item) => item.attemptId === change.attemptId);
    assert.equal(change.requestId, gate.request.id);
    assert.equal(change.capturedAt, gate.request.createdAt);
    assert.deepEqual(
      change.snapshot,
      gate.request.evidence.find((item) => item.alias === change.alias).snapshot,
    );
  }
  await details.locator(":scope > summary").click();
  (summary.summaryProofs ??= []).push({ observedAt: Date.now(), ...projection });
  return projection;
}

export async function captureU4Summary(isolation, window, summary, name) {
  for (const [suffix, size] of [
    ["1280", [1280, 720]],
    ["1920", [1920, 1080]],
  ]) {
    await window.getByTestId("graph-run-summary").scrollIntoViewIfNeeded();
    await captureU3(isolation, window, summary, `${name}-${suffix}`, size);
  }
}

export async function openU4Native(isolation, window, summary, run, attempt) {
  await selectU4Run(window, run.id);
  const inputBefore = await ledger(isolation),
    requests = modelCount(isolation);
  const action = window.locator(
    `[data-testid="graph-run-open-native"][data-session-id="${attempt.sessionId}"][data-node-id="${attempt.nodeId}"][data-attempt-id="${attempt.attemptId}"]`,
  );
  assert.equal(
    await action.count(),
    1,
    "The persistent native action must match exactly one owned attempt.",
  );
  await action.click();
  await window
    .locator(`[data-testid^="v4-session-pane"][data-session-id="${attempt.sessionId}"]:visible`)
    .waitFor();
  assert.deepEqual(await ledger(isolation), inputBefore);
  assert.equal(modelCount(isolation), requests);
  (summary.persistentActions ??= []).push({
    kind: "native",
    runId: run.id,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    sessionId: attempt.sessionId,
    inputId: attempt.inputId,
    nativeInputsBefore: inputBefore.length,
    modelRequestsBefore: requests,
  });
}

export async function openU4Gate(isolation, window, summary, run) {
  await assertU4Summary(window, summary, run, { evidence: "agent-reported", human: "pending" });
  const gate = run.approvalAttempts.find((item) => item.nodeId === "final-gate");
  const before = await ledger(isolation),
    requests = modelCount(isolation);
  const action = window.locator(
    `[data-testid="graph-run-review-gate"][data-node-id="${gate.nodeId}"][data-attempt-id="${gate.attemptId}"][data-request-id="${gate.request.id}"]`,
  );
  assert.equal(await action.count(), 1);
  await action.click();
  const request = window.getByTestId("graph-approval-request");
  await request.waitFor();
  assert.equal(await request.getAttribute("data-request-id"), gate.request.id);
  assert.equal(await request.getAttribute("data-request-version"), String(gate.request.version));
  assert.equal(await request.getAttribute("data-digest"), gate.request.digest);
  assert.equal(await window.getByTestId("graph-approval-approve").isDisabled(), true);
  assert.deepEqual(await ledger(isolation), before);
  assert.equal(modelCount(isolation), requests);
  assert.deepEqual(
    (await readGraphRecord(isolation)).runs.find((item) => item.id === run.id),
    run,
  );
  summary.persistentGateAction = {
    runId: run.id,
    requestId: gate.request.id,
    requestVersion: gate.request.version,
    requestDigest: gate.request.digest,
    attemptId: gate.attemptId,
  };
}

export async function captureU4Guided(isolation, window, summary) {
  await window.getByTestId("graph-view-design").click();
  await selectNode(window, "implement");
  await window.getByTestId("graph-editor-guided").click();
  const json = window.getByTestId("graph-prompt-draft-json").locator("xpath=parent::details");
  const candidates = window.getByTestId("graph-context-candidates");
  for (const details of [json, candidates, window.getByTestId("graph-prompt-draft-preview")])
    if ((await details.getAttribute("open")) !== null)
      await details.locator(":scope > summary").click();
  const chip = window.getByTestId(`graph-context-chip-${summary.context.binding.alias}`);
  assert.equal(await chip.count(), 1);
  await chip.scrollIntoViewIfNeeded();
  await captureU3(isolation, window, summary, "pre-z8-u4-guided-controls-1280");
  await captureU3(isolation, window, summary, "pre-z8-u4-guided-controls-1920", [1920, 1080]);
  summary.assertions.push(
    "Readable Guided context controls and draft preview heading are captured with technical JSON collapsed at both supported acceptance sizes.",
  );
}
