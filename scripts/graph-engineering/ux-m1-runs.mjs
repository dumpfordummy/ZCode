// Run records for the UX-M1 browser harness.
//
// FIXTURE: these are built from the UI tests' shared `summaryRun()` (documented there as unit-only
// captured records, not native execution evidence) and put into the waiting states the renderer
// derives from, following the patterns in graphRunSummary.test.ts. They are not real native runs.
import { addCheck, failCheck, summaryRun } from "../../packages/ui/test/graphRunSummary.fixture.ts";

function base(id, requestId) {
  const run = summaryRun();
  run.id = id;
  run.requestId = requestId ?? `request-${id}`;
  run.definition.name = "Captured workflow";
  // 已捕获运行的请求：用于证明起草期间捕获内容不变。
  // 批准请求绑定所属运行：换了 id 就同步，否则人工决定会被投影为“记录不完整”。
  for (const gate of run.approvalAttempts ?? []) if (gate.request) gate.request.runId = id;
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
  // 批准请求绑定所属运行：换了 id 就必须同步，否则请求与运行不匹配、不可决定，也不会进入 Needs-you。
  gate.request.runId = run.id;
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

/** Settled runs used to show that stopped/failed states are told apart (same patterns as graphRunResult.test.ts). */
const settled = (run) => {
  run.status = "NeedsHuman";
  run.approvalAttempts = []; // 最终闸门从未派发
  return run;
};
/** A configured Test ran and failed (genuine machine evidence). */
export function failedTestRun(id = "run-failed-test") {
  const run = base(id);
  failCheck(addCheck(run, "check", "test"));
  return settled(run);
}
/** A configured Test whose observation cannot be confirmed (invalid machine evidence, not a failure). */
export function invalidEvidenceRun(id = "run-invalid-evidence") {
  const run = base(id);
  addCheck(run, "check", "test").verification.observationValid = false;
  return settled(run);
}
function reviewer(run, validation) {
  const task = run.definition.nodes.find((node) => node.type === "task");
  task.output = {
    kind: "json",
    schema: { type: "object", properties: {}, additionalProperties: false },
  };
  const attempt = run.nodeAttempts[0];
  attempt.iterationId = run.routing.currentIterationId;
  attempt.outputValidation = validation;
  return run;
}
/** The reviewer's structured output failed validation (malformed), with the raw diagnostic. */
export const malformedReviewerRun = (id = "run-malformed-reviewer") =>
  settled(reviewer(base(id), { status: "invalid", issues: ["Invalid strict JSON value."] }));
/** The reviewer returned a valid decision; `outcome` is the reviewer's verdict, never a failure. */
export function validReviewerRun(outcome = "pass", id = `run-valid-${outcome}`) {
  const run = reviewer(base(id), { status: "valid", issues: [] });
  run.nodeAttempts[0].finalOutput.text = JSON.stringify({
    outcome,
    findings: [],
    evidenceReferences: ["x"],
  });
  return run;
}
