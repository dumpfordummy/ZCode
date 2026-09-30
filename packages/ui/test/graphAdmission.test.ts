import assert from "node:assert/strict";
import test from "node:test";
import {
  GraphAdmissionBlockedError,
  assertGraphAdmission,
  graphAdmission,
} from "../src/graph-engineering/graphAdmission.js";

const run = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  status,
  ...extra,
});

test("every unresolved status occupies the workspace, including waits and recovery states", () => {
  for (const status of [
    "Starting",
    "Running",
    "WaitingForPermission",
    "WaitingForUser",
    "WaitingForApproval",
    "AwaitingContinuation",
    "CancelRequested",
    "Unknown",
    "Interrupted",
    "StaleEvidence",
  ])
    assert.deepEqual(
      graphAdmission([run("r", status)]),
      { blocked: true, reason: "run-active", runId: "r" },
      status,
    );
});

test("settled runs and released runs do not occupy the workspace", () => {
  for (const status of [
    "Completed",
    "Failed",
    "Cancelled",
    "Rejected",
    "NeedsHuman",
    "BudgetExhausted",
    "NoProgress",
  ])
    assert.deepEqual(graphAdmission([run("r", status)]), { blocked: false }, status);
  // 已释放的中断运行：现有规则视为已解决
  assert.deepEqual(graphAdmission([run("r", "Interrupted", { release: { at: 1 } })]), {
    blocked: false,
  });
  assert.deepEqual(graphAdmission([]), { blocked: false });
});

test("the occupying run is named so the UI can link to exactly that run", () => {
  const admission = graphAdmission([
    run("old", "Completed"),
    run("waiting", "WaitingForPermission"),
    run("older", "Failed"),
  ]);
  assert.deepEqual(admission, { blocked: true, reason: "run-active", runId: "waiting" });
});

test("a retained lost-ACK request is reconciled, not blocked by the run it already created", () => {
  const runs = [run("mine", "Running", { requestId: "req-1" }), run("done", "Completed")];
  assert.equal(graphAdmission(runs).blocked, true);
  assert.deepEqual(graphAdmission(runs, { reconcilingRequestId: "req-1" }), { blocked: false });
  // 只豁免同一 request id 创建的那个运行；另一个未解决运行仍然阻止
  const two = [...runs, run("other", "WaitingForApproval", { requestId: "req-2" })];
  assert.deepEqual(graphAdmission(two, { reconcilingRequestId: "req-1" }), {
    blocked: true,
    reason: "run-active",
    runId: "other",
  });
  // 没有保留请求时不豁免
  assert.equal(graphAdmission(runs, { reconcilingRequestId: undefined }).blocked, true);
});

test("assertGraphAdmission throws a typed error naming the run, and is silent when open", () => {
  assert.doesNotThrow(() => assertGraphAdmission([run("a", "Completed")]));
  assert.throws(
    () => assertGraphAdmission([run("busy", "WaitingForUser")]),
    (error) =>
      error instanceof GraphAdmissionBlockedError &&
      error.runId === "busy" &&
      /still unresolved/.test(error.message),
  );
});

test("the projection is only read, never modified", () => {
  const runs = [run("a", "Running")];
  const before = structuredClone(runs);
  graphAdmission(runs);
  assert.deepEqual(runs, before);
});
