import assert from "node:assert/strict";
import test from "node:test";
import { resolveGraphParallelPolicy, type GraphParallelPolicy } from "@zcode/shared";
import { parallelFixture, plan, settings, target } from "./parallel.fixture.js";

const disabled: GraphParallelPolicy = resolveGraphParallelPolicy({ flavor: "graph" });

test("the supported Graph package is disabled whatever the environment says; other builds need an explicit opt-in", () => {
  for (const env of [
    {},
    { ZCODE_GRAPH_EXPERIMENTAL_PARALLEL: "1" },
    { ZCODE_GRAPH_EXPERIMENTAL_PARALLEL: "true" },
  ]) {
    const policy = resolveGraphParallelPolicy({ flavor: "graph", env });
    assert.equal(policy.mode, "disabled");
    assert.equal(policy.source, "supported-package");
  }
  for (const flavor of ["production", "preview"] as const) {
    assert.equal(resolveGraphParallelPolicy({ flavor, env: {} }).mode, "disabled");
    assert.equal(resolveGraphParallelPolicy({ flavor }).source, "default");
    assert.equal(
      resolveGraphParallelPolicy({ flavor, env: { ZCODE_GRAPH_EXPERIMENTAL_PARALLEL: "true" } })
        .mode,
      "disabled",
    );
    const optIn = resolveGraphParallelPolicy({
      flavor,
      env: { ZCODE_GRAPH_EXPERIMENTAL_PARALLEL: "1" },
    });
    assert.equal(optIn.mode, "experimental");
    assert.equal(optIn.source, "development-opt-in");
  }
});

test("an unset policy fails closed at the Host boundary: direct calls cannot admit parallel work", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  delete f.options.parallelPolicy;
  const service = f.parallel;
  assert.equal((await service.get(target)).policy.mode, "disabled");
  await assert.rejects(
    service.save({ target, plan: { ...plan }, expectedRevision: 0 }),
    /Parallel workflows are disabled/,
  );
  await assert.rejects(
    service.preview({ target, revision: 0, settings }),
    /Parallel workflows are disabled/,
  );
  await assert.rejects(
    service.prepare({
      target,
      revision: 0,
      settings,
      requestId: "direct-prepare",
      previewDigest: "x",
      acknowledgedUnknowns: true,
    }),
    /Parallel workflows are disabled/,
  );
  const view = await service.get(target);
  assert.equal(view.runs.length, 0);
  assert.equal(view.plan, undefined);
  assert.equal(f.sends.length, 0);
});

test("a disabled plan can still be saved (it only turns the feature off)", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  f.options.parallelPolicy = () => disabled;
  const saved = await f.parallel.save({
    target,
    plan: { ...plan, enabled: false },
    expectedRevision: 0,
  });
  assert.equal(saved.enabled, false);
  assert.equal((await f.parallel.get(target)).policy.source, "supported-package");
});

test("historical parallel data stays readable, cancellable and inert after the policy turns off", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  await f.approve();
  assert.equal(f.sends.length, 2);
  f.options.parallelPolicy = () => disabled;
  const view = await f.parallel.get(target);
  assert.equal(view.policy.mode, "disabled");
  assert.equal(view.runs.length, 1);
  assert.equal(view.runs[0]!.phase, "Workers");
  // 新的批准被拒绝，且不产生任何新的准入或发送。
  await assert.rejects(
    f.parallel.decide({
      target,
      runId: view.runs[0]!.id,
      phase: "integration",
      decisionId: "later-approval",
      digest: "any",
      approved: true,
      acknowledgedUnknowns: true,
      comment: "should not dispatch",
    }),
    /Parallel workflows are disabled/,
  );
  assert.equal(f.sends.length, 2);
  // 已有工作仍可经既有路径停止；这不是新的准入。
  await f.parallel.control({
    target,
    runId: view.runs[0]!.id,
    action: "cancel",
    reason: "operator",
  });
  assert.equal(f.cancels.length, 2);
  assert.equal(f.sends.length, 2);
});

test("restart with the policy off reads historical parallel runs as Interrupted and dispatches nothing", async (t) => {
  const f = parallelFixture();
  await f.prepare();
  await f.approve();
  const sendsBefore = f.sends.length;
  f.options.parallelPolicy = () => disabled;
  const restarted = await f.restart();
  t.after(() => restarted.disposeAndWait());
  const view = await restarted.parallelService.get(target);
  assert.equal(view.runs[0]!.phase, "Interrupted");
  assert.equal(view.policy.mode, "disabled");
  assert.equal(f.sends.length, sendsBefore);
});

test("the parallel policy does not gate ordinary sessions or the sequential Graph", async (t) => {
  const f = parallelFixture();
  t.after(() => f.service.disposeAndWait());
  f.options.parallelPolicy = () => disabled;
  await f.service.assertInputAllowed({
    ...target,
    sessionId: "ordinary-chat-session",
    commandType: "sendText",
  });
  const workspace = await f.service.getWorkspace(target);
  assert.equal(workspace.runs.length, 0);
});
