import assert from "node:assert/strict";
import test from "node:test";
import {
  sequentialServiceFixture,
  sequenceDefinition,
  selection,
  target,
} from "./sequential.fixture.js";

test("sequential native admission freezes all settings and exact dynamic handoffs; predecessors stay owned", async () => {
  const f = sequentialServiceFixture();
  const definition = sequenceDefinition();
  const verify = definition.nodes.find((n) => n.id === "verify")!;
  if (verify.type === "task")
    verify.configuration = {
      kind: "override",
      modelSelection: { ...selection, modelId: "override" },
      mode: "plan",
      planEnabled: true,
    };
  await f.prepare(definition);
  const run = await f.run();
  assert.equal(run.version, 2);
  assert.equal(f.sends.length, 1);
  const draft = (await f.view()).definition;
  if (draft.version === 2) {
    const v = draft.nodes.find((n) => n.id === "verify")!;
    if (v.type === "task") v.instructions = "Changed later";
    await f.service.saveDefinition({ target, definition: draft, expectedRevision: 1 });
  }
  f.emit(0, "completedSuccess", "fresh-dynamic-marker");
  await f.settle();
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1]!.instructions, "Implement fresh-dynamic-marker");
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: "native-1" }), true);
  await assert.rejects(
    f.service.assertInputAllowed({
      ...target,
      sessionId: "native-1",
      commandId: f.sends[0]!.commandId,
      commandType: "sendText",
    }),
    /owns/,
  );
  f.emit(1, "completedSuccess", "actual edit report");
  await f.settle();
  assert.equal(f.sends.length, 3);
  assert.equal(f.sends[2]!.instructions, "Verify actual edit report");
  assert.equal(f.sends[2]!.modelSelection.modelId, "override");
  assert.equal(f.sends[2]!.mode, "plan");
  f.emit(2, "completedSuccess", "independent test result");
  await f.settle();
  const completed = await f.current();
  assert.equal(completed.status, "Completed");
  assert.equal(completed.result?.text, "independent test result");
  assert.equal(new Set(completed.nodeAttempts.map((a) => a.sessionId)).size, 3);
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: "native-1" }), false);
  const snapshot = structuredClone(completed);
  f.emit(2, "failed", undefined, { seq: 999 });
  await f.settle();
  assert.deepEqual(await f.current(), snapshot);
  const reopened = sequentialServiceFixture(f.saved());
  assert.deepEqual(await reopened.current(), completed);
  assert.equal(reopened.sends.length, 0);
});

test("validation rejects invalid graph or unavailable future configuration before first create", async () => {
  const f = sequentialServiceFixture();
  const g = sequenceDefinition();
  g.edges.pop();
  await f.prepare(g);
  await assert.rejects(f.run(), /path|connection/);
  assert.equal(f.creates.length, 0);
  const next = sequenceDefinition();
  next.revision = 1;
  await f.service.saveDefinition({ target, definition: next, expectedRevision: 1 });
  f.native.validateSelection = async () => {
    throw new Error("Unavailable selection");
  };
  await assert.rejects(
    f.service.run({
      target,
      requestId: "r2",
      revision: 2,
      modelSelection: selection,
      mode: "build",
    }),
    /Unavailable/,
  );
  assert.equal(f.creates.length, 0);
});

test("duplicate submission returns original and contradictory reuse rejects", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  const [a, b] = await Promise.all([f.run(), f.run()]);
  assert.equal(a.id, b.id);
  assert.equal(f.sends.length, 1);
  await assert.rejects(
    f.service.run({
      target,
      requestId: "request",
      revision: 1,
      modelSelection: selection,
      mode: "plan",
    }),
    /reused/,
  );
  assert.equal(f.sends.length, 1);
});

test("missing final output and definitive native failure skip successors without sending", async () => {
  for (const state of ["completedSuccess", "failed"] as const) {
    const f = sequentialServiceFixture();
    await f.prepare();
    await f.run();
    f.emit(0, state);
    await f.settle();
    assert.equal((await f.current()).status, "Failed");
    assert.equal(f.sends.length, 1);
    assert.equal(f.creates.length, 1);
  }
});

test("waiting, stale/foreign facts and cancellation keep successors unsent; late success cannot advance", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  await f.run();
  f.emit(0, "running", undefined, {
    waiting: "permission",
    foregroundExecutionId: "foreground-original",
  });
  await f.settle();
  assert.equal((await f.current()).status, "WaitingForPermission");
  f.emit(0, "completedSuccess", "stale", { logEpoch: "other" });
  await f.settle();
  assert.equal(f.sends.length, 1);
  f.emit(0, "running", undefined, {
    waiting: "userInput",
    foregroundExecutionId: "foreground-original",
  });
  await f.settle();
  assert.equal((await f.current()).status, "WaitingForUser");
  const run = await f.current();
  await f.service.cancel({ target, runId: run.id });
  assert.equal(f.cancellations[0]?.foregroundExecutionId, "foreground-original");
  f.emit(0, "completedSuccess", "late actual result");
  await f.settle();
  const cancelled = await f.current();
  assert.equal(cancelled.status, "Cancelled");
  assert.equal(cancelled.nodeAttempts[0]!.status, "Completed");
  assert.equal(cancelled.nodeAttempts[1]!.status, "Skipped");
  assert.equal(f.sends.length, 1);
});

test("cancel already queued at a predecessor terminal boundary wins before next dispatch", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  const run = await f.run();
  f.emit(0, "completedSuccess", "done");
  await f.service.cancel({ target, runId: run.id });
  await f.settle();
  assert.equal((await f.current()).status, "Cancelled");
  assert.equal(f.sends.length, 1);
  assert.equal(f.cancellations.length, 0);
});

test("restart with successful predecessor and planned successor never continues", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  await f.run();
  const write = f.repository.write;
  let boundary: ReturnType<typeof f.saved> | undefined;
  f.repository.write = async (t, record) => {
    await write(t, record);
    const run = record.runs[0]!;
    if (
      run.version === 2 &&
      run.nodeAttempts[0]!.status === "Completed" &&
      run.nodeAttempts[1]!.status === "Pending"
    )
      boundary = structuredClone(record);
  };
  f.emit(0, "completedSuccess", "marker");
  await f.settle();
  assert.ok(boundary);
  const restarted = sequentialServiceFixture(boundary);
  const run = await restarted.current();
  assert.equal(run.status, "Interrupted");
  assert.equal(run.nodeAttempts[0]!.finalOutput?.text, "marker");
  assert.equal(restarted.creates.length, 0);
  assert.equal(restarted.sends.length, 0);
  const inspected = await restarted.service.inspectRecovery({ target, runId: run.id });
  assert.equal(inspected.recovery?.state, "inactive");
  const released = await restarted.service.releaseInterrupted({
    target,
    runId: run.id,
    reason: "Reviewed boundary; do not resume",
    confirmed: true,
  });
  assert.equal(released.status, "Interrupted");
  assert.ok(released.release);
  assert.equal(restarted.sends.length, 0);
});
