import assert from "node:assert/strict";

/** This checks observed owner facts. It never creates a terminal event or changes a run. */
export function assertU4Cancellation(run, owned, inputs, companion) {
  assert.equal(run.status, "Cancelled");
  assert.ok(Number.isFinite(run.cancelRequestedAt));
  const attempt = run.nodeAttempts.find((item) => item.attemptId === owned.attemptId);
  assert.ok(attempt);
  for (const key of ["nodeId", "attemptId", "commandId", "sessionId", "inputId"])
    assert.equal(attempt[key], owned[key]);
  assert.equal(attempt.status, "Cancelled");
  assert.equal(attempt.terminalProof?.state, "completedInterrupted");
  assert.equal(attempt.terminalProof.sourceCommandId, attempt.commandId);
  assert.ok(attempt.terminalProof.logEpoch);
  assert.ok(Number.isInteger(attempt.terminalProof.seq) && attempt.terminalProof.seq >= 0);
  assert.ok(run.cancelRequestedAt <= attempt.updatedAt);
  assert.ok(run.cancelRequestedAt <= run.updatedAt);
  const admitted = run.nodeAttempts.filter((item) => item.sessionId);
  assert.deepEqual(
    admitted.map((item) => item.nodeId),
    ["analyze", "implement"],
  );
  assert.equal((run.toolAttempts ?? []).length, 0);
  assert.equal(
    (run.approvalAttempts ?? []).some((item) => item.request || item.decision),
    false,
  );
  assert.equal(run.result, undefined);
  assert.equal(
    inputs.length,
    3,
    "Only Analyze, Implement and the independent Chat may be admitted.",
  );
  for (const item of admitted) {
    const matching = inputs.filter((input) => input.id === item.inputId);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].session_id, item.sessionId);
    assert.equal(matching[0].payload.intent.sourceCommandId, item.commandId);
    assert.notEqual(item.sessionId, companion.session_id);
  }
  const preserved = inputs.find((input) => input.id === companion.id);
  assert.ok(preserved);
  assert.equal(preserved.session_id, companion.session_id);
  assert.deepEqual(preserved.payload, companion.payload);
  return {
    runId: run.id,
    cancelRequestedAt: run.cancelRequestedAt,
    nodeId: attempt.nodeId,
    attemptId: attempt.attemptId,
    sessionId: attempt.sessionId,
    inputId: attempt.inputId,
    commandId: attempt.commandId,
    nativeObservedAt: attempt.updatedAt,
    terminalProof: attempt.terminalProof,
    companionInputId: companion.id,
    companionSessionId: companion.session_id,
    nativeInputs: inputs.length,
    forbiddenSuccessors: 0,
  };
}
