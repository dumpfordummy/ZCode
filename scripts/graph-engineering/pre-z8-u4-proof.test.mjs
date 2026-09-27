import assert from "node:assert/strict";
import test from "node:test";
import { assertU4Cancellation } from "./pre-z8-u4-proof.mjs";

const attempt = {
  nodeId: "implement",
  attemptId: "implement-attempt",
  sessionId: "implement-session",
  commandId: "implement-command",
  inputId: "implement-input",
  status: "Running",
};
const companion = {
  id: "chat-input",
  session_id: "chat-session",
  payload: { text: "Unrelated Chat" },
};
function cancelled() {
  return {
    id: "run",
    status: "Cancelled",
    cancelRequestedAt: 10,
    updatedAt: 12,
    nodeAttempts: [
      {
        nodeId: "analyze",
        status: "Completed",
        sessionId: "analyze-session",
        commandId: "analyze-command",
        inputId: "analyze-input",
      },
      {
        ...attempt,
        status: "Cancelled",
        updatedAt: 12,
        terminalProof: {
          sourceCommandId: attempt.commandId,
          state: "completedInterrupted",
          logEpoch: "native-epoch",
          seq: 7,
        },
      },
    ],
    approvalAttempts: [],
    toolAttempts: [],
  };
}
const inputs = () => [
  companion,
  {
    id: "analyze-input",
    session_id: "analyze-session",
    payload: { intent: { sourceCommandId: "analyze-command" } },
  },
  {
    id: attempt.inputId,
    session_id: attempt.sessionId,
    payload: { intent: { sourceCommandId: attempt.commandId } },
  },
];

test("U4 cancellation proof binds the real cancelled native command and preserves separate Chat", () => {
  const proof = assertU4Cancellation(cancelled(), attempt, inputs(), companion);
  assert.equal(proof.attemptId, attempt.attemptId);
  assert.equal(proof.terminalProof.state, "completedInterrupted");
});

test("U4 rejects cancellation intent without terminal proof, wrong identity and forbidden successor", () => {
  for (const mutate of [
    (run) => {
      delete run.nodeAttempts[1].terminalProof;
    },
    (run) => {
      run.nodeAttempts[1].terminalProof.sourceCommandId = "different-command";
    },
    (run) => {
      run.nodeAttempts[1].terminalProof.state = "completedSuccess";
    },
    (run) => {
      run.nodeAttempts.push({ nodeId: "review", status: "Running", sessionId: "forbidden" });
    },
    (run) => {
      run.approvalAttempts.push({ nodeId: "final-gate", request: { id: "forbidden" } });
    },
    (run) => {
      run.cancelRequestedAt = 13;
    },
    (run) => {
      delete run.cancelRequestedAt;
    },
  ]) {
    const run = cancelled();
    mutate(run);
    assert.throws(() => assertU4Cancellation(run, attempt, inputs(), companion));
  }
});

test("U4 rejects cross-session cancellation, missing companion, extra native admission and changed companion payload", () => {
  for (const mutate of [
    (rows) => {
      rows[2].session_id = companion.session_id;
    },
    (rows) => {
      rows.splice(0, 1);
    },
    (rows) => {
      rows.push({ id: "extra", session_id: "extra-session", payload: {} });
    },
    (rows) => {
      rows[0] = { ...companion, payload: { text: "Replaced input" } };
    },
  ]) {
    const rows = structuredClone(inputs());
    mutate(rows);
    assert.throws(() => assertU4Cancellation(cancelled(), attempt, rows, companion));
  }
});
