import assert from "node:assert/strict";
import test from "node:test";
import { graphRunResult } from "../src/graph-engineering/graphRunResult.js";
import { graphRunSummary } from "../src/graph-engineering/graphRunSummary.js";
import { summaryRun } from "./graphRunSummary.fixture.js";

function reviewerRun(status: "valid" | "invalid") {
  const run = summaryRun();
  const task = run.definition.nodes.find((node) => node.type === "task")!;
  task.output = {
    kind: "json",
    schema: { type: "object", properties: {}, additionalProperties: false },
  };
  const attempt = run.nodeAttempts[0]!;
  attempt.iterationId = run.routing!.currentIterationId;
  attempt.outputValidation =
    status === "valid"
      ? { status: "valid", issues: [] }
      : { status: "invalid", issues: ["Invalid strict JSON value."] };
  return run;
}

test("invalid reviewer output is classified from the persisted validation, not from machine checks", () => {
  const run = reviewerRun("invalid");
  // 审阅失败后路由停止为 NeedsHuman，且从未派发最终闸门。
  run.status = "NeedsHuman";
  run.approvalAttempts = [];
  const summary = graphRunSummary(run);
  const result = graphRunResult(run, summary);
  assert.equal(result.kind, "reviewer-output-invalid");
  assert.deepEqual(
    result.invalidOutputs.map((item) => [item.nodeId, item.issues]),
    [["task", ["Invalid strict JSON value."]]],
  );
  assert.deepEqual(result.invalidChecks, []);
  assert.equal(result.stillTrue.approvalNotRequested, true);
});

test("a valid reviewer decision is never a failure, whatever the outcome", () => {
  const run = reviewerRun("valid");
  run.nodeAttempts[0]!.finalOutput!.text = JSON.stringify({
    outcome: "needs_changes",
    findings: [],
    evidenceReferences: ["x"],
  });
  const result = graphRunResult(run, graphRunSummary(run));
  assert.equal(result.kind, "none");
  assert.deepEqual(result.invalidOutputs, []);
});

test("a stop without a more specific cause keeps the Host message and reports only captured facts", () => {
  const run = summaryRun();
  run.status = "BudgetExhausted";
  run.message = "Budget exhausted after 24 admissions";
  run.approvalAttempts = [];
  const result = graphRunResult(run, graphRunSummary(run));
  assert.equal(result.kind, "stopped");
  assert.equal(result.message, "Budget exhausted after 24 admissions");
  assert.equal(result.stillTrue.approvalNotRequested, true);
  assert.equal(result.stillTrue.capturedChangeFiles, 0);
});

test("a completed run has no failure block", () => {
  const run = summaryRun();
  assert.equal(graphRunResult(run, graphRunSummary(run)).kind, "none");
});
