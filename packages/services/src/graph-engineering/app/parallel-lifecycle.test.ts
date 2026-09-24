import assert from "node:assert/strict";
import test from "node:test";
import { parallelFixture, target, settings, plan } from "./parallel.fixture.js";
import { parallelRunSchema } from "../domain/parallel-schema.js";

test("Z7 two reserved child runs use unique sessions and cap concurrency; repeated reviews never dispatch twice", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  assert.equal(f.sends.length, 0);
  await Promise.all([f.approve(), f.approve()]);
  assert.equal(f.sends.length, 2);
  assert.equal(new Set(f.sends.map((s) => s.target.workspacePath)).size, 2);
  assert.equal(new Set(f.sends.map((s) => s.sessionId)).size, 2);
  await assert.rejects(
    f.service.run({ target, requestId: "foreign", revision: 0, ...settings }),
    /Fork\/Join/,
  );
  await f.emit(f.sends[0]!, "completedSuccess");
  assert.equal((await f.current()).phase, "Workers");
  await f.emit(f.sends[1]!, "completedSuccess");
  const run = await f.current();
  assert.equal(run.phase, "JoinReview");
  assert.equal(f.sends.length, 2);
  await assert.rejects(
    f.service.assertInputAllowed({
      ...f.sends[0]!.target,
      sessionId: f.sends[0]!.sessionId!,
      commandType: "sendText",
    }),
    /owns this run/,
  );
  const broken = structuredClone(run);
  broken.children[1]!.workspace!.workspacePath = broken.children[0]!.workspace!.workspacePath;
  assert.throws(() => parallelRunSchema.parse(broken), /distinct/);
});
test("Z7 concurrency one admits the second worker only after exact first completion", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare({ concurrency: 1 });
  await f.approve();
  assert.equal(f.sends.length, 1);
  await f.emit(f.sends[0]!, "running", "permission");
  assert.equal(f.sends.length, 1);
  await f.emit(f.sends[0]!, "completedSuccess");
  assert.equal(f.sends.length, 2);
});
test("Z7 failed worker cancels exact waiting sibling; uncertain cancellation cannot release", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  await f.approve();
  await f.emit(f.sends[1]!, "running", "permission");
  await f.emit(f.sends[0]!, "failed");
  const run = await f.current();
  assert.equal(run.phase, "Stopped");
  assert.equal(f.cancels.length, 1);
  assert.equal(f.cancels[0]!.sessionId, f.sends[1]!.sessionId);
  await assert.rejects(
    f.parallel.control({ target, runId: run.id, action: "release", reason: "Inspect inactive" }),
    /active or unknown/,
  );
  f.retire();
  await f.parallel.control({
    target,
    runId: run.id,
    action: "release",
    reason: "Confirmed retired original runtimes",
  });
  assert.ok((await f.current()).released);
});
test("Z7 changed owned path remains in history and does not suppress sibling cancellation", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  await f.approve();
  f.invalidate("a");
  await f.parallel.control({
    target,
    runId: (await f.current()).id,
    action: "cancel",
    reason: "Stop invalid path",
  });
  assert.ok(f.cancels.some((c) => c.sessionId === f.sends[1]!.sessionId));
  assert.equal((await f.current()).phase, "Stopped");
  assert.equal(Object.keys((await f.parallel.get(target)).children).length, 2);
});
test("Z7 base drift blocks admission and restarts retain IDs without resubmission", async (t) => {
  const f = parallelFixture();
  await f.prepare();
  await f.approve();
  const before = await f.current();
  const restarted = await f.restart();
  t.after(() => restarted.disposeAndWait());
  const after = (await restarted.parallelService.get(target)).runs[0]!;
  assert.equal(after.phase, "Interrupted");
  assert.deepEqual(after.children, before.children);
  assert.equal(f.sends.length, 2);
  await assert.rejects(
    restarted.parallelService.decide({
      target,
      runId: after.id,
      phase: "integration",
      decisionId: "bad",
      digest: "a".repeat(64),
      approved: true,
      acknowledgedUnknowns: true,
      comment: "No partial integration",
    }),
  );
});
test("Z7 reviewed rejection is durable and conflicting retries cannot authorize work", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  const r = await f.prepare();
  const decision = {
    target,
    runId: r.id,
    phase: "plan" as const,
    decisionId: "reject-fixture",
    digest: r.preparedDigest!,
    approved: false,
    acknowledgedUnknowns: false,
    comment: "Reject this plan",
  };
  await f.parallel.decide(decision);
  await f.parallel.decide(decision);
  assert.equal((await f.current()).planDecision?.approved, false);
  assert.equal(f.sends.length, 0);
  await assert.rejects(f.parallel.decide({ ...decision, approved: true }), /Conflicting/);
});
test("Z7 lost native acknowledgment blocks sibling admission and never replays the saved intent", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  const send = f.options.native.send;
  f.options.native.send = async (input) => {
    await send(input);
    throw new Error("Fixture lost ACK after native accept");
  };
  await f.approve();
  await f.flush();
  const run = await f.current();
  assert.equal(run.phase, "Stopped");
  assert.equal(f.sends.length, 1);
  assert.equal(run.children[1]!.admission, undefined);
  await f.approve();
  assert.equal(f.sends.length, 1);
  assert.equal((await f.current()).children[0]!.requestId, run.children[0]!.requestId);
});
test("Z7 original-source drift, run deadline and preservation are independent hard gates", async (t) => {
  const drift = parallelFixture();
  t.after(() => drift.service.disposeAndWait());
  await drift.prepare();
  drift.changeBase();
  await assert.rejects(drift.approve(), /Original base changed/);
  assert.equal(drift.sends.length, 0);
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  await f.approve();
  f.advanceClock(60001);
  await f.emit(f.sends[0]!, "running");
  const run = await f.current();
  assert.equal(run.phase, "Stopped");
  assert.match(run.message!, /deadline/);
  assert.equal(f.sends.length, 2);
  f.retire();
  await f.parallel.control({
    target,
    runId: run.id,
    action: "preserve",
    slots: ["a"],
    preserve: true,
    reason: "Keep branch for inspection",
  });
  await assert.rejects(
    f.parallel.control({
      target,
      runId: run.id,
      action: "cleanup",
      slots: ["a"],
      reason: "Cannot remove preserved branch",
    }),
    /preserved/,
  );
  await assert.rejects(
    f.parallel.control({
      target,
      runId: run.id,
      action: "cleanup",
      slots: ["foreign"],
      reason: "Reject foreign slot",
    }),
    /Foreign/,
  );
  await f.parallel.control({
    target,
    runId: run.id,
    action: "preserve",
    slots: ["a"],
    preserve: false,
    reason: "Finished branch inspection",
  });
  await f.parallel.control({
    target,
    runId: run.id,
    action: "cleanup",
    slots: ["a"],
    reason: "Remove this inactive owned branch only",
  });
  const retained = await f.current();
  assert.deepEqual(
    retained.retentionDecisions?.map((d) => [d.preserve, d.reason]),
    [
      [true, "Keep branch for inspection"],
      [false, "Finished branch inspection"],
    ],
  );
  assert.equal(retained.cleanup[0]?.reason, "Remove this inactive owned branch only");
  assert.equal(retained.children[0]?.workspace?.cleaned, true);
  assert.equal(retained.children[1]?.workspace?.cleaned, undefined);
});
test("Z7 multiple UI snapshots cannot rewrite frozen ownership or selected branches", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  const prepared = await f.prepare();
  const broken = structuredClone(prepared);
  broken.children[0]!.workspace!.ownerId = "foreign";
  assert.throws(() => parallelRunSchema.parse(broken), /owner/);
  // Prepared owner is the authority; a second UI snapshot cannot change the accepted frozen branch set.
  const views = await Promise.all([f.parallel.get(target), f.parallel.get(target)]);
  views[0]!.runs[0]!.children[0]!.selected = false;
  assert.equal((await f.current()).children[0]!.selected, true);
  await f.approve();
  assert.equal(f.sends.length, 2);
});
test("Z7 explicitly unselected branch never prepares a directory or native input", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare({
    branches: plan.branches.map((b, i) => ({ ...b, selected: i === 0 })),
    admissionBudget: 4,
  });
  await f.approve();
  const run = await f.current();
  assert.equal(run.children[1]!.selected, false);
  assert.equal(run.children[1]!.workspace, undefined);
  assert.equal(run.children[1]!.admission, undefined);
  assert.equal(f.sends.length, 1);
});
test("Z7 a reserved child request cannot admit a different frozen model or revision", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  const run = f.service.run.bind(f.service);
  f.service.run = async (params) => {
    if (params.action === "continue") return run(params);
    await assert.rejects(
      run({ ...params, modelSelection: { ...params.modelSelection, modelId: "foreign-model" } }),
      /exact live reserved/,
    );
    await assert.rejects(run({ ...params, revision: params.revision + 1 }), /exact live reserved/);
    return run(params);
  };
  await f.approve();
  assert.equal(f.sends.length, 2);
  assert.ok(f.sends.every((s) => s.modelSelection.modelId === settings.modelSelection.modelId));
});
