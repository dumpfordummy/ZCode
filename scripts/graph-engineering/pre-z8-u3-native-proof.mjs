import assert from "node:assert/strict";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { decide } from "./z3-native-helpers.mjs";
import { assertSourceEvidence } from "./z3-fixture.mjs";
import { assertNativeIdentity } from "./z5-native-proof.mjs";
import { nativeSessions, openNativeAttempt, selectAttempt, waitRun } from "./z5-native-observe.mjs";
import { QUESTION_OPTION } from "./pre-z8-u1-responses.mjs";
import { U3_BRACES, U3_LATER_INPUT, U3_LATER_OUTPUT } from "./pre-z8-u3-provider.mjs";
import { U3_INSTRUCTIONS, U3_REQUEST, u3Sha256 } from "./pre-z8-u3-fixture.mjs";
import {
  captureU3,
  ledger,
  modelCount,
  openU3Details,
  readGraphRecord,
  showGraph,
  u3Wait,
} from "./pre-z8-u3-common.mjs";

export async function driveU3ToGate(isolation, window, summary) {
  const answered = new Set();
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const run = (await readGraphRecord(isolation)).runs.at(-1);
    if (run?.status === "WaitingForApproval") return run;
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
      `Unexpected U3 native stop: ${JSON.stringify(run)}`,
    );
    const pending = run?.nodeAttempts.find(
      (attempt) =>
        ["WaitingForPermission", "WaitingForUser"].includes(attempt.status) &&
        !answered.has(`${attempt.attemptId}:${attempt.status}`),
    );
    if (pending) {
      const before = await ledger(isolation),
        requests = modelCount(isolation);
      await openNativeAttempt(isolation, window, summary, pending);
      assert.deepEqual(await ledger(isolation), before);
      assert.equal(modelCount(isolation), requests);
      assert.equal(await window.getByTestId("graph-input-owned").isVisible(), true);
      if (pending.status === "WaitingForPermission") {
        await window.getByRole("option", { name: "Allow", exact: true }).waitFor();
        await captureU3(isolation, window, summary, "pre-z8-u3-native-edit-permission");
        await approveNativePermissionOnce(window);
      } else {
        const option = window.getByRole("option", { name: new RegExp(QUESTION_OPTION) });
        await option.waitFor();
        await captureU3(isolation, window, summary, "pre-z8-u3-native-question");
        await option.press("Enter");
        await option.waitFor({ state: "hidden" });
      }
      (summary.nativeInteractions ??= []).push({
        attemptId: pending.attemptId,
        sessionId: pending.sessionId,
        inputId: pending.inputId,
        status: pending.status,
        inputsBefore: before.length,
      });
      answered.add(`${pending.attemptId}:${pending.status}`);
      await showGraph(window);
    }
    await delay(75);
  }
  throw new Error("U3 native final approval boundary was not reached.");
}

export async function assertU3CapturedPrompts(isolation, summary, run) {
  const inputs = await ledger(isolation);
  const identity = assertNativeIdentity(run, inputs);
  assert.equal(inputs.length, 3);
  assert.equal(identity.agents.length, 3);
  assert.equal(identity.tools.length, 0);
  assert.equal(nativeSessions(isolation, run).length, 3);
  assert.equal(run.definition.template.parameters.request, U3_REQUEST);
  assert.equal(run.definition.template.bindings.referencePolicy, "native-aware-v1");
  const reference = run.provenance.references.find((item) => item.id === "instructions");
  assert.equal(reference.delivery, "native-instructions");
  assert.equal(reference.digest, u3Sha256(U3_INSTRUCTIONS));
  for (const attempt of run.nodeAttempts) {
    assert.equal(attempt.finalOutput.text, isolation.fixture.outputs[attempt.nodeId]);
    assert.equal(attempt.terminalProof.state, "completedSuccess");
    for (const binding of attempt.bindings) {
      const expected =
        binding.source.kind === "start"
          ? run.startInput
          : run.nodeAttempts.find((earlier) => earlier.nodeId === binding.source.nodeId)
              ?.finalOutput.text;
      assert.equal(binding.text, expected);
      assert.equal(attempt.resolvedInstructions.split(expected).length - 1, 1);
    }
    assert.ok(
      attempt.resolvedInstructions.includes(
        "References marked native-instructions are already supplied",
      ),
    );
    assert.ok(
      !attempt.resolvedInstructions.includes(
        "Read document/instruction references through native Read.",
      ),
    );
    if (attempt.nodeId !== "analyze") assert.ok(attempt.resolvedInstructions.includes(U3_BRACES));
    const firstRequest = isolation.fixture.requests.find(
      (request) => request.native && request.stage === attempt.nodeId,
    );
    assert.ok(firstRequest, `No actual provider request for ${attempt.nodeId}.`);
    assert.equal(firstRequest.prompt.split(attempt.resolvedInstructions).length - 1, 1);
    const nativeGuidance = JSON.stringify(firstRequest.messages);
    assert.equal(nativeGuidance.split("PRE_Z8_U3_NATIVE_GUIDANCE").length - 1, 1);
    (summary.capturedPrompts ??= []).push({
      nodeId: attempt.nodeId,
      attemptId: attempt.attemptId,
      sessionId: attempt.sessionId,
      inputId: attempt.inputId,
      resolvedInstructions: attempt.resolvedInstructions,
      bindings: attempt.bindings,
      providerRequestAt: firstRequest.at,
      nativeGuidanceOccurrences: 1,
    });
  }
  assert.equal(isolation.fixture.toolCalls.length, 5);
  for (const call of isolation.fixture.toolCalls) {
    assert.ok(["read", "edit", "askuserquestion"].includes(call.function.name.toLowerCase()));
    if (["read", "edit"].includes(call.function.name.toLowerCase())) {
      const args = JSON.parse(call.function.arguments);
      assert.equal(path.resolve(args.file_path), path.join(isolation.workspace, "fixture.mjs"));
    }
  }
  assert.deepEqual(isolation.fixture.errors, []);
  summary.assertions.push(
    "Actual Guided-selected context is captured in three distinct native inputs exactly once; literal braces remain data, and exact native guidance is delivered once without duplicate Read.",
  );
  return inputs;
}

