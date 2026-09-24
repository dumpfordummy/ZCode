import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { startZ2Fixture } from "./z2-provider-fixture.mjs";
import {
  COMPANION_COMPLETION,
  COMPANION_INSTRUCTION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";
import {
  openRunNode,
  readGraphRecord,
  selectNode,
  waitForRecord,
  waitForSaved,
} from "./z2-native-helpers.mjs";
import { assertSourceEvidence, prepareSourceFixture } from "./z3-fixture.mjs";
import { createApprovalGraph } from "./z3-native-editor.mjs";
import {
  capture,
  captureGateEvidence,
  captureGateCanvasDetail,
  decide,
  finishEvidence,
  ledger,
  modelCount,
  readCheckpoint,
  showGraph,
  waitGate,
  waitStatus,
} from "./z3-native-helpers.mjs";
import { restartBoundary, restartPending } from "./z3-native-restarts.mjs";
import { finishNativeSequence } from "./z3-native-completion.mjs";

const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "complete";
assert.ok(
  [
    "complete",
    "restart-pending",
    "restart-entry",
    "reject",
    "cancel",
    "stale-source",
    "stale-graph",
    "incomplete-binary",
    "incomplete-oversized",
    "boundary-planned",
    "boundary-accepted",
    "decision-failure",
  ].includes(scenario),
);
const boundaryKind = scenario.startsWith("boundary-")
  ? scenario.slice(9)
  : scenario === "decision-failure"
    ? scenario
    : undefined;
const incomplete = scenario.startsWith("incomplete-");
const companion = ["cancel", "reject"].includes(scenario);
const isolation = await createIsolation({
  fixtureFactory: (workspace) =>
    startZ2Fixture(workspace, {
      question: true,
      holdStage: boundaryKind === "accepted" ? "implement" : undefined,
    }),
});
const summary = {
  scenario,
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window;
let failure;
try {
  summary.sourceFixture = await prepareSourceFixture(
    isolation,
    incomplete ? scenario.slice(11) : "text",
  );
  const pristineTest = await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8");
  await writeFile(path.join(isolation.home, "fixture-before.mjs"), await isolation.readFixture());
  if (boundaryKind) {
    isolation.env.Z3_GRAPH_BOUNDARY_PROFILE = isolation.home;
    isolation.env.Z3_GRAPH_BOUNDARY_KIND = boundaryKind;
  }
  window = await isolation.launch(
    boundaryKind
      ? { bootstrapEntry: path.join(root, "scripts/graph-engineering/z3-boundary-bootstrap.cjs") }
      : undefined,
  );
  if (companion) {
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
  summary.stage = "actual editor and entry approval";
  const ids = await createApprovalGraph(window, summary);
  summary.ids = ids;
  const saved = (await readGraphRecord(isolation)).definition;
  assert.equal(saved.version, 3);
  assert.equal(saved.nodes.filter((node) => node.type === "approval").length, 3);
  await capture(isolation, window, summary, "z3-canvas-design");
  const initialInputs = await ledger(isolation);
  const initialRequests = modelCount(isolation);
  await window.getByTestId("graph-run-button").click();
  await showGraph(window);
  let entry = await waitGate(window, isolation, ids.gates[0]);
  assert.deepEqual(entry.run.plannedPath, ids.route);
  assert.equal(
    entry.run.nodeAttempts.every((node) => !node.sessionId),
    true,
  );
  assert.deepEqual(await ledger(isolation), initialInputs);
  assert.equal(modelCount(isolation), initialRequests);
  if (scenario === "restart-entry") {
    window = await restartPending(isolation, window, summary, ids.gates[0], entry);
    entry = await waitGate(window, isolation, ids.gates[0]);
    assert.equal(
      entry.run.nodeAttempts.every((node) => !node.sessionId),
      true,
    );
  }
  assert.equal(await window.getByTestId("graph-approval-approve").isDisabled(), true);
  await window.getByTestId("graph-approval-comment").fill("Typing review notes is not a decision.");
  assert.equal(
    (await readGraphRecord(isolation)).runs.at(-1).approvalAttempts[0].decision,
    undefined,
  );
  await capture(isolation, window, summary, "z3-entry-waiting");
  const approve = window.getByTestId("graph-approval-approve");
  await approve.focus();
  await window.keyboard.press("Enter");
  await window.keyboard.press("Enter");
  const question = await waitStatus(window, isolation, "WaitingForUser");
  assert.equal(question.nodeAttempts.filter((node) => node.sessionId).length, 1);
  assert.equal((await ledger(isolation)).length, initialInputs.length + 1);
  assert.equal(question.approvalAttempts[0].status, "Approved");
  assert.equal(await openRunNode(window, ids.tasks[0]), question.nodeAttempts[0].sessionId);
  await window.getByTestId("graph-input-owned").waitFor();
  await window.getByRole("option", { name: /Continue Z2 analysis/ }).waitFor();
  assert.equal(await window.locator("[data-elicitation-countdown-seconds]").count(), 0);
  await capture(isolation, window, summary, "z3-native-question-after-approval");
  await window.getByRole("option", { name: /Continue Z2 analysis/ }).press("Enter");
  await showGraph(window);
  summary.assertions.push(
    "Entry gate creates zero native session/input/model activity; comment entry has no effect and repeated keyboard activation records one approval. That approval admits one Analyze input but does not answer its actual native question.",
  );

  summary.stage = "durable intermediate evidence and independent admissions";
  if (incomplete) {
    const record = await waitForRecord(isolation, (value) =>
      Boolean(
        value.runs.at(-1)?.approvalAttempts.find((gate) => gate.nodeId === ids.gates[1])?.request,
      ),
    );
    const run = record.runs.at(-1);
    const gate = run.approvalAttempts.find((attempt) => attempt.nodeId === ids.gates[1]);
    await selectNode(window, ids.gates[1]);
    assert.equal(gate.request.complete, false);
    const source = gate.request.evidence.find((evidence) => evidence.alias === "source");
    assert.equal(source.snapshot.complete, false);
    assert.ok(
      source.snapshot.files.some(
        (file) =>
          file.path ===
            (scenario === "incomplete-binary" ? "review-binary.bin" : "review-large.txt") &&
          file.issue,
      ),
    );
    assert.equal(await window.getByTestId("graph-approval-approve").isDisabled(), true);
    assert.equal((await ledger(isolation)).length, 1);
    assert.equal(run.nodeAttempts[1].sessionId, undefined);
    summary.incompleteRequest = gate.request;
    const unsupported = window.locator(
      `[data-testid="graph-approval-source-file"][data-path="${scenario === "incomplete-binary" ? "review-binary.bin" : "review-large.txt"}"]`,
    );
    await unsupported.locator(":scope > summary").click();
    await unsupported.scrollIntoViewIfNeeded();
    await capture(isolation, window, summary, "z3-incomplete-source-evidence");
    summary.assertions.push(
      "Unsupported binary/oversized evidence keeps its actual path and visible issue, remains incomplete and non-actionable, and admits no successor input.",
    );
  } else {
    let pending = await waitGate(window, isolation, ids.gates[1]);
    const analysis = pending.gate.request.evidence.find(
      (evidence) => evidence.alias === "analysis",
    );
    assert.equal(analysis.text, isolation.fixture.outputs.analyze);
    assert.equal(analysis.sourceSessionId, pending.run.nodeAttempts[0].sessionId);
    assert.equal(analysis.sourceInputId, pending.run.nodeAttempts[0].inputId);
    assert.equal(analysis.sourceCommandId, pending.run.nodeAttempts[0].commandId);
    assertSourceEvidence(
      pending.gate.request.evidence.find((evidence) => evidence.alias === "source"),
      { head: summary.sourceFixture.head },
    );
    const inputs = await ledger(isolation);
    const requests = modelCount(isolation);
    assert.equal(inputs.length, initialInputs.length + 1);
    assert.equal(pending.run.nodeAttempts[1].sessionId, undefined);
    await capture(isolation, window, summary, "z3-intermediate-waiting");
    if (scenario === "stale-source")
      await captureGateCanvasDetail(isolation, window, summary, ids.gates[1]);
    await captureGateEvidence(isolation, window, summary, "analysis", "review-note.txt");
    await window.getByTestId("graph-approval-open-conversation-analysis").click();
    assert.equal(
      await window
        .locator('[data-testid^="v4-session-pane"]:visible')
        .first()
        .getAttribute("data-session-id"),
      analysis.sourceSessionId,
    );
    await window.getByTestId("graph-input-owned").waitFor();
    await showGraph(window);
    await selectNode(window, ids.gates[1]);
    await window
      .getByTestId("graph-approval-comment")
      .fill("An inspected comment cannot authorize execution.");
    assert.deepEqual(await ledger(isolation), inputs);
    assert.equal(modelCount(isolation), requests);
    assert.equal(
      (await readGraphRecord(isolation)).runs.at(-1).approvalAttempts[1].decision,
      undefined,
    );
    summary.pendingRequest = pending.gate.request;
    summary.assertions.push(
      "Intermediate gate freezes the exact fresh upstream text, source identities and untracked source snapshot. Viewing evidence, entering comments and opening its actual upstream Chat create no input/model work; successor has zero admissions.",
    );

    if (scenario === "restart-pending") {
      window = await restartPending(isolation, window, summary, ids.gates[1], pending);
      pending = await waitGate(window, isolation, ids.gates[1]);
    }
    if (scenario.startsWith("stale-")) {
      if (scenario === "stale-source")
        await writeFile(
          path.join(isolation.workspace, "review-note.txt"),
          "Z3 later unrelated editor change; the old approval must be stale.\n",
        );
      else {
        await window.getByTestId("graph-view-design").click();
        await window.getByTestId("graph-name").fill("Changed graph after displayed approval");
        await window.getByTestId("graph-save").click();
        await waitForSaved(window);
        await showGraph(window);
        await selectNode(window, ids.gates[1]);
      }
      await decide(window, "approve");
      const stale = await waitStatus(window, isolation, "StaleEvidence");
      assert.deepEqual(stale.approvalAttempts[1].request, pending.gate.request);
      assert.equal(stale.approvalAttempts[1].decision, undefined);
      assert.deepEqual(await ledger(isolation), inputs);
      assert.equal(stale.nodeAttempts[1].sessionId, undefined);
      await capture(isolation, window, summary, "z3-stale-evidence-refusal");
      summary.assertions.push(
        "A relevant source or saved graph change rejects the displayed old request, preserves its historical evidence snapshot and creates no successor session/input.",
      );
    } else if (companion) {
      if (scenario === "cancel") await window.getByTestId("graph-cancel").click();
      else
        await decide(window, "reject", "Reject this exact synthetic review; no work may follow.");
      const stopped = await waitStatus(
        window,
        isolation,
        scenario === "cancel" ? "Cancelled" : "Rejected",
      );
      assert.deepEqual(await ledger(isolation), inputs);
      assert.equal(stopped.nodeAttempts[1].sessionId, undefined);
      assert.equal(stopped.nodeAttempts[2].sessionId, undefined);
      await capture(isolation, window, summary, "z3-gate-stopped");
      await window.getByRole("button", { name: "Back to chat", exact: true }).click();
      await window.getByTestId(`task-item-${summary.companionSessionId}`).click();
      assert.equal(
        isolation.fixture.toolResults.some((result) => result.id === COMPANION_TOOL_ID),
        false,
      );
      await window
        .getByRole("option", { name: new RegExp(COMPANION_QUESTION_OPTION) })
        .press("Enter");
      await window.getByText(COMPANION_COMPLETION, { exact: false }).waitFor({ timeout: 45000 });
      await showGraph(window);
      assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), stopped);
      summary.assertions.push(
        "Reject/cancel permanently stops the waiting gate without a successor input; unrelated native Chat retains its unanswered question and completes normally without rewriting Graph history.",
      );
    } else if (boundaryKind && boundaryKind !== "decision-failure") {
      window = await restartBoundary(isolation, window, summary, ids.gates[1], boundaryKind);
      if (boundaryKind === "planned")
        window = await finishNativeSequence(isolation, window, summary, ids, pristineTest);
    } else if (boundaryKind === "decision-failure") {
      await decide(window, "approve");
      const checkpoint = await readCheckpoint(isolation);
      assert.equal(checkpoint.persisted.runs.at(-1).approvalAttempts[1].decision, undefined);
      assert.deepEqual(
        checkpoint.persisted.runs.at(-1).approvalAttempts[1].request,
        pending.gate.request,
      );
      assert.deepEqual(await ledger(isolation), inputs);
      const durable = (await readGraphRecord(isolation)).runs.at(-1);
      assert.equal(durable.nodeAttempts[1].sessionId, undefined);
      assert.equal(durable.approvalAttempts[1].decision, undefined);
      assert.equal(modelCount(isolation), requests);
      summary.boundary = checkpoint;
      await capture(isolation, window, summary, "z3-decision-persistence-failure");
      summary.assertions.push(
        "An injected actual decision metadata failure publishes no committed approval and admits no successor native input; the original request snapshot remains on disk.",
      );
    } else {
      await decide(window, "approve");
      window = await finishNativeSequence(isolation, window, summary, ids, pristineTest);
    }
  }
  assert.deepEqual(isolation.fixture.errors, []);
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
