import assert from "node:assert/strict";
import { watch } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { QUESTION_OPTION } from "./pre-z8-u1-responses.mjs";
import { AFTER_SOURCE } from "./z3-fixture.mjs";
import { waitRun } from "./z5-native-observe.mjs";
import {
  assertU3FixturePreserved,
  captureU3,
  ledger,
  modelCount,
  readGraphRecord,
  showGraph,
  u3Wait,
} from "./pre-z8-u3-common.mjs";
import {
  U4_COMPANION_INPUT,
  U4_COMPANION_OPTION,
  U4_COMPANION_OUTPUT,
  U4_COMPANION_TOOL,
} from "./pre-z8-u4-provider.mjs";
import { assertU4Cancellation } from "./pre-z8-u4-proof.mjs";
import { assertU4Summary, captureU4Summary, openU4Native, selectU4Run } from "./pre-z8-u4-ui.mjs";

export async function startU4Companion(isolation, window, summary) {
  await window.getByTestId("task-new-button").click();
  await window.getByTestId("v4-composer-input").fill(U4_COMPANION_INPUT);
  await window.getByTestId("v4-composer-send").click();
  await window
    .getByRole("option", { name: new RegExp(U4_COMPANION_OPTION) })
    .waitFor({ timeout: 45000 });
  const panes = window.locator('[data-testid^="v4-session-pane"]:visible');
  assert.equal(await panes.count(), 1);
  const sessionId = await panes.getAttribute("data-session-id");
  const inputs = await u3Wait(
    () => ledger(isolation),
    (rows) => rows.length === 1,
    "one ordinary companion input",
  );
  const input = inputs[0];
  assert.equal(input.session_id, sessionId);
  assert.equal(input.payload.text, U4_COMPANION_INPUT);
  assert.equal(
    isolation.fixture.toolResults.some((item) => item.id === U4_COMPANION_TOOL),
    false,
  );
  summary.companionBefore = input;
  await captureU3(isolation, window, summary, "pre-z8-u4-companion-waiting-before");
  await showGraph(window);
  return input;
}

export async function driveU4Native(isolation, window, summary, { held = false } = {}) {
  const answered = new Set(),
    deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const run = (await readGraphRecord(isolation)).runs.at(-1);
    if (held && isolation.fixture.holds().length) {
      assert.equal(isolation.fixture.holds().length, 1);
      const implement = run.nodeAttempts.find((item) => item.nodeId === "implement");
      assert.ok(implement?.sessionId && implement.inputId && !implement.terminalProof);
      return run;
    }
    if (!held && run?.status === "WaitingForApproval") return run;
    assert.ok(
      ![
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
      ].includes(run?.status),
      `Unexpected U4 stop: ${JSON.stringify(run)}`,
    );
    const pending = run?.nodeAttempts.find(
      (item) =>
        ["WaitingForPermission", "WaitingForUser"].includes(item.status) &&
        !answered.has(`${item.attemptId}:${item.status}`),
    );
    if (pending) {
      await assertU4Summary(window, summary, run, { evidence: "agent-reported", human: "pending" });
      await captureU4Summary(isolation, window, summary, `pre-z8-u4-${pending.status}-summary`);
      await openU4Native(isolation, window, summary, run, pending);
      await window.getByTestId("graph-input-owned").waitFor();
      if (pending.status === "WaitingForPermission") {
        await window.getByRole("option", { name: "Allow", exact: true }).waitFor();
        await captureU3(isolation, window, summary, "pre-z8-u4-native-edit-permission");
        await approveNativePermissionOnce(window);
      } else {
        const option = window.getByRole("option", { name: new RegExp(QUESTION_OPTION) });
        await option.waitFor();
        await captureU3(isolation, window, summary, "pre-z8-u4-native-question");
        await option.press("Enter");
        await option.waitFor({ state: "hidden" });
      }
      answered.add(`${pending.attemptId}:${pending.status}`);
      await showGraph(window);
    }
    await delay(50);
  }
  throw new Error("U4 native boundary was not reached.");
}

async function observeCancellation(isolation, runId) {
  const file = acceptancePaths(isolation).record,
    records = [],
    readErrors = [];
  let queued = Promise.resolve();
  const read = () => {
    queued = queued.then(async () => {
      try {
        const run = (await readGraphRecord(isolation)).runs.find((item) => item.id === runId);
        const record = {
          status: run.status,
          cancelRequestedAt: run.cancelRequestedAt,
          updatedAt: run.updatedAt,
          attempts: run.nodeAttempts.map((item) => ({
            nodeId: item.nodeId,
            attemptId: item.attemptId,
            status: item.status,
            terminalProof: item.terminalProof,
          })),
        };
        if (JSON.stringify(records.at(-1)?.record) !== JSON.stringify(record))
          records.push({ observedAt: Date.now(), record });
      } catch (error) {
        readErrors.push({ at: Date.now(), code: error.code, message: String(error) });
      }
    });
  };
  const watcher = watch(path.dirname(file), (_event, name) => {
    if (!name || String(name) === path.basename(file)) read();
  });
  read();
  await queued;
  return {
    async close() {
      watcher.close();
      read();
      await queued;
      return { records, readErrors };
    },
  };
}

