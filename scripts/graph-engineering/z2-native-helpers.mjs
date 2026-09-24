import assert from "node:assert/strict";
import { readFile, mkdir, rename, rmdir, realpath, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { Z2_ANALYZE, Z2_IMPLEMENT, Z2_START, Z2_VERIFY } from "./z2-provider-fixture.mjs";
import {
  COMPANION_COMPLETION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";

export async function readGraphRecord(isolation) {
  return JSON.parse(await readFile(acceptancePaths(isolation).record, "utf8"));
}

export async function captureNative(isolation, window, file) {
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    await nativeWindow.evaluate((browserWindow) => browserWindow.setSize(1600, 1000));
    await window.waitForFunction(() => window.innerWidth >= 1500);
    const fit = window.getByRole("button", { name: /^fit view$/i });
    if (await fit.isVisible()) await fit.click();
    await window.waitForFunction(
      () =>
        !document
          .getAnimations()
          .some(
            (animation) =>
              animation.playState === "running" &&
              Number.isFinite(animation.effect?.getComputedTiming().endTime),
          ),
    );
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const encoded = await nativeWindow.evaluate(async (browserWindow) =>
      (await browserWindow.capturePage()).toPNG().toString("base64"),
    );
    await writeFile(file, Buffer.from(encoded, "base64"));
  } finally {
    await nativeWindow.dispose();
  }
}

export async function showVerifyToolEvidence(window) {
  const history = window.locator('[data-testid^="chat-assistant-history-trigger-"]').first();
  if ((await history.getAttribute("data-history-open")) === "false") await history.click();
  const tool = window.getByTestId("tool-summary-trigger-z2_verify_test");
  await tool.waitFor();
  if ((await tool.getAttribute("aria-expanded")) === "false") await tool.click();
  const output = window.getByTestId("bash-result-output");
  await output.waitFor();
  assert.match(await output.innerText(), /pass 1/);
  await output.scrollIntoViewIfNeeded();
}

export async function showBindingSourceEvidence(window) {
  const bindings = window.getByTestId("graph-frozen-bindings");
  await bindings.scrollIntoViewIfNeeded();
  await bindings.locator("pre").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
}

export async function captureFixtureDiff(isolation) {
  let diff;
  try {
    await promisify(execFile)(
      "git",
      [
        "--no-pager",
        "diff",
        "--no-index",
        "--",
        path.join(isolation.home, "fixture-before.mjs"),
        path.join(isolation.workspace, "fixture.mjs"),
      ],
      { env: isolation.env },
    );
    throw new Error("Expected native fixture edit did not produce a diff.");
  } catch (error) {
    if (error.code !== 1 || typeof error.stdout !== "string") throw error;
    diff = error.stdout;
  }
  await writeFile(path.join(isolation.home, "fixture.diff"), diff);
  await writeFile(path.join(isolation.home, "fixture-after.mjs"), await isolation.readFixture());
  return diff;
}

export async function waitForRecord(isolation, predicate, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let record;
  do {
    record = await readGraphRecord(isolation);
    if (predicate(record)) return record;
    await wait(25);
  } while (Date.now() < deadline);
  throw new Error(
    `Expected persisted Graph state was not reached: ${JSON.stringify(record.runs.at(-1))}`,
  );
}

export async function blockMetadataWrites(isolation) {
  const file = acceptancePaths(isolation).record;
  const resolvedHome = await realpath(isolation.home);
  const resolvedFile = await realpath(file);
  assert.ok(
    resolvedFile.startsWith(`${resolvedHome}${path.sep}`),
    "fault target must stay inside the freshly generated profile",
  );
  const backup = `${file}.z2-fault-backup`;
  await rename(file, backup);
  await mkdir(file);
  let restored = false;
  return async () => {
    if (restored) return;
    // Remove only our empty fault-injection directory; never recursively delete profile data.
    await rmdir(file);
    await rename(backup, file);
    restored = true;
  };
}

/** Inspect only this freshly generated fixture's native durable input ledger. */
export function readNativeLedger(isolation) {
  const db = new DatabaseSync(acceptancePaths(isolation).ledger, {
    readOnly: true,
  });
  try {
    return db
      .prepare(
        "select id, session_id, kind, delivery, payload, status, time_created, time_updated from session_input order by time_created, id",
      )
      .all()
      .map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
  } finally {
    db.close();
  }
}

export async function waitForSaved(window) {
  await window.waitForFunction(() => {
    const name = document.querySelector('[data-testid="graph-name"]');
    const save = document.querySelector('[data-testid="graph-save"]');
    return (
      name &&
      !name.disabled &&
      save?.disabled &&
      [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === "Saved")
    );
  });
}

export async function selectNode(window, id) {
  await window.getByTestId(`graph-select-node-${id}`).click();
}

export async function selectValue(window, testId, value) {
  await window.getByTestId(testId).click();
  await window.locator(`[role="option"][data-value="${value}"]`).click();
}

export async function addBinding(window, alias, source, index) {
  await window.getByTestId("graph-add-binding").click();
  await window.getByTestId(`graph-binding-alias-${index}`).fill(alias);
  await selectValue(window, `graph-binding-source-${index}`, source);
}

export async function createSequentialGraph(window, summary) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-upgrade").click();
  await window.getByTestId("graph-name").fill("Z2 synthetic Analyze / Implement / Verify");
  await selectNode(window, "start");
  await window.getByTestId("graph-start-input").fill(Z2_START);
  await selectNode(window, "task");
  await window.getByTestId("graph-node-name").fill("Analyze");
  await selectValue(window, "graph-instruction-mode", "bound");
  await window.getByTestId("graph-instructions").fill(Z2_ANALYZE);
  await addBinding(window, "request", "start", 0);
  const ids = ["task"];
  const added = {};
  for (const [name, instructions] of [
    ["Verify", Z2_VERIFY],
    ["Implement", Z2_IMPLEMENT],
  ]) {
    const before = new Set(
      await window
        .locator(".react-flow__node")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id"))),
    );
    await window.getByTestId("graph-add-task").click();
    const after = await window
      .locator(".react-flow__node")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
    const id = after.find((candidate) => !before.has(candidate));
    assert.ok(id, "Add action creates an actual canvas node");
    added[name] = id;
    await selectNode(window, id);
    await window.getByTestId("graph-node-name").fill(name);
    await selectValue(window, "graph-instruction-mode", "bound");
    await window.getByTestId("graph-instructions").fill(instructions);
  }
  ids.push(added.Implement, added.Verify);
  await addBinding(window, "request", "start", 0);
  await addBinding(window, "analysis", "node:task", 1);
  await selectNode(window, added.Verify);
  await addBinding(window, "implementation", `node:${added.Implement}`, 0);
  await selectValue(window, "graph-configuration-source", "override");
  await window.getByTestId("graph-add-task").click();
  await window.getByTestId("graph-node-name").fill("Temporary task to remove");
  await window.getByTestId("graph-delete-node").click();
  assert.equal(await window.locator(".react-flow__node").count(), 5);
  // Explicitly connect in the inspector; positions never select execution order.
  for (const [from, to] of [
    ["start", ids[0]],
    [ids[0], ids[1]],
    [ids[1], ids[2]],
    [ids[2], "end"],
  ]) {
    await selectNode(window, from);
    await selectValue(window, `graph-next-node-${from}`, to);
  }
  await selectNode(window, "end");
  await selectValue(window, "graph-end-output", ids[2]);
  await selectNode(window, "start");
  await selectValue(window, "graph-next-node-start", "end");
  await window.getByTestId("graph-readiness-errors").waitFor();
  assert.equal(await window.getByTestId("graph-run-button").isDisabled(), true);
  await selectValue(window, "graph-next-node-start", "task");
  // Deleting text must never invoke React Flow's node deletion behavior.
  await selectNode(window, ids[1]);
  await window.getByTestId("graph-node-name").fill("Implementx");
  await window.getByTestId("graph-node-name").press("End");
  await window.getByTestId("graph-node-name").press("Backspace");
  assert.equal(await window.getByTestId("graph-node-name").inputValue(), "Implement");
  assert.equal(await window.locator(".react-flow__node").count(), 5);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  const canvasTask = window.locator('.react-flow__node[data-id="task"]');
  const previousStyle = await canvasTask.getAttribute("style");
  await canvasTask.focus();
  await canvasTask.press("Enter");
  await window.waitForFunction(() =>
    document.querySelector('.react-flow__node[data-id="task"]')?.classList.contains("selected"),
  );
  await canvasTask.press("ArrowDown");
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  assert.notEqual(await canvasTask.getAttribute("style"), previousStyle);
  await window.getByRole("button", { name: /^fit view$/i }).click();
  summary.assertions.push(
    "Native editor adds/removes/renames tasks, reconnects a three-task path, saves keyboard layout, explicit Start/prior-node bindings, Verify override and End output; text Backspace preserves nodes",
  );
  summary.assertions.push(
    "An actual disconnected editor draft displays actionable readiness errors and disables Run before native session creation",
  );
  summary.nodeIds = ids;
  return ids;
}