export async function finishU3Graph(isolation, window, summary, run) {
  const gate = run.approvalAttempts.find((attempt) => attempt.nodeId === "final-gate");
  assert.equal(gate.request.complete, true);
  assert.equal(gate.request.commentPolicy, "required");
  assertSourceEvidence(
    gate.request.evidence.find((item) => item.alias === "source"),
    { afterEdit: true, head: summary.fixture.source.head },
  );
  await selectAttempt(window, gate);
  assert.equal(await window.getByTestId("graph-approval-approve").isDisabled(), true);
  await captureU3(isolation, window, summary, "pre-z8-u3-final-gate");
  await decide(
    window,
    "approve",
    "Reviewed the actual isolated marker edit and immutable context handoffs. Configured tests were not included or executed. No commit, publication or broader action is authorized.",
  );
  return waitRun(isolation, (value) => value.id === run.id && value.status === "Completed");
}

async function frozenPromptUi(window, attempt) {
  await selectAttempt(window, attempt);
  const inspector = window.getByTestId("graph-node-inspector");
  const heading = inspector.getByRole("heading", {
    name: "Resolved submitted instructions",
    exact: true,
  });
  assert.equal(
    await heading.locator("..").locator("p").textContent(),
    attempt.resolvedInstructions,
  );
  await openU3Details(window.getByTestId("graph-frozen-bindings"));
  assert.deepEqual(
    JSON.parse(await window.getByTestId("graph-frozen-bindings").locator("pre").textContent()),
    attempt.bindings,
  );
  await heading.scrollIntoViewIfNeeded();
}

export async function verifyU3LaterChat(isolation, window, summary, completed, beforeInputs) {
  const snapshot = JSON.stringify(completed);
  const analyze = completed.nodeAttempts.find((attempt) => attempt.nodeId === "analyze");
  const implement = completed.nodeAttempts.find((attempt) => attempt.nodeId === "implement");
  await frozenPromptUi(window, implement);
  await captureU3(isolation, window, summary, "pre-z8-u3-captured-prompt-before-chat");
  await openNativeAttempt(isolation, window, summary, analyze);
  assert.equal(await window.getByTestId("graph-input-owned").count(), 0);
  await window.getByTestId("v4-composer-input").fill(U3_LATER_INPUT);
  await window.getByTestId("v4-composer-send").click();
  await window.getByText(U3_LATER_OUTPUT, { exact: false }).waitFor({ timeout: 45000 });
  const inputs = await u3Wait(
    () => ledger(isolation),
    (value) => value.length === beforeInputs.length + 1,
    "one later ordinary Chat input",
  );
  const followup = inputs.find((input) => !beforeInputs.some((before) => before.id === input.id));
  assert.equal(followup.session_id, analyze.sessionId);
  assert.equal(followup.payload.text, U3_LATER_INPUT);
  assert.notEqual(followup.payload.intent.sourceCommandId, analyze.commandId);
  summary.laterChatInput = followup;
  await captureU3(isolation, window, summary, "pre-z8-u3-later-native-chat");
  await showGraph(window);
  const reopened = (await readGraphRecord(isolation)).runs.find((run) => run.id === completed.id);
  assert.equal(JSON.stringify(reopened), snapshot);
  await frozenPromptUi(window, implement);
  assert.ok(!implement.resolvedInstructions.includes(U3_LATER_INPUT));
  assert.ok(!implement.resolvedInstructions.includes(U3_LATER_OUTPUT));
  await captureU3(isolation, window, summary, "pre-z8-u3-captured-prompt-after-chat-1280");
  await captureU3(
    isolation,
    window,
    summary,
    "pre-z8-u3-captured-prompt-after-chat-1920",
    [1920, 1080],
  );
  summary.assertions.push(
    "One real later ordinary Chat input/reply uses the original completed Analyze session while the entire captured Graph run, prompt, bindings and predecessor outputs stay byte-equivalent.",
  );
}
