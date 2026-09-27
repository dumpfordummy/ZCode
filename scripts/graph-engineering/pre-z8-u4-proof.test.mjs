import assert from "node:assert/strict";
import test from "node:test";
import { assertU4Cancellation } from "./pre-z8-u4-proof.mjs";

// Graph assigns inputId === commandId (run-plan.ts:58); native ledger row id is
// queue_<commandId> (command-inbox.ts:75-77). Fixtures use realistic native-shaped
// rows, never ledger.id === attempt.inputId.
const attempt = {
  nodeId: "implement",
  attemptId: "implement-attempt",
  sessionId: "sess_implement",
  commandId: "implement-command-uuid",
  inputId: "implement-command-uuid",
  status: "Running",
};
const companion = {
  id: "queue_companion-command-uuid",
  session_id: "sess_companion",
  payload: {
    text: "Unrelated Chat",
    intent: {
      sourceCommandId: "companion-command-uuid",
      queueItemId: "queue_companion-command-uuid",
    },
  },
};

/** Build a realistic native-shaped ledger row for a Graph attempt. */
function nativeRow({ commandId, sessionId, text = "" }) {
  const queueId = `queue_${commandId}`;
  return {
    id: queueId,
    session_id: sessionId,
    kind: "sendText",
    delivery: "startNow",
    status: "promoted",
    payload: { text, intent: { sourceCommandId: commandId, queueItemId: queueId } },
  };
}

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
        sessionId: "sess_analyze",
        commandId: "analyze-command-uuid",
        inputId: "analyze-command-uuid",
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
  nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
  nativeRow({ commandId: attempt.commandId, sessionId: attempt.sessionId }),
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

test("U4 realistic native ledger row id is queue-prefixed, not equal to Graph inputId", () => {
  const row = nativeRow({ commandId: attempt.commandId, sessionId: attempt.sessionId });
  assert.notEqual(row.id, attempt.inputId);
  assert.equal(row.id, `queue_${attempt.commandId}`);
  assert.equal(row.id, `queue_${attempt.inputId}`);
});

test("U4 proof correlates via exact session and exact source command with realistic native rows", () => {
  const proof = assertU4Cancellation(
    cancelled(),
    attempt,
    [
      companion,
      nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
      nativeRow({ commandId: attempt.commandId, sessionId: attempt.sessionId }),
    ],
    companion,
  );
  assert.equal(proof.nodeId, attempt.nodeId);
  assert.equal(proof.sessionId, attempt.sessionId);
  assert.equal(proof.commandId, attempt.commandId);
});

test("U4 rejects correct source command but wrong session", () => {
  const rows = [
    companion,
    nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
    nativeRow({ commandId: attempt.commandId, sessionId: "wrong-session" }),
  ];
  assert.throws(() => assertU4Cancellation(cancelled(), attempt, rows, companion));
});

test("U4 rejects correct session but wrong source command", () => {
  const rows = [
    companion,
    nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
    nativeRow({ commandId: "wrong-command", sessionId: attempt.sessionId }),
  ];
  assert.throws(() => assertU4Cancellation(cancelled(), attempt, rows, companion));
});

test("U4 rejects queue-row id inconsistent with the confirmed native mapping", () => {
  const rows = [
    companion,
    nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
    {
      ...nativeRow({ commandId: attempt.commandId, sessionId: attempt.sessionId }),
      id: "queue_tampered-id",
    },
  ];
  assert.throws(() => assertU4Cancellation(cancelled(), attempt, rows, companion));
});

test("U4 rejects when no ledger entry matches the admitted attempt", () => {
  // Three rows pass the exact-count check. The third is a legitimate native
  // ledger entry belonging to neither the Analyze nor the Implement
  // session/command, so the Implement attempt reaches the correlation loop and
  // finds zero matching rows (0 !== 1) — not the count check, which carries its
  // own "Only Analyze" message and is satisfied here.
  const rows = [
    companion,
    nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
    nativeRow({ commandId: "unrelated-command-uuid", sessionId: "sess_unrelated" }),
  ];
  let caught;
  try {
    assertU4Cancellation(cancelled(), attempt, rows, companion);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof assert.AssertionError, "expected a correlation failure");
  assert.doesNotMatch(caught.message, /Only Analyze/);
  // Node formats assert.equal(0, 1) as "0 !== 1"; matching both this and the
  // older "+ actual - expected" layout keeps the assertion robust across versions.
  assert.match(caught.message, /(0\s*!==\s*1|actual[\s\S]*\b0\b[\s\S]*expected[\s\S]*\b1\b)/);
});

test("U4 rejects more than one matching ledger entry for the same attempt", () => {
  const analyzeRow = nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" });
  const rows = [companion, analyzeRow, { ...analyzeRow, id: "queue_analyze-duplicate" }];
  assert.throws(() => assertU4Cancellation(cancelled(), attempt, rows, companion));
});

test("U4 rejects missing or malformed payload identity on the matching row", () => {
  for (const malformed of [
    { id: `queue_${attempt.commandId}`, session_id: attempt.sessionId, payload: { text: "x" } },
    {
      id: `queue_${attempt.commandId}`,
      session_id: attempt.sessionId,
      payload: { text: "x", intent: {} },
    },
    {
      id: `queue_${attempt.commandId}`,
      session_id: attempt.sessionId,
      payload: { text: "x", intent: { sourceCommandId: 123 } },
    },
  ]) {
    const rows = [
      companion,
      nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
      malformed,
    ];
    assert.throws(() => assertU4Cancellation(cancelled(), attempt, rows, companion));
  }
});

test("U4 unrelated companion entry with its own queue-row id must not match a Graph attempt", () => {
  const proof = assertU4Cancellation(
    cancelled(),
    attempt,
    [
      companion,
      nativeRow({ commandId: "analyze-command-uuid", sessionId: "sess_analyze" }),
      nativeRow({ commandId: attempt.commandId, sessionId: attempt.sessionId }),
    ],
    companion,
  );
  assert.notEqual(proof.companionSessionId, proof.sessionId);
  assert.notEqual(proof.companionInputId, proof.inputId);
});
