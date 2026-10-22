import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialRun } from "@zcode/services";
import {
  graphHumanKey,
  graphIsEndStep,
  graphRunStage,
  graphSettledAtEnd,
  graphStatusMismatch,
} from "../src/graph-engineering/graphRunStage.js";
import { graphRunSummary } from "../src/graph-engineering/graphRunSummary.js";
import { addCheck, summaryRun } from "./graphRunSummary.fixture.js";

/** Records are unit-only captured fixtures, not native execution evidence. */
function activeTask(status: GraphSequentialRun["status"]): GraphSequentialRun {
  const run = summaryRun();
  const attempt = run.nodeAttempts[0]!;
  attempt.status = status as never;
  delete attempt.terminalProof;
  delete attempt.finalOutput;
  run.status = status;
  run.routing!.cursorNodeId = "task";
  run.approvalAttempts = [];
  return run;
}

test("a running agent step is named as agent work and a running check as a configured check", () => {
  const task = activeTask("Running");
  assert.deepEqual(graphRunStage(graphRunSummary(task)), {
    kind: "running-task",
    step: "Implement",
  });
  const tool = activeTask("Running");
  const check = addCheck(tool, "check", "build");
  check.status = "Running";
  tool.routing!.cursorNodeId = "check";
  assert.deepEqual(graphRunStage(graphRunSummary(tool)), {
    kind: "running-tool",
    step: "Captured check",
  });
});

test("waiting states are never presented as running work", () => {
  for (const status of [
    "WaitingForPermission",
    "WaitingForUser",
    "WaitingForApproval",
    "AwaitingContinuation",
    "StaleEvidence",
    "Interrupted",
    "Unknown",
    "Completed",
    "NeedsHuman",
  ] as const)
    assert.equal(
      graphRunStage(graphRunSummary(activeTask(status))).kind,
      "none",
      `${status} is not a running stage`,
    );
});

test("an interrupted run with no approval request is undetermined, not an approval defect", () => {
  for (const status of ["Interrupted", "Unknown"] as const) {
    const summary = graphRunSummary(activeTask(status));
    assert.equal(summary.human.state, "unknown", "the state itself is unchanged");
    assert.equal(graphHumanKey(summary), "human.unconfirmed", status);
  }
});

test("a requested, dispatched or stale approval keeps the original wording", () => {
  const pending = summaryRun();
  pending.status = "Interrupted";
  pending.approvalAttempts![0]!.status = "WaitingForApproval";
  delete pending.approvalAttempts![0]!.decision;
  assert.equal(
    graphHumanKey(graphRunSummary(pending)),
    "human.unknown",
    "a real request exists: the record is what is unresolved",
  );
  const stale = summaryRun();
  stale.status = stale.approvalAttempts![0]!.status = "StaleEvidence";
  delete stale.approvalAttempts![0]!.decision;
  assert.equal(graphHumanKey(graphRunSummary(stale)), "human.unknown");
});

test("every other human state maps to its own label unchanged", () => {
  const approved = summaryRun();
  assert.equal(graphHumanKey(graphRunSummary(approved)), "human.approved");
  const stopped = summaryRun();
  stopped.status = "NeedsHuman";
  stopped.approvalAttempts = [];
  assert.equal(graphHumanKey(graphRunSummary(stopped)), "human.not-requested");
  const waiting = activeTask("Running");
  assert.equal(graphHumanKey(graphRunSummary(waiting)), "human.not-reached");
});

test("only the End node counts as a terminal step", () => {
  const settled = summaryRun();
  settled.routing!.cursorNodeId = "end";
  assert.equal(graphIsEndStep(graphRunSummary(settled)), true);
  assert.equal(graphIsEndStep(graphRunSummary(activeTask("Running"))), false);
});

/** UX-P2-F1: a run record whose own status and its current attempt's status disagree. */
function disagreeing(
  run: GraphSequentialRun["status"],
  attempt: string,
  { session = true }: { session?: boolean } = {},
): GraphSequentialRun {
  const record = activeTask("Running");
  record.status = run;
  record.nodeAttempts[0]!.status = attempt as never;
  if (!session) delete record.nodeAttempts[0]!.sessionId;
  return record;
}