export async function cancelU4AfterEdit(isolation, window, summary, run, companion, originalTest) {
  const owned = run.nodeAttempts.find((item) => item.nodeId === "implement");
  await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
  assert.equal(owned.terminalProof, undefined);
  summary.postEditHold = {
    attempt: owned,
    provider: isolation.fixture.holds(),
    observedSource: await isolation.readFixture(),
  };
  await assertU4Summary(window, summary, run, { evidence: "agent-reported", human: "pending" });
  await captureU4Summary(isolation, window, summary, "pre-z8-u4-running-after-edit");
  const observation = await observeCancellation(isolation, run.id);
  const states = [];
  let polling = true;
  const poll = (async () => {
    while (polling) {
      const state = await window.getByTestId("graph-run-execution").getAttribute("data-state");
      if (states.at(-1)?.state !== state) states.push({ state, observedAt: Date.now() });
      await delay(20);
    }
  })();
  let cancelled;
  try {
    assert.equal(await window.getByTestId("graph-cancel").count(), 1);
    summary.cancelClickedAt = Date.now();
    await window.getByTestId("graph-cancel").click();
    cancelled = await waitRun(
      isolation,
      (value) => value.id === run.id && value.status === "Cancelled",
    );
  } finally {
    polling = false;
    await poll;
    summary.cancellationObservations = await observation.close();
    summary.executionUiStates = states;
    summary.stopRequestedUiObserved = states.some((item) => item.state === "CancelRequested");
  }
  summary.cancellationProof = assertU4Cancellation(
    cancelled,
    owned,
    await ledger(isolation),
    companion,
  );
  assert.ok(cancelled.cancelRequestedAt >= summary.cancelClickedAt);
  assert.equal(
    isolation.fixture.toolResults.some((item) => item.id === U4_COMPANION_TOOL),
    false,
  );
  await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
  const frozen = JSON.stringify(cancelled);
  summary.providerLateRelease = isolation.fixture.releaseHeld();
  assert.equal(summary.providerLateRelease.length, 1);
  assert.equal(
    summary.providerLateRelease[0].delivered,
    summary.providerLateRelease[0].connectionOpenAtRelease,
  );
  await assertU4Summary(window, summary, cancelled, {
    evidence: "agent-reported",
    human: "pending",
  });
  await captureU4Summary(isolation, window, summary, "pre-z8-u4-cancelled-after-edit");
  assert.equal(await window.getByTestId("graph-cancel").count(), 0);
  assert.equal(
    JSON.stringify((await readGraphRecord(isolation)).runs.find((item) => item.id === run.id)),
    frozen,
  );
  summary.assertions.push(
    "The exact native Implement input receives interrupted terminal proof after durable cancel intent; the actual edit remains, no Review or gate is admitted, and late controlled-provider release cannot change the cancelled run.",
  );
  return cancelled;
}

export async function completeU4Companion(
  isolation,
  window,
  summary,
  cancelled,
  companion,
  originalTest,
) {
  const before = JSON.stringify(cancelled);
  const inputsBefore = await ledger(isolation),
    requestsBefore = modelCount(isolation);
  await window.getByTestId(`task-item-${companion.session_id}`).click();
  await window
    .locator(`[data-testid^="v4-session-pane"][data-session-id="${companion.session_id}"]:visible`)
    .waitFor();
  const option = window.getByRole("option", { name: new RegExp(U4_COMPANION_OPTION) });
  await option.waitFor();
  assert.equal(await window.getByTestId("graph-input-owned").count(), 0);
  assert.deepEqual(await ledger(isolation), inputsBefore);
  assert.equal(modelCount(isolation), requestsBefore);
  assert.equal(
    isolation.fixture.toolResults.some((item) => item.id === U4_COMPANION_TOOL),
    false,
  );
  await captureU3(isolation, window, summary, "pre-z8-u4-companion-still-waiting-after-cancel");
  await option.press("Enter");
  await window.getByText(U4_COMPANION_OUTPUT, { exact: false }).waitFor({ timeout: 45000 });
  const inputs = await ledger(isolation);
  assert.equal(inputs.length, 3);
  summary.companionAfter = inputs.find((item) => item.id === companion.id);
  assert.equal(summary.companionAfter.session_id, companion.session_id);
  assert.deepEqual(summary.companionAfter.payload, companion.payload);
  assert.ok(
    isolation.fixture.toolResults
      .find((item) => item.id === U4_COMPANION_TOOL)
      ?.output.includes(U4_COMPANION_OPTION),
  );
  assert.equal(await option.count(), 0);
  await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
  await captureU3(isolation, window, summary, "pre-z8-u4-companion-completed-after-cancel");
  await selectU4Run(window, cancelled.id);
  assert.equal(
    JSON.stringify(
      (await readGraphRecord(isolation)).runs.find((item) => item.id === cancelled.id),
    ),
    before,
  );
  assertU4Cancellation(
    cancelled,
    cancelled.nodeAttempts.find((item) => item.nodeId === "implement"),
    inputs,
    companion,
  );
  assert.equal(
    isolation.fixture.requests.filter((item) => item.native && item.stage === "review").length,
    0,
  );
  assert.deepEqual(isolation.fixture.errors, []);
  summary.assertions.push(
    "The distinct ordinary Chat stays at its original native question during Graph cancellation, then completes only after its explicit answer without another input or any change to the cancelled Graph history or source bytes.",
  );
}
