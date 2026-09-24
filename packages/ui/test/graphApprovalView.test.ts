import assert from "node:assert/strict";
import test from "node:test";
import {
  captureGraphDecision,
  graphApprovalActionState,
  graphApprovalKey,
} from "../src/graph-engineering/graphApprovalView.js";
import type { GraphApprovalAttempt, GraphSequentialRun } from "@zcode/services";

const command = {
  target: { workspacePath: "C:/synthetic" },
  runId: "run",
  nodeId: "approval",
  requestId: "request",
  requestVersion: 1,
  requestDigest: "evidence",
};
test("lost approval reply retains exact decision id and comment; changed target/version/choice cannot reuse it", () => {
  const first = captureGraphDecision(undefined, {
    ...command,
    decisionId: "one",
    value: "approve",
    comment: "Reviewed source",
  });
  assert.equal(captureGraphDecision(first, { ...first, decisionId: "two" }), first);
  assert.throws(() => captureGraphDecision(first, { ...first, value: "reject" }), /unconfirmed/);
  assert.throws(() => captureGraphDecision(first, { ...first, requestVersion: 2 }), /unconfirmed/);
  assert.throws(
    () => captureGraphDecision(first, { ...first, comment: "Changed review" }),
    /unconfirmed/,
  );
  assert.notEqual(graphApprovalKey(command), graphApprovalKey({ ...command, nodeId: "other" }));
});
test("restarted pending checkpoint requires Continue before a separate explicit decision", () => {
  const run = { status: "WaitingForApproval" } as GraphSequentialRun;
  const gate = {
    status: "WaitingForApproval",
    request: { complete: true },
  } as GraphApprovalAttempt;
  assert.deepEqual(graphApprovalActionState(run, gate), { decide: true, continue: false });
  const resumed = { ...gate, resumeRequired: true };
  assert.deepEqual(graphApprovalActionState({ ...run, status: "AwaitingContinuation" }, resumed), {
    decide: false,
    continue: true,
  });
  assert.deepEqual(graphApprovalActionState({ ...run, status: "StaleEvidence" }, resumed), {
    decide: false,
    continue: false,
  });
  assert.deepEqual(
    graphApprovalActionState(run, { ...gate, request: { ...gate.request!, complete: false } }),
    { decide: false, continue: false },
  );
  for (const status of ["Cancelled", "Rejected", "Unknown", "Interrupted"] as const)
    assert.deepEqual(graphApprovalActionState({ ...run, status }, gate), {
      decide: false,
      continue: false,
    });
});
