import assert from "node:assert/strict";
import test from "node:test";
import { sequentialServiceFixture, target } from "./sequential.fixture.js";

test("transient accepted-write failure closes sequencing before an already queued terminal fact", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  const write = f.repository.write;
  let failed = false;
  f.repository.write = async (t, record) => {
    const run = record.runs[0];
    if (!failed && run?.version === 2 && run.nodeAttempts[0]!.dispatchPhase === "accepted") {
      failed = true;
      throw new Error("single accepted write failure");
    }
    await write(t, record);
  };
  const send = f.native.send;
  f.native.send = async (execution) => {
    const result = await send(execution);
    f.emit(0, "completedSuccess", "already queued terminal");
    return result;
  };
  await assert.rejects(f.run(), /accepted write failure/);
  await f.settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.creates.length, 1);
  assert.equal((await f.current()).status, "Interrupted");
  assert.equal((await f.current()).nodeAttempts[1]!.status, "Pending");
});

test("first persistence failure has no cached reservation; creating intent failure has no calls", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  const write = f.repository.write;
  f.repository.write = async () => {
    throw new Error("initial disk failure");
  };
  await assert.rejects(f.run(), /disk failure/);
  assert.equal(f.creates.length, 0);
  assert.equal((await f.view()).runs.length, 0);
  f.repository.write = async (t, record) => {
    const run = record.runs[0];
    if (run?.version === 2 && run.nodeAttempts[0]!.dispatchPhase === "creating")
      throw new Error("intent disk failure");
    await write(t, record);
  };
  await assert.rejects(f.run(), /intent disk failure/);
  assert.equal(f.sends.length, 0);
  assert.equal(f.creates.length, 0);
  assert.equal((await f.current()).status, "Interrupted");
});

test("lost create/send replies never recreate or repeat; terminal persistence failure blocks next", async () => {
  for (const operation of ["create", "send"] as const) {
    const f = sequentialServiceFixture();
    await f.prepare();
    let calls = 0;
    f.native[operation] = async () => {
      calls++;
      throw new Error(`lost ${operation} reply`);
    };
    const run = await f.run();
    assert.equal(run.status, "Unknown");
    assert.equal((await f.run()).id, run.id);
    assert.equal(calls, 1);
    const restarted = sequentialServiceFixture(f.saved());
    assert.equal((await restarted.current()).status, "Interrupted");
    assert.equal(restarted.sends.length, 0);
    assert.equal(restarted.creates.length, 0);
  }
  const f = sequentialServiceFixture();
  await f.prepare();
  await f.run();
  const write = f.repository.write;
  let fail = true;
  f.repository.write = async (t, record) => {
    const run = record.runs[0];
    if (fail && run?.version === 2 && run.nodeAttempts[0]!.terminalProof) {
      fail = false;
      throw new Error("terminal disk failure");
    }
    await write(t, record);
  };
  f.emit(0, "completedSuccess", "actual native result");
  await f.settle();
  assert.equal((await f.current()).status, "Interrupted");
  assert.equal((await f.current()).nodeAttempts[0]!.terminalProof, undefined);
  assert.equal(f.sends.length, 1);
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: "native-1" }), true);
  const run = await f.current();
  const inspect = await f.service.inspectRecovery({ target, runId: run.id });
  assert.equal(inspect.recovery?.state, "inactive");
  const released = await f.service.releaseInterrupted({
    target,
    runId: run.id,
    reason: "Inspected exact warm terminal; outcome still unknown",
    confirmed: true,
  });
  assert.equal(released.status, "Interrupted");
  assert.equal(released.version === 2 && released.nodeAttempts[0]!.terminalProof, undefined);
  assert.equal(f.sends.length, 1);
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: "native-1" }), false);
});

test("interrupted active/unproven inputs refuse release and exact recovered cancel works", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  await f.run();
  f.emit(0, "running", undefined, {
    foregroundExecutionId: "original-active",
    waiting: "userInput",
  });
  await f.settle();
  f.lose(0);
  await f.settle();
  const run = await f.current();
  assert.equal(run.status, "Interrupted");
  assert.equal(
    (await f.service.inspectRecovery({ target, runId: run.id })).recovery?.state,
    "active",
  );
  await assert.rejects(
    f.service.releaseInterrupted({
      target,
      runId: run.id,
      reason: "Cannot release",
      confirmed: true,
    }),
    /active/,
  );
  f.setInspection({ kind: "unknown", reason: "Original runtime cannot be verified" });
  await assert.rejects(
    f.service.releaseInterrupted({
      target,
      runId: run.id,
      reason: "Still cannot release",
      confirmed: true,
    }),
    /unproven/,
  );
  assert.equal(f.sends.length, 1);
  f.setInspection(undefined);
  await f.service.cancel({ target, runId: run.id });
  assert.equal(f.cancellations[0]?.foregroundExecutionId, "original-active");
  f.emit(0, "completedInterrupted");
  await f.settle();
  assert.equal((await f.current()).status, "Cancelled");
  assert.equal(f.sends.length, 1);
});

test("failed release audit write leaves guard owned and retirement identity must match", async () => {
  const f = sequentialServiceFixture();
  await f.prepare();
  await f.run();
  f.lose(0);
  await f.settle();
  const run = await f.current();
  f.setInspection({
    kind: "inactive",
    proof: {
      kind: "runtime-retired",
      workspaceKey: target.workspacePath,
      runtimeIdentity: "foreign",
      retiredAt: 10,
    },
  });
  await assert.rejects(
    f.service.releaseInterrupted({
      target,
      runId: run.id,
      reason: "Wrong binding",
      confirmed: true,
    }),
    /unproven/,
  );
  f.setInspection({
    kind: "inactive",
    proof: {
      kind: "runtime-retired",
      workspaceKey: target.workspacePath,
      runtimeIdentity: "runtime-original",
      retiredAt: 10,
    },
  });
  const write = f.repository.write;
  f.repository.write = async (t, record) => {
    if (record.runs[0]?.release) throw new Error("audit disk failure");
    await write(t, record);
  };
  await assert.rejects(
    f.service.releaseInterrupted({
      target,
      runId: run.id,
      reason: "Confirmed retirement",
      confirmed: true,
    }),
    /audit disk failure/,
  );
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: "native-1" }), true);
  assert.equal((await f.current()).release, undefined);
  assert.equal(f.sends.length, 1);
});