test("a Running run whose attempt is waiting or unconfirmed fails closed, by class", () => {
  const expected = {
    WaitingForPermission: "permission",
    WaitingForUser: "question",
    Unknown: "unconfirmed",
    Interrupted: "unconfirmed",
    CancelRequested: "unconfirmed",
  } as const;
  for (const run of ["Running", "Starting"] as const)
    for (const [attempt, kind] of Object.entries(expected)) {
      const summary = graphRunSummary(disagreeing(run, attempt));
      assert.deepEqual(
        graphStatusMismatch(summary),
        { kind, step: "Implement", status: attempt },
        `${run} / ${attempt}`,
      );
      assert.equal(graphRunStage(summary).kind, "none", `${run} / ${attempt} is not 'running'`);
    }
});

test("an agreeing attempt is never reported as a disagreement and keeps the running stage", () => {
  for (const attempt of ["Pending", "Starting", "Running", "Completed"]) {
    const summary = graphRunSummary(disagreeing("Running", attempt));
    assert.equal(graphStatusMismatch(summary), undefined, attempt);
  }
  const running = graphRunSummary(activeTask("Running"));
  assert.equal(graphRunStage(running).kind, "running-task");
});

test("the disagreement is judged only for a run that says it is starting or running", () => {
  // These run statuses already say something other than 'nothing is needed'; nothing is rewritten.
  for (const run of [
    "WaitingForUser",
    "WaitingForPermission",
    "Interrupted",
    "Unknown",
    "CancelRequested",
    "NeedsHuman",
    "Completed",
    "Failed",
  ] as const)
    assert.equal(
      graphStatusMismatch(graphRunSummary(disagreeing(run, "WaitingForUser"))),
      undefined,
      run,
    );
});

test("a disagreement is found from the current step even without an owned session id", () => {
  const summary = graphRunSummary(disagreeing("Running", "WaitingForUser", { session: false }));
  assert.equal(summary.actionableSessions.length, 0);
  assert.equal(graphStatusMismatch(summary)?.kind, "question");
  assert.equal(graphRunStage(summary).kind, "none");
});

test("permission outranks a question, which outranks an unconfirmed status", () => {
  const record = disagreeing("Running", "Unknown");
  const check = addCheck(record, "check", "build");
  check.status = "WaitingForUser";
  record.routing!.cursorNodeId = "check";
  assert.equal(graphStatusMismatch(graphRunSummary(record))?.kind, "question");
  check.status = "WaitingForPermission";
  assert.equal(graphStatusMismatch(graphRunSummary(record))?.kind, "permission");
});

test("looking at a disagreement changes neither the record nor the summary's own facts", () => {
  const record = disagreeing("Running", "WaitingForUser");
  const before = JSON.stringify(record);
  const summary = graphRunSummary(record);
  graphStatusMismatch(summary);
  graphRunStage(summary);
  assert.equal(JSON.stringify(record), before);
  assert.equal(summary.execution.status, "Running", "the run-level status is reported as recorded");
  assert.equal(summary.human.state, "not-reached", "no approval is invented");
});

const everyStatus = [
  "NeedsHuman",
  "BudgetExhausted",
  "NoProgress",
  "Starting",
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
  "WaitingForApproval",
  "AwaitingContinuation",
  "StaleEvidence",
  "Rejected",
  "CancelRequested",
  "Completed",
  "Failed",
  "Cancelled",
  "Interrupted",
  "Unknown",
] as const;

test("the End cursor is settled only for a Completed run, in every status", () => {
  for (const status of everyStatus) {
    const run = summaryRun();
    run.routing!.cursorNodeId = "end";
    run.status = status;
    const summary = graphRunSummary(run);
    assert.equal(graphIsEndStep(summary), true, `${status}: the cursor is on End`);
    assert.equal(graphSettledAtEnd(summary), status === "Completed", status);
  }
});

test("a Completed run whose cursor is not End is not settled at End", () => {
  const run = summaryRun();
  run.routing!.cursorNodeId = "task";
  run.status = "Completed";
  assert.equal(graphSettledAtEnd(graphRunSummary(run)), false);
});
