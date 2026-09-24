import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./native.fixture.js";

test("native adapter retains the native allocated session and sends frozen input only after real subscription readiness", async () => {
  const f = fixture();
  assert.deepEqual(await f.port.available(), { available: true });
  const { sessionId: _sessionId, ...beforeCreation } = f.run;
  assert.deepEqual(await f.port.create(beforeCreation), {
    sessionId: "session",
    runtimeIdentity: "runtime-1",
  });
  assert.equal(f.created()?.persistence, "deferred");
  assert.equal(f.created()?.sessionId, undefined);
  await assert.rejects(f.port.send(f.run), /runtime.*unavailable/i);
  const subscription = await f.observe();
  assert.deepEqual(await f.port.send(f.run), { accepted: true });
  assert.equal(f.commands[0]?.envelope.commandId, f.run.commandId);
  assert.equal(f.commands[0]?.expectedRuntimeIdentity, f.run.runtimeIdentity);
  assert.deepEqual(f.commands[0]?.envelope.payload, {
    text: "fixture-only input",
    modelSelection: f.run.modelSelection,
    mode: "build",
    planEnabled: true,
  });
  assert.equal(f.facts.length, 0);
  subscription.dispose();
});

test("rejected native input preserves useful message and reason code without unbounded diagnostic output", async () => {
  const f = fixture();
  const subscription = await f.observe();
  f.reject("Synthetic workspace persistence failed: missing session record.");
  const rejected = await f.port.send(f.run);
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reason!, /missing session record/);
  assert.match(rejected.reason!, /proto.commandFailed/);
  f.reject("Synthetic bounded detail ".repeat(1_000));
  const long = await f.port.send(f.run);
  assert.ok(long.reason!.length <= 2_000);
  assert.match(long.reason!, /Synthetic bounded detail/);
  assert.match(long.reason!, /proto.commandFailed/);
  subscription.dispose();
});

test("native adapter fails closed for auto-answer, cold restore, mismatched input acceptance and changed runtime", async () => {
  const f = fixture();
  f.setAutoResolve();
  assert.equal((await f.port.available()).available, false);
  f.setCold();
  await assert.rejects(f.observe(), /cold/i);
  const normal = fixture();
  const subscription = await normal.observe();
  normal.mismatchAck();
  await assert.rejects(normal.port.send(normal.run), /input identity/i);
  normal.setIdentity("runtime-2");
  await assert.rejects(normal.port.send(normal.run), /runtime.*unavailable/i);
  assert.equal(await normal.port.reconcile(normal.run), "interrupted");
  assert.equal(normal.commands.length, 1);
  subscription.dispose();
});

test("native cancellation targets only the foreground execution of the original input", async () => {
  const f = fixture();
  const subscription = await f.observe();
  await assert.rejects(f.port.cancel(f.run), /foreground/i);
  f.emit(
    [
      {
        op: "row.appended",
        row: {
          kind: "turnHeader",
          rowId: 1,
          turnId: "turn",
          sourceCommandId: "input",
          origin: "userInput",
          state: "running",
          startedAt: 1,
          createdAt: 1,
          createdAtSeq: 1,
        },
      },
      {
        op: "state.updated",
        patch: {
          control: {
            ...f.snapshot.control,
            activeWorks: [
              { kind: "primaryTurn", foregroundExecutionId: "execution", startedAt: 1 },
            ],
          },
        },
      },
    ],
    0,
    1,
  );
  await f.port.cancel({ ...f.run, foregroundExecutionId: "execution" });
  assert.equal(f.commands[0]?.envelope.type, "stop");
  assert.equal(f.commands[0]?.expectedRuntimeIdentity, f.run.runtimeIdentity);
  assert.deepEqual(f.commands[0]?.envelope.payload, { expectedForegroundExecutionId: "execution" });
  await assert.rejects(
    f.port.cancel({ ...f.run, foregroundExecutionId: "another" }),
    /foreground/i,
  );
  assert.equal(f.commands.length, 1);
  subscription.dispose();
});