export async function openRunNode(window, id) {
  await window.getByTestId("graph-view-runs").click();
  await selectNode(window, id);
  await window.getByTestId("graph-open-conversation").click();
  return window
    .locator('[data-testid^="v4-session-pane"]:visible')
    .first()
    .getAttribute("data-session-id");
}

export function verifyCompletedRun(record, ledger, fixture, ids) {
  const run = record.runs.at(-1);
  assert.equal(run.version, 2);
  assert.equal(run.status, "Completed");
  assert.deepEqual(run.plannedPath, ids);
  assert.notDeepEqual(
    run.definition.nodes.filter((node) => node.type === "task").map((node) => node.id),
    ids,
    "actual native sequence follows edges despite different node array/layout order",
  );
  assert.equal(run.nodeAttempts.length, 3);
  assert.equal(new Set(run.nodeAttempts.map((node) => node.sessionId)).size, 3);
  assert.equal(new Set(run.nodeAttempts.map((node) => node.commandId)).size, 3);
  const matching = ledger.filter((row) =>
    run.nodeAttempts.some((node) => node.sessionId === row.session_id),
  );
  assert.equal(
    matching.length,
    3,
    "one real native initial input per node, regardless of model/tool request count",
  );
  run.nodeAttempts.forEach((node, index) => {
    assert.equal(node.status, "Completed");
    assert.equal(node.inputId, node.commandId);
    assert.equal(node.terminalProof.sourceCommandId, node.commandId);
    assert.equal(node.terminalProof.state, "completedSuccess");
    assert.equal(node.finalOutput.turnId, node.terminalProof.turnId);
    const row = matching.find((item) => item.session_id === node.sessionId);
    assert.equal(row.kind, "sendText");
    assert.equal(row.delivery, "startNow");
    assert.equal(row.payload.intent.sourceCommandId, node.commandId);
    assert.equal(row.payload.text, node.resolvedInstructions);
    if (index > 0)
      assert.ok(
        row.time_created >= run.nodeAttempts[index - 1].updatedAt,
        "successor native admission follows predecessor persisted completion",
      );
  });
  const [analyze, implement, verify] = run.nodeAttempts;
  assert.equal(analyze.finalOutput.text, fixture.outputs.analyze);
  assert.equal(implement.finalOutput.text, fixture.outputs.implement);
  assert.equal(verify.finalOutput.text, fixture.outputs.verify);
  assert.equal(
    implement.bindings.find((binding) => binding.alias === "analysis").text,
    analyze.finalOutput.text,
  );
  assert.equal(
    implement.bindings.find((binding) => binding.alias === "analysis").sourceInputId,
    analyze.inputId,
  );
  assert.equal(
    implement.resolvedInstructions,
    Z2_IMPLEMENT.replace("{{inputs.request}}", Z2_START).replace(
      "{{inputs.analysis}}",
      fixture.outputs.analyze,
    ),
  );
  assert.equal(
    verify.resolvedInstructions,
    Z2_VERIFY.replace("{{inputs.implementation}}", fixture.outputs.implement),
  );
  assert.equal(run.result.text, verify.finalOutput.text);
  assert.ok(
    !Z2_IMPLEMENT.includes(fixture.marker),
    "fresh provider marker was not already present in the template",
  );
  return run;
}

