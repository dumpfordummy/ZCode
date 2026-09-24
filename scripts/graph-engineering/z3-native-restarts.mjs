import assert from "node:assert/strict";
import { readGraphRecord, selectNode } from "./z2-native-helpers.mjs";
import {
  capture,
  decide,
  ledger,
  modelCount,
  readCheckpoint,
  showGraph,
  waitGate,
  waitStatus,
} from "./z3-native-helpers.mjs";

export async function restartPending(isolation, window, summary, gateId, before) {
  const inputs = await ledger(isolation);
  await isolation.stopApp();
  const requests = modelCount(isolation);
  window = await isolation.launch();
  await showGraph(window);
  const restored = await waitGate(window, isolation, gateId, "AwaitingContinuation");
  assert.deepEqual(restored.gate.request, before.gate.request);
  assert.deepEqual(restored.gate.decision, before.gate.decision);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  assert.equal(restored.run.nodeAttempts[1].sessionId, undefined);
  await capture(isolation, window, summary, "z3-pending-restarted");
  await window.getByTestId("graph-approval-continue").click();
  const rearmed = await waitGate(window, isolation, gateId);
  assert.deepEqual(rearmed.gate.request, before.gate.request);
  assert.equal(rearmed.gate.decision, undefined);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  summary.assertions.push(
    "Actual app restart preserves the exact pending request/evidence; no model/input activity. Explicit Continue re-arms it without approving or dispatching the successor.",
  );
  return window;
}

export async function restartBoundary(isolation, window, summary, gateId, kind) {
  await decide(window, "approve");
  const checkpoint = await readCheckpoint(isolation);
  assert.equal(checkpoint.kind, kind);
  const before = checkpoint.persisted.runs.at(-1);
  const gate = before.approvalAttempts.find((attempt) => attempt.nodeId === gateId);
  assert.equal(gate.decision.value, "approve");
  assert.ok(gate.successorIntent.id);
  const inputs = await ledger(isolation);
  assert.equal(inputs.length, kind === "planned" ? 1 : 2);
  assert.equal(before.nodeAttempts[1].dispatchPhase, kind === "planned" ? "planned" : "sending");
  assert.equal(before.nodeAttempts[0].terminalProof.state, "completedSuccess");
  summary.boundary = checkpoint;
  summary.boundaryLedger = inputs;
  await isolation.stopApp();
  delete isolation.env.Z3_GRAPH_BOUNDARY_PROFILE;
  delete isolation.env.Z3_GRAPH_BOUNDARY_KIND;
  const requests = modelCount(isolation);
  window = await isolation.launch();
  await showGraph(window);
  const status = kind === "planned" ? "AwaitingContinuation" : "Interrupted";
  const restored = await waitStatus(window, isolation, status);
  await selectNode(window, gateId);
  assert.deepEqual(
    restored.approvalAttempts.find((attempt) => attempt.nodeId === gateId).request,
    gate.request,
  );
  assert.deepEqual(
    restored.approvalAttempts.find((attempt) => attempt.nodeId === gateId).decision,
    gate.decision,
  );
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  await capture(isolation, window, summary, `z3-${kind}-decision-boundary-restarted`);
  if (kind === "planned") {
    await window.getByTestId("graph-approval-continue").click();
    await waitStatus(window, isolation, "WaitingForPermission");
    const current = (await readGraphRecord(isolation)).runs.at(-1);
    assert.equal(current.nodeAttempts[1].dispatchPhase, "accepted");
    assert.equal((await ledger(isolation)).length, inputs.length + 1);
    assert.deepEqual(
      current.approvalAttempts.find((attempt) => attempt.nodeId === gateId).decision,
      gate.decision,
    );
    summary.assertions.push(
      "Crash after durable decision/intent and before actual successor creation preserves the committed decision; reopening dispatches nothing and explicit Continue admits exactly one native input.",
    );
  } else {
    const resume = window.getByTestId("graph-approval-continue");
    assert.ok((await resume.count()) === 0 || (await resume.isDisabled()));
    assert.equal(restored.nodeAttempts[2].sessionId, undefined);
    summary.assertions.push(
      "Crash after actual native admission but before accepted metadata persists retains sending uncertainty; original ledger/input identities remain, Continue is blocked, and zero native replay occurs.",
    );
  }
  return window;
}
