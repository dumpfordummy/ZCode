import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialRun } from "@zcode/services";
import {
  graphHumanKey,
  graphIsEndStep,
  graphRunStage,
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