export async function verifyCancellation({
  window,
  isolation,
  summary,
  scenario,
  graph,
  waitRun,
  capture,
}) {
  summary.stage = "exact graph cancellation and unrelated Chat survival";
  const before = (await readGraphRecord(isolation)).runs.at(-1);
  await window.getByTestId("graph-cancel").click();
  const cancelled = await waitRun("Cancelled");
  summary.cancelledRun = cancelled;
  assert.equal(cancelled.id, before.id);
  assert.equal(cancelled.nodeAttempts.at(-1).status, "Skipped");
  assert.equal(
    cancelled.nodeAttempts.filter((node) => node.sessionId).length,
    scenario === "cancel-question" ? 1 : 2,
  );
  assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
  await capture("z2-cancelled");
  await window.getByRole("button", { name: "Back to chat", exact: true }).click();
  await window.getByTestId(`task-item-${summary.companionSessionId}`).click();
  assert.equal(
    await window
      .locator('[data-testid^="v4-session-pane"]:visible')
      .first()
      .getAttribute("data-session-id"),
    summary.companionSessionId,
  );
  const answer = window.getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) });
  await answer.waitFor();
  assert.equal(
    isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID),
    false,
  );
  await answer.press("Enter");
  await window.getByText(COMPANION_COMPLETION, { exact: false }).waitFor({ timeout: 45000 });
  assert.ok(isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID));
  await graph();
  assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), cancelled);
  summary.assertions.push(
    "Exact Graph cancellation skips successors, preserves pristine source and unrelated Chat; its original question completes without rewriting cancelled Graph history",
  );
}
