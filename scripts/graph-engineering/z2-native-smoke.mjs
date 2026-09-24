import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { startZ2Fixture, Z2_FOLLOWUP_OUTPUT } from "./z2-provider-fixture.mjs";
import { COMPANION_INSTRUCTION, COMPANION_QUESTION_OPTION } from "./provider-fixture.mjs";
import { verifyInterruptedRestart } from "./z2-native-restart.mjs";
import {
  blockMetadataWrites,
  captureNative,
  captureFixtureDiff,
  createSequentialGraph,
  openRunNode,
  readGraphRecord,
  readNativeLedger,
  selectNode,
  showBindingSourceEvidence,
  showVerifyToolEvidence,
  waitForSaved,
  waitForRecord,
  verifyCompletedRun,
  verifyCancellation,
} from "./z2-native-helpers.mjs";

const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "complete";
assert.ok(
  [
    "complete",
    "question",
    "cancel-permission",
    "cancel-question",
    "cancel-progress",
    "restart-interrupted",
    "restart-permission",
    "persistence-recovery",
  ].includes(scenario),
);
const question = ["question", "cancel-question", "restart-interrupted"].includes(scenario);
const cancel = scenario.startsWith("cancel-");
const isolation = await createIsolation({
  fixtureFactory: (workspace) =>
    startZ2Fixture(workspace, {
      question,
      holdStage: scenario === "cancel-progress" ? "implement" : undefined,
    }),
});
const summary = {
  scenario,
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
const pristineTest = await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8");
await writeFile(path.join(isolation.home, "fixture-before.mjs"), await isolation.readFixture());
let window;
let ids;
let restoreMetadata;
const capture = async (name) => {
  const file = path.join(isolation.home, `${name}.png`);
  await captureNative(isolation, window, file);
  summary.screenshots.push(file);
};
const graph = async () => {
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
};
const waitRun = async (status) => {
  await window
    .locator(`[data-testid="graph-run"][data-status="${status}"]`)
    .first()
    .waitFor({ timeout: 45000 });
  return (await readGraphRecord(isolation)).runs.at(-1);
};
try {
  window = await isolation.launch();
  if (cancel) {
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
  summary.stage = "construct actual native graph";
  ids = await createSequentialGraph(window, summary);
  const saved = (await readGraphRecord(isolation)).definition;
  assert.equal(saved.nodes.filter((node) => node.type === "task").length, 3);
  await window.getByRole("button", { name: "Back to chat", exact: true }).click();
  await window.getByTestId("graph-engineering-open").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), saved.name);
  assert.deepEqual((await readGraphRecord(isolation)).definition, saved);
  summary.assertions.push(
    "Design persists across native Chat navigation with the same document and no run",
  );
  await capture("z2-canvas-design");
  assert.equal(
    isolation.fixture.requests.filter((request) => request.native && request.stage !== "companion")
      .length,
    0,
  );
  summary.stage = "run actual native sequence";
  await window.getByTestId("graph-run-button").click();
  await graph();
  if (question) {
    const waiting = await waitRun("WaitingForUser");
    assert.equal(waiting.nodeAttempts.filter((node) => node.sessionId).length, 1);
    assert.equal(
      readNativeLedger(isolation).filter((row) => row.session_id !== summary.companionSessionId)
        .length,
      1,
    );
    assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
    assert.equal(await openRunNode(window, ids[0]), waiting.nodeAttempts[0].sessionId);
    await window.getByTestId("graph-input-owned").waitFor();
    await window.getByRole("option", { name: /Continue Z2 analysis/ }).waitFor();
    assert.equal(await window.locator("[data-elicitation-countdown-seconds]").count(), 0);
    await capture("z2-native-question");
    summary.assertions.push(
      "Actual native AskUserQuestion waits without automatic answer; only the first owned initial input exists and successors remain pending",
    );
    if (scenario === "question")
      await window.getByRole("option", { name: /Continue Z2 analysis/ }).press("Enter");
    await graph();
    if (scenario === "restart-interrupted")
      window = await verifyInterruptedRestart(isolation, summary, waiting);
  }
  if (!["cancel-question", "restart-interrupted"].includes(scenario)) {
    if (scenario === "cancel-progress") {
      await window.waitForFunction(
        () => document.querySelector('[data-testid="graph-run"][data-status="Running"]'),
        null,
        { timeout: 45000 },
      );
      // The held request is an actual outstanding native provider call, not a graph state injection.
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 30000;
        const check = () =>
          isolation.fixture.heldRequests
            ? resolve()
            : Date.now() > deadline
              ? reject(new Error("Native Implement never reached controlled provider"))
              : setTimeout(check, 50);
        check();
      });
    } else {
      const waiting = await waitRun("WaitingForPermission");
      assert.equal(waiting.nodeAttempts[0].status, "Completed");
      assert.equal(waiting.nodeAttempts[2].status, "Pending");
      assert.equal(waiting.nodeAttempts.filter((node) => node.sessionId).length, 2);
      assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
      summary.waitingRun = waiting;
      if (["complete", "question"].includes(scenario)) {
        await window.getByTestId("graph-view-design").click();
        await selectNode(window, ids[2]);
        await window
          .getByTestId("graph-instructions")
          .fill("FUTURE RUN ONLY: do not use this in the admitted run.");
        await window
          .getByTestId("graph-node-configuration")
          .getByTestId("chat-mode-select-trigger")
          .click();
        await window.getByTestId("chat-mode-select-item-edit").click();
        await window.getByTestId("graph-save").click();
        await waitForSaved(window);
        const future = (await readGraphRecord(isolation)).definition.nodes.find(
          (node) => node.id === ids[2],
        );
        assert.equal(future.configuration.mode, "edit");
        assert.equal(waiting.nodeAttempts[2].settings.mode, "build");
        await graph();
        summary.assertions.push(
          "Editing the future Verify instructions and native permission override after admission does not mutate the frozen run settings/template",
        );
      }
      if (scenario === "persistence-recovery") {
        await window.getByTestId("graph-reconcile").click();
        await window.locator('[data-testid="graph-recovery-state"][data-state="active"]').waitFor();
        assert.equal(await window.getByTestId("graph-release").count(), 0);
        summary.assertions.push(
          "Recovery inspection proves the exact owned input remains active; no release action is offered and no successor is admitted",
        );
      }
      await selectNode(window, ids[1]);
      await capture("z2-implement-handoff-inspector");
      // Completed predecessor is still owned while its final text is used downstream.
      assert.equal(await openRunNode(window, ids[0]), waiting.nodeAttempts[0].sessionId);
      await window.getByTestId("graph-input-owned").waitFor();
      await graph();
      assert.equal(await openRunNode(window, ids[1]), waiting.nodeAttempts[1].sessionId);
      await window.getByTestId("graph-input-owned").waitFor();
      await window.getByRole("option", { name: "Allow", exact: true }).waitFor();
      await capture("z2-native-edit-permission");
      summary.assertions.push(
        "Native Edit permission holds Implement; Verify has no session/input, and completed Analyze plus Implement conversations remain owned",
      );
      if (scenario === "persistence-recovery")
        restoreMetadata = await blockMetadataWrites(isolation);
      if (!cancel && scenario !== "restart-permission")
        await window.getByRole("option", { name: "Allow", exact: true }).press("Enter");
      await graph();
      if (scenario === "restart-permission")
        window = await verifyInterruptedRestart(isolation, summary, waiting);
    }
  }
  if (scenario === "persistence-recovery") {
    summary.stage = "injected metadata failure and inactive-only release";
    await window
      .locator(
        '[data-testid="graph-run"][data-status="Unknown"], [data-testid="graph-run"][data-status="Interrupted"]',
      )
      .first()
      .waitFor({ timeout: 45000 });
    await restoreMetadata();
    restoreMetadata = undefined;
    await openRunNode(window, ids[1]);
    await window
      .getByText(isolation.fixture.outputs.implement, { exact: false })
      .waitFor({ timeout: 45000 });
    await graph();
    await window.getByTestId("graph-reconcile").click();
    await window.locator('[data-testid="graph-recovery-state"][data-state="inactive"]').waitFor();
    await window
      .getByTestId("graph-release-reason")
      .fill(
        "Synthetic terminal persistence fault restored; exact original native input is now authoritatively terminal. Abandon remaining sequence without replay.",
      );
    await window.getByTestId("graph-release-confirm").check();
    await window.getByTestId("graph-release").click();
    await window.getByTestId("graph-release-audit").waitFor({ timeout: 20000 });
    const released = (await readGraphRecord(isolation)).runs.at(-1);
    assert.ok(released.release);
    assert.equal(released.release.inspection.state, "inactive");
    assert.ok(["Unknown", "Interrupted"].includes(released.status));
    assert.equal(released.nodeAttempts[2].sessionId, undefined);
    const owned = readNativeLedger(isolation).filter((row) =>
      released.nodeAttempts.some((node) => node.sessionId === row.session_id),
    );
    assert.equal(owned.length, 2);
    assert.ok(
      released.release.inspection.attempts.some((item) => item.proof?.kind === "input-terminal"),
    );
    summary.releasedRun = released;
    summary.assertions.push(
      "An injected isolated metadata write failure stops sequencing; exact original warm terminal evidence permits audited explicit release without changing Unknown outcome or sending Verify",
    );
    await capture("z2-confirmed-inactive-release");
    await window.getByTestId("graph-view-design").click();
    await window.getByTestId("graph-run-button").waitFor();
    assert.equal(await window.getByTestId("graph-run-button").isDisabled(), false);
    assert.equal(readNativeLedger(isolation).length, 2);
    summary.assertions.push(
      "Audited release makes a new explicit Run available but does not itself submit any input",
    );
  }
  if (cancel)
    await verifyCancellation({ window, isolation, summary, scenario, graph, waitRun, capture });
  if (["complete", "question"].includes(scenario)) {
    summary.stage = "complete real tools and inspect exact commands";
    // Native Bash may independently ask permission depending on platform policy.
    const ready = await waitForRecord(isolation, (record) => {
      const run = record.runs.at(-1);
      return run.status === "Completed" || run.nodeAttempts[2].status === "WaitingForPermission";
    });
    const current = ready.runs.at(-1);
    if (current.status === "WaitingForPermission") {
      assert.equal(await openRunNode(window, ids[2]), current.nodeAttempts[2].sessionId);
      await window.getByRole("option", { name: "Allow", exact: true }).press("Enter");
      await graph();
    }
    await waitRun("Completed");
    let ledger = readNativeLedger(isolation);
    const completed = verifyCompletedRun(
      await readGraphRecord(isolation),
      ledger,
      isolation.fixture,
      ids,
    );
    summary.completedRun = completed;
    summary.nativeLedger = ledger;
    summary.providerRequestCounts = Object.fromEntries(
      ["analyze", "implement", "verify"].map((stage) => [
        stage,
        isolation.fixture.requests.filter((request) => request.native && request.stage === stage)
          .length,
      ]),
    );
    assert.match(await isolation.readFixture(), /Z1_AFTER_7391/);
    assert.equal(
      await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8"),
      pristineTest,
    );
    summary.testOutput = (
      await promisify(execFile)(process.execPath, ["--test", "fixture.test.mjs"], {
        cwd: isolation.workspace,
        env: isolation.env,
      })
    ).stdout;
    summary.nativeToolResults = isolation.fixture.toolResults;
    summary.fixtureDiff = await captureFixtureDiff(isolation);
    assert.equal(summary.nativeToolResults.length, question ? 7 : 6);
    summary.assertions.push(
      "Three distinct native sessions and initial inputs run sequential Read/Read, Read/Edit, Read/Bash; exact fresh output reaches durable downstream input; actual fixture changes and independent unchanged test passes",
    );
    await selectNode(window, ids[1]);
    await capture("z2-completed-handoff");
    await window.getByTestId("graph-frozen-bindings").locator("summary").click();
    await window
      .getByRole("heading", { name: "Resolved submitted instructions", exact: true })
      .scrollIntoViewIfNeeded();
    await capture("z2-resolved-handoff-evidence");
    await showBindingSourceEvidence(window);
    await capture("z2-binding-source-identities");
    for (const node of completed.nodeAttempts) {
      assert.equal(await openRunNode(window, node.nodeId), node.sessionId);
      assert.equal(await window.getByTestId("graph-input-owned").count(), 0);
      assert.match(
        await window.locator('[data-testid="chat-mode-select-trigger"]:visible').innerText(),
        /Ask before changes/,
      );
      await capture(`z2-conversation-${node.nodeId}`);
      if (node.nodeId === ids[2]) {
        await showVerifyToolEvidence(window);
        await capture("z2-native-verify-test-result");
      }
      await graph();
    }
    assert.deepEqual(readNativeLedger(isolation), ledger);
    summary.assertions.push(
      "Open conversation selects each actual stored SessionPane ID; navigation creates no native input and terminal completion releases composer ownership",
    );
    await openRunNode(window, ids[0]);
    await window
      .getByTestId("v4-composer-input")
      .fill(
        "Z2_FOLLOWUP: Reply once without tools. This ordinary follow-up must not change the previously frozen graph output.",
      );
    await window.getByTestId("v4-composer-send").click();
    await window.getByText(Z2_FOLLOWUP_OUTPUT, { exact: false }).waitFor({ timeout: 45000 });
    await graph();
    assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), completed);
    const followupLedger = readNativeLedger(isolation);
    assert.equal(followupLedger.length, ledger.length + 1);
    summary.followupInput = followupLedger.find(
      (row) => !ledger.some((initial) => initial.id === row.id),
    );
    assert.equal(summary.followupInput.session_id, completed.nodeAttempts[0].sessionId);
    ledger = followupLedger;
    summary.assertions.push(
      "An explicit later ordinary Chat input in the completed Analyze session is usable and does not replace that run's exact frozen final text",
    );
    await isolation.stopApp();
    const modelRequests = isolation.fixture.requests.filter((request) => request.model).length;
    window = await isolation.launch();
    await graph();
    await waitRun("Completed");
    assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), completed);
    assert.deepEqual(readNativeLedger(isolation), ledger);
    assert.equal(
      isolation.fixture.requests.filter((request) => request.model).length,
      modelRequests,
    );
    summary.assertions.push(
      "Actual app restart preserves every frozen output/session/input and dispatches zero new inputs/provider requests",
    );
    await capture("z2-completed-reopened");
  }
  assert.deepEqual(isolation.fixture.errors, []);
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error instanceof Error ? error.stack : String(error);
  if (window) {
    summary.body = await window
      .locator("body")
      .innerText()
      .catch(() => "Unavailable");
    await capture("z2-failure").catch((error) => {
      summary.screenshotError = String(error);
    });
  }
  process.exitCode = 1;
} finally {
  await restoreMetadata?.();
  summary.marker = isolation.fixture.marker;
  summary.providerErrors = isolation.fixture.errors;
  summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  await writeFile(path.join(isolation.home, "z2-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
