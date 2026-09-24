import assert from "node:assert/strict";
import test from "node:test";
import type { TurnHeaderRow } from "@zcode/shared/zcode-protocol-v4";
import { fixture } from "./native.fixture.js";

function seed(f: ReturnType<typeof fixture>, state: TurnHeaderRow["state"]) {
  f.snapshot.seq = 6;
  f.snapshot.rows = {
    totalCount: 1,
    firstRowId: 1,
    window: [
      {
        kind: "turnHeader",
        rowId: 1,
        turnId: "exact-turn",
        sourceCommandId: "input",
        origin: "userInput",
        state,
        startedAt: 1,
        createdAt: 1,
        createdAtSeq: 1,
      },
    ],
  };
}

test("recovery reads an exact warm terminal without creation, input, or model traffic", async () => {
  const f = fixture();
  seed(f, "completedSuccess");
  const result = await f.port.inspect({ ...f.run, observationEpoch: "epoch" });
  assert.equal(result.kind, "inactive");
  if (result.kind !== "inactive") return;
  assert.deepEqual(result.proof, {
    kind: "input-terminal",
    runtimeIdentity: "runtime-1",
    sessionId: "session",
    inputId: "input",
    commandId: "input",
    terminalProof: {
      state: "completedSuccess",
      sourceCommandId: "input",
      turnId: "exact-turn",
      logEpoch: "epoch",
      seq: 6,
    },
  });
  assert.equal(f.created(), undefined);
  assert.equal(f.commands.length, 0);
  assert.equal(f.subscriptions[0]?.expectedRuntimeIdentity, "runtime-1");
});

test("recovery refuses cold, foreign epoch, missing input, and inactive-looking current runtime", async () => {
  const cold = fixture();
  seed(cold, "completedSuccess");
  cold.setCold();
  assert.equal((await cold.port.inspect(cold.run)).kind, "unknown");
  const epoch = fixture();
  seed(epoch, "completedSuccess");
  assert.equal(
    (await epoch.port.inspect({ ...epoch.run, observationEpoch: "old-epoch" })).kind,
    "unknown",
  );
  const empty = fixture();
  assert.equal((await empty.port.inspect(empty.run)).kind, "unknown");
  assert.equal(empty.commands.length, 0);
  assert.equal(empty.created(), undefined);
});

test("active exact foreground is inspectable and targeted cancellation remains usable", async () => {
  const f = fixture();
  seed(f, "running");
  f.snapshot.control.activeWorks = [
    { kind: "primaryTurn", foregroundExecutionId: "foreground", startedAt: 1 },
  ];
  const existing = await f.observe();
  const result = await f.port.inspect(f.run);
  assert.equal(result.kind, "active");
  if (result.kind !== "active") return;
  await f.port.cancel({ ...f.run, foregroundExecutionId: result.fact.foregroundExecutionId });
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0]?.envelope.type, "stop");
  existing.dispose();
});

test("running header without exact foreground is uncertain, never inactive or cancellable", async () => {
  const f = fixture();
  seed(f, "running");
  assert.equal((await f.port.inspect(f.run)).kind, "unknown");
  await assert.rejects(f.port.cancel(f.run));
  assert.equal(f.commands.length, 0);
});

test("replacement runtime and unavailable lifecycle never establish retirement", async () => {
  const f = fixture();
  f.setIdentity("replacement");
  assert.equal((await f.port.inspect(f.run)).kind, "unknown");
  assert.equal(f.subscriptions.length, 0);
  f.setRetirement({
    runtimeIdentity: "runtime-1",
    workspaceKey: f.run.target.workspacePath,
    retiredAt: 12,
  });
  const result = await f.port.inspect(f.run);
  assert.deepEqual(result, {
    kind: "inactive",
    proof: {
      kind: "runtime-retired",
      runtimeIdentity: "runtime-1",
      workspaceKey: f.run.target.workspacePath,
      retiredAt: 12,
    },
  });
  f.setRetirement({
    runtimeIdentity: "wrong-runtime",
    workspaceKey: f.run.target.workspacePath,
    retiredAt: 12,
  });
  assert.equal((await f.port.inspect(f.run)).kind, "unknown");
  f.setRetirement({ runtimeIdentity: "runtime-1", workspaceKey: "wrong-workspace", retiredAt: 12 });
  assert.equal((await f.port.inspect(f.run)).kind, "unknown");
  assert.equal(f.commands.length, 0);
  assert.equal(f.created(), undefined);
});
