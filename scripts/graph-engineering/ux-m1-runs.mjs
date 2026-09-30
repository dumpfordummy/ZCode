// Run records for the UX-M1 browser harness.
//
// FIXTURE: these are built from the UI tests' shared `summaryRun()` (documented there as unit-only
// captured records, not native execution evidence) and put into the waiting states the renderer
// derives from, following the patterns in graphRunSummary.test.ts. They are not real native runs.
import { summaryRun } from "../../packages/ui/test/graphRunSummary.fixture.ts";

function base(id, requestId) {
  const run = summaryRun();
  run.id = id;
  run.requestId = requestId ?? `request-${id}`;
  run.definition.name = "Captured workflow";
  // 已捕获运行的请求：用于证明起草期间捕获内容不变。
  run.startInput = "Captured request of the current run";
  run.definition.nodes[0].request = "Captured request of the current run";
  run.result = undefined;
  return run;
}

function running(run, status) {
  const attempt = run.nodeAttempts[0];
  attempt.status = status;
  delete attempt.terminalProof;
  delete attempt.finalOutput;
  run.status = status;
  run.routing.cursorNodeId = "task";
  run.approvalAttempts = [];
  return run;
}

/** Step waiting for a native permission (answered in its own conversation, never by Graph). */
export const permissionWaitRun = (id = "run-permission") =>
  running(base(id), "WaitingForPermission");
/** Step waiting for a native question answer. */
export const questionWaitRun = (id = "run-question") => running(base(id), "WaitingForUser");
/** A step is running with nothing pending for the user. */
export const runningRun = (id = "run-running", requestId) =>
  running(base(id, requestId), "Running");

/** The final human gate is pending. */
export function approvalWaitRun(id = "run-approval") {
  const run = base(id);
  const gate = run.approvalAttempts[0];
  gate.status = "WaitingForApproval";
  delete gate.decision;
  run.status = "WaitingForApproval";
  run.routing.cursorNodeId = "gate";
  return run;
}

/** A settled run: completed, gate approved (the summaryRun default). */
export const completedRun = (id = "run-done") => base(id);

/** The same run after it resolves (used to flip an occupying run to settled). */
export function resolved(run) {
  const done = base(run.id, run.requestId);
  done.createdAt = run.createdAt;
  return done;
}
