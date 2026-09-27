// U4 concurrent ordinary Chat helpers — a companion Chat that stays unanswered while a Graph run
// COMPLETES (final gate + terminal proof), proving the completing run's gate/approval/successor
// admission does not cross-talk with the unrelated session. Contrast with pre-z8-u4-cancel.mjs,
// where the companion is isolated against a CANCELLED run.

import assert from "node:assert/strict";
import { QUESTION_OPTION } from "./pre-z8-u1-responses.mjs";
import { AFTER_SOURCE } from "./z3-fixture.mjs";
import {
  assertU3FixturePreserved,
  captureU3,
  ledger,
  modelCount,
  readGraphRecord,
  showGraph,
} from "./pre-z8-u3-common.mjs";
import {
  U4_COMPANION_OPTION,
  U4_COMPANION_OUTPUT_CONCURRENT,
  U4_COMPANION_TOOL,
} from "./pre-z8-u4-provider.mjs";
import { assertU4Summary, captureU4Summary, selectU4Run } from "./pre-z8-u4-ui.mjs";

/**
 * Assert the companion Chat is still at its original waiting question, isolated from the Graph run,
 * at the given phase of the completing run (gate-pending / gate-open / completed). The companion
 * must still have exactly one ledger row (unanswered) and no tool result, and the Graph run must not
 * have added or answered any companion input.
 */
export async function assertU4CompanionWaiting(isolation, window, summary, companion, phase) {
  await showGraph(window);
  const inputs = await ledger(isolation),
    requests = modelCount(isolation);
  const companionRows = inputs.filter((item) => item.session_id === companion.session_id);
  assert.equal(companionRows.length, 1, "exactly one companion input, still unanswered");
  const companionRow = companionRows[0];
  assert.equal(companionRow.id, companion.id);
  assert.equal(companionRow.session_id, companion.session_id);
  assert.deepEqual(companionRow.payload, companion.payload);
  assert.equal(
    isolation.fixture.toolResults.some((item) => item.id === U4_COMPANION_TOOL),
    false,
    "companion must still be unanswered (no tool result)",
  );
  // The companion has made exactly one provider request so far (its AskUserQuestion). A second
  // companion request would mean the Graph run answered it — that is the cross-talk we forbid.
  assert.equal(
    isolation.fixture.requests.filter((item) => item.stage === "companion").length,
    1,
    "exactly one companion provider request (still unanswered)",
  );
  (summary.concurrentCompanionChecks ??= []).push({
    phase,
    companionInputs: companionRows.length,
    toolResultPresent: false,
    modelRequests: requests,
  });
  await captureU3(isolation, window, summary, `pre-z8-u4-concurrent-companion-waiting-${phase}`);
}

/**
 * After the Graph run has completed, answer the still-waiting companion and verify it completes
 * independently: the completed Graph record stays byte-frozen, source bytes are preserved, no
 * review request was admitted for the companion, and no fixture errors occurred. The companion
 * adds no new ledger row (answering its AskUserQuestion resolves the existing input).
 */
export async function completeU4ConcurrentCompanion(
  isolation,
  window,
  summary,
  completed,
  companion,
  originalTest,
) {
  const before = JSON.stringify(completed);
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
  await captureU3(isolation, window, summary, "pre-z8-u4-concurrent-companion-still-waiting");
  // The run is already Completed, so every Graph review request has already been made. Capturing the
  // count now lets us prove answering the companion does not trigger an extra Graph review.
  const graphReviewRequestsBefore = isolation.fixture.requests.filter(
    (item) => item.native && item.stage === "review",
  ).length;
  await option.press("Enter");
  await window.getByText(U4_COMPANION_OUTPUT_CONCURRENT, { exact: false }).waitFor({
    timeout: 45000,
  });
  const inputs = await ledger(isolation);
  // companion (1) + Graph analyze/implement/review (3) = 4; answering the companion resolves its
  // existing input rather than adding a new one.
  assert.equal(inputs.length, 4);
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
  await captureU3(isolation, window, summary, "pre-z8-u4-concurrent-companion-completed");
  await selectU4Run(window, completed.id);
  assert.equal(
    JSON.stringify(
      (await readGraphRecord(isolation)).runs.find((item) => item.id === completed.id),
    ),
    before,
    "completed Graph record must stay byte-frozen across the companion completion",
  );
  assert.equal(
    isolation.fixture.requests.filter((item) => item.native && item.stage === "review").length,
    graphReviewRequestsBefore,
    "answering the companion must not trigger an extra Graph review request",
  );
  assert.deepEqual(isolation.fixture.errors, []);
  summary.assertions.push(
    "The distinct ordinary Chat stays at its original native question while the Graph run completes its final gate and terminal proof, then completes only after its explicit answer without another input or any change to the completed Graph history or source bytes.",
  );
}
