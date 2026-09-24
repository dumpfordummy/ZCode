import assert from "node:assert/strict";
import test from "node:test";
import { GraphEngineeringService } from "./service.js";
import type { GraphNativeFact, GraphNativePort, GraphRecord, GraphRepository } from "./ports.js";
import type { GraphRun } from "../contract.js";

const target = { workspacePath: "C:/synthetic/z1" };
const selection = { providerId: "fixture", modelId: "controlled" };
function fixture(initial?: GraphRecord) {
  let saved = initial ? structuredClone(initial) : null;
  let sequence = 0;
  let creates = 0;
  let sends = 0;
  let cancelled: GraphRun | undefined;
  let listener: ((fact: GraphNativeFact) => void) | undefined;
  const repository: GraphRepository = {
    async read() {
      return saved ? structuredClone(saved) : null;
    },
    async write(_target, record) {
      saved = structuredClone(record);
    },
  };
  const native: GraphNativePort = {
    async available() {
      return { available: true };
    },
    async validateSelection() {},
    async create(run) {
      creates++;
      assert.ok(saved?.runs.some((item) => item.id === run.id));
      assert.equal(run.sessionId, undefined);
      assert.equal(saved!.runs.find((item) => item.id === run.id)!.sessionId, undefined);
      return { sessionId: `native-session-${creates}`, runtimeIdentity: "runtime-1" };
    },
    async observe(_run, callback) {
      assert.ok(_run.sessionId);
      assert.equal(saved!.runs.find((item) => item.id === _run.id)!.sessionId, _run.sessionId);
      listener = callback;
      return { dispose() {} };
    },
    async send() {
      sends++;
      return { accepted: true };
    },
    async cancel(run) {
      cancelled = run;
    },
    async reconcile() {
      return initial ? "interrupted" : "same-runtime";
    },
  };
  const service = new GraphEngineeringService({
    repository,
    native,
    id: () => `id-${++sequence}`,
    now: () => sequence + 100,
  });
  const prepare = async () => {
    const view = await service.getWorkspace(target);
    return service.saveDefinition({
      target,
      expectedRevision: view.definition.revision,
      definition: { ...view.definition, instructions: "Inspect fixture and run its test" },
    });
  };
  const run = async (requestId = "request-1") =>
    service.run({ target, requestId, revision: 1, modelSelection: selection, mode: "build" });
  return {
    service,
    prepare,
    run,
    native,
    repository,
    emit: (fact: GraphNativeFact) => listener?.(fact),
    saved: () => saved!,
    counts: () => ({ creates, sends }),
    cancelled: () => cancelled,
  };
}

test("question protection follows unresolved native session ownership without waiting on dispatch", async () => {
  const f = fixture();
  await f.prepare();
  assert.deepEqual(await f.service.protectedSessionIds(target), []);
  f.native.create = async (run) => {
    assert.equal(run.sessionId, undefined);
    assert.deepEqual(await f.service.protectedSessionIds(target), []);
    return { sessionId: "native-protected-session", runtimeIdentity: "runtime-1" };
  };
  const run = await f.run();
  assert.deepEqual(await f.service.protectedSessionIds(target), [run.sessionId]);
  f.emit({ sourceCommandId: run.commandId, state: "completedSuccess", logEpoch: "epoch", seq: 1 });
  await f.service.getWorkspace(target);
  assert.deepEqual(await f.service.protectedSessionIds(target), []);
});

test("lost native creation reply never recreates a session or submits input", async () => {
  const f = fixture();
  await f.prepare();
  let creations = 0;
  f.native.create = async (run) => {
    creations++;
    assert.equal(run.sessionId, undefined);
    assert.equal(f.saved().runs[0]!.commandId, run.commandId);
    throw new Error("Synthetic lost create reply");
  };
  const run = await f.run();
  assert.equal(run.status, "Unknown");
  assert.equal(run.sessionId, undefined);
  assert.equal((await f.run()).id, run.id);
  assert.equal(creations, 1);
  assert.equal(f.counts().sends, 0);
  await assert.rejects(f.run("different"), /unresolved/);
});

