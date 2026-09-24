import assert from "node:assert/strict";
import {
  COMPANION_COMPLETION,
  COMPANION_INSTRUCTION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";
import {
  capture,
  ledger,
  modelCount,
  readGraphRecord,
  showGraph,
  waitStatus,
} from "./z4-native-helpers.mjs";

export async function startCompanion(window, summary) {
  await window.getByTestId("v4-composer-input").fill(COMPANION_INSTRUCTION);
  await window.getByTestId("v4-composer-send").click();
  await window
    .getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) })
    .waitFor({ timeout: 45000 });
  summary.companionSessionId = await window
    .locator('[data-testid^="v4-session-pane"]:visible')
    .first()
    .getAttribute("data-session-id");
}

export async function finishCompanion(isolation, window, summary) {
  const before = (await readGraphRecord(isolation)).runs.at(-1);
  await window.getByRole("button", { name: "Back to chat", exact: true }).click();
  await window.getByTestId(`task-item-${summary.companionSessionId}`).click();
  assert.equal(
    isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID),
    false,
  );
  const answer = window.getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) });
  await answer.waitFor();
  await answer.press("Enter");
  await window.getByText(COMPANION_COMPLETION, { exact: false }).waitFor({ timeout: 45000 });
  assert.ok(isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID));
  await showGraph(window);
  assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), before);
  summary.assertions.push(
    "Cancelling the exact native recipe preserves an unrelated ordinary Chat's pending question; that original question then completes without changing Graph history.",
  );
}

export async function restartCompleted(isolation, window, summary) {
  const before = (await readGraphRecord(isolation)).runs.at(-1);
  const inputs = await ledger(isolation);
  await isolation.stopApp();
  const requests = modelCount(isolation);
  window = await isolation.launch();
  await showGraph(window);
  const after = await waitStatus(window, isolation, "Completed");
  assert.deepEqual(after, before);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  await capture(isolation, window, summary, "z4-completed-reopened");
  summary.assertions.push(
    "Actual application restart retains the exact completed run, operations, artifact manifests and input ledger with zero replay or model requests.",
  );
  return window;
}