test("failed first attempt write creates no work or cached reservation and the same request can retry", async () => {
  const f = fixture();
  await f.prepare();
  const write = f.repository.write;
  let changed = 0;
  const subscription = f.service.onDidChange(() => {
    changed++;
  });
  f.repository.write = async (_target, candidate) => {
    assert.equal(candidate.runs.length, 1);
    throw new Error("Synthetic first attempt write failed");
  };
  await assert.rejects(f.run(), /first attempt write failed/);
  assert.deepEqual(f.counts(), { creates: 0, sends: 0 });
  assert.equal(f.saved().runs.length, 0);
  assert.equal((await f.service.getWorkspace(target)).runs.length, 0);
  assert.equal(changed, 0);

  f.repository.write = write;
  const retry = await f.run();
  assert.equal(retry.status, "Running");
  assert.equal(retry.requestId, "request-1");
  assert.equal(f.saved().runs.length, 1);
  assert.deepEqual(f.counts(), { creates: 1, sends: 1 });
  subscription.dispose();
});

test("failed metadata persistence cannot release native input ownership or publish terminal proof", async () => {
  const f = fixture();
  await f.prepare();
  const run = await f.run();
  f.repository.write = async () => {
    throw new Error("Synthetic disk unavailable");
  };
  f.emit({ sourceCommandId: run.commandId, state: "completedSuccess", logEpoch: "epoch", seq: 1 });
  const view = await f.service.getWorkspace(target);
  assert.notEqual(view.runs[0]!.status, "Completed");
  assert.equal(view.runs[0]!.terminalProof, undefined);
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: run.sessionId! }), true);
});

test("another metadata owner permits read-only projection but no mutation or reconciliation", async () => {
  const first = fixture();
  await first.prepare();
  const run = await first.run();
  const second = fixture(first.saved());
  second.repository.acquireOwnership = async () => false;
  const view = await second.service.getWorkspace(target);
  assert.equal(view.availability.available, false);
  assert.match(view.availability.reason!, /another ZCode window/);
  assert.equal(view.runs[0]!.status, run.status);
  await assert.rejects(second.run("second"), /another ZCode window/);
  await assert.rejects(
    second.service.saveDefinition({ target, definition: view.definition, expectedRevision: 1 }),
    /another ZCode window/,
  );
  assert.deepEqual(second.counts(), { creates: 0, sends: 0 });
});

test("saved layout survives reopen and stale revisions / extra topology are rejected", async () => {
  const f = fixture();
  const definition = await f.prepare();
  definition.nodes[1]!.position = { x: 333, y: 120 };
  await f.service.saveDefinition({ target, expectedRevision: 1, definition });
  await assert.rejects(
    f.service.saveDefinition({ target, expectedRevision: 1, definition }),
    /revision/i,
  );
  const reopened = fixture(f.saved());
  assert.deepEqual((await reopened.service.getWorkspace(target)).definition.nodes[1]!.position, {
    x: 333,
    y: 120,
  });
  await assert.rejects(
    f.service.saveDefinition({
      target,
      expectedRevision: 2,
      definition: { ...definition, edges: [] },
    }),
    /Start.*Agent Task.*End/i,
  );
});

test("double run persists correlation first and only creates / dispatches once", async () => {
  const f = fixture();
  await f.prepare();
  const [a, b] = await Promise.all([f.run(), f.run()]);
  assert.equal(a.id, b.id);
  assert.equal(a.inputId, a.commandId);
  assert.deepEqual(f.counts(), { creates: 1, sends: 1 });
  await assert.rejects(f.run("different"), /unresolved|active/i);
  await assert.rejects(
    f.service.assertInputAllowed({
      ...target,
      sessionId: a.sessionId!,
      commandId: "manual",
      commandType: "sendText",
    }),
    /Graph Engineering/,
  );
  await f.service.assertInputAllowed({
    ...target,
    sessionId: a.sessionId!,
    commandId: a.commandId,
    commandType: "sendText",
  });
  for (const commandType of [
    "switchModelConfig",
    "switchCollaborationMode",
    "sendGoalCommand",
    "compact",
    "retryTurn",
  ]) {
    await assert.rejects(
      f.service.assertInputAllowed({
        ...target,
        sessionId: a.sessionId!,
        commandId: "manual",
        commandType,
      }),
      /Graph Engineering/,
    );
  }
});

test("shutdown retains metadata ownership until in-flight operations settle", async () => {
  const f = fixture();
  await f.prepare();
  const entered = Promise.withResolvers<void>();
  const receipt = Promise.withResolvers<{ accepted: boolean }>();
  let released = false;
  f.repository.dispose = async () => {
    released = true;
  };
  f.native.send = async () => {
    entered.resolve();
    return receipt.promise;
  };
  const running = f.run();
  await entered.promise;
  f.service.dispose();
  assert.equal(released, false);
  const failed = assert.rejects(running, /closed/);
  receipt.resolve({ accepted: true });
  await failed;
  await f.service.disposeAndWait();
  assert.equal(released, true);
});

test("only exact live input can finish; waiting, stale events and frozen outcomes", async () => {
  const f = fixture();
  await f.prepare();
  const run = await f.run();
  f.emit({ sourceCommandId: "previous", state: "completedSuccess", logEpoch: "epoch", seq: 8 });
  assert.equal((await f.service.getWorkspace(target)).runs[0]!.status, "Running");
  f.emit({
    sourceCommandId: run.commandId,
    state: "running",
    waiting: "permission",
    logEpoch: "epoch",
    seq: 9,
  });
  assert.equal((await f.service.getWorkspace(target)).runs[0]!.status, "WaitingForPermission");
  f.emit({
    sourceCommandId: run.commandId,
    state: "running",
    waiting: "userInput",
    logEpoch: "epoch",
    seq: 10,
  });
  assert.equal((await f.service.getWorkspace(target)).runs[0]!.status, "WaitingForUser");
  f.emit({ sourceCommandId: run.commandId, state: "completedSuccess", logEpoch: "epoch", seq: 9 });
  assert.equal((await f.service.getWorkspace(target)).runs[0]!.status, "WaitingForUser");
  f.emit({
    sourceCommandId: run.commandId,
    state: "completedSuccess",
    logEpoch: "old-epoch",
    seq: 99,
  });
  assert.equal((await f.service.getWorkspace(target)).runs[0]!.status, "WaitingForUser");
  f.emit({ sourceCommandId: run.commandId, state: "completedSuccess", logEpoch: "epoch", seq: 11 });
  f.emit({ sourceCommandId: run.commandId, state: "failed", logEpoch: "epoch", seq: 12 });
  const result = (await f.service.getWorkspace(target)).runs[0]!;
  assert.equal(result.status, "Completed");
  assert.equal(result.terminalProof?.seq, 11);
  assert.equal(await f.service.isSessionOwned({ ...target, sessionId: run.sessionId! }), false);
});

test("lost dispatch reply remains Unknown and never retries on duplicate or restart", async () => {
  const f = fixture();
  await f.prepare();
  f.native.send = async () => {
    throw new Error("reply lost");
  };
  const run = await f.run();
  assert.equal(run.status, "Unknown");
  assert.equal((await f.run()).id, run.id);
  const reopened = fixture(f.saved());
  const view = await reopened.service.getWorkspace(target);
  assert.equal(view.runs[0]!.status, "Interrupted");
  assert.deepEqual(reopened.counts(), { creates: 0, sends: 0 });
  await assert.rejects(reopened.run("again"), /unresolved|active/i);
});

test("cancel requires exact execution identity and remains requested until terminal", async () => {
  const f = fixture();
  await f.prepare();
  const run = await f.run();
  await assert.rejects(f.service.cancel({ target, runId: run.id }), /execution/i);
  f.emit({
    sourceCommandId: run.commandId,
    state: "running",
    foregroundExecutionId: "execution-1",
    logEpoch: "epoch",
    seq: 1,
  });
  const requested = await f.service.cancel({ target, runId: run.id });
  assert.equal(requested.status, "CancelRequested");
  assert.equal(f.cancelled()?.foregroundExecutionId, "execution-1");
  f.emit({
    sourceCommandId: run.commandId,
    state: "completedInterrupted",
    logEpoch: "epoch",
    seq: 2,
  });
  assert.equal((await f.service.getWorkspace(target)).runs[0]!.status, "Cancelled");
});

test("remote targets and unavailable provider/question configuration do not create sessions", async () => {
  const f = fixture();
  await f.prepare();
  await assert.rejects(
    f.service.run({
      target: { ...target, remoteSessionId: "remote" },
      requestId: "r",
      revision: 1,
      modelSelection: selection,
      mode: "build",
    }),
    /local/i,
  );
  f.native.available = async () => ({
    available: false,
    reason: "Disable question auto-resolution",
  });
  await assert.rejects(f.run(), /auto-resolution/);
  assert.deepEqual(f.counts(), { creates: 0, sends: 0 });
});
