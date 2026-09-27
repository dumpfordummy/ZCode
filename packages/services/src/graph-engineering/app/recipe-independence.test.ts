import assert from "node:assert/strict";
import test from "node:test";
import { routingFixture } from "./routing.fixture.js";
import { GraphState } from "./state.js";
import { GraphRoutingChecks } from "./routing-checks.js";
import { target } from "./sequential.fixture.js";
import { validateReadiness, workspaceKey } from "../domain/definition.js";
import { createRunPlan } from "./run-plan.js";
import { selection } from "./sequential.fixture.js";
import type { GraphSequentialRun } from "../contract.js";

test("only new explicit no-recipe plans omit recipe drift; historical plans remain conservative", async (t) => {
  const f = routingFixture();
  t.after(() => f.service.disposeAndWait());
  await f.prepare();
  const record = f.saved();
  const run = (await createRunPlan(f.options, {
    definition: record.definition,
    target,
    requestId: "recipe-independent",
    fingerprint: "recipe-independent",
    defaults: { modelSelection: selection, mode: "build", planEnabled: false },
    path: validateReadiness(record.definition).path,
  })) as GraphSequentialRun;
  record.runs.push(run);
  const state = new GraphState(f.options);
  t.after(() => state.disposeAndWait());
  state.records.set(workspaceKey(target), record);
  const checks = new GraphRoutingChecks(state);
  let reads = 0;
  f.options.recipes!.read = async () => {
    reads++;
    throw new Error("Historical recipe dependency is unavailable.");
  };
  assert.equal(await checks.verify(run), true);
  assert.equal(reads, 0);
  // 仅历史夹具替换旧摘要，验证没有新标记的记录不能因升级而跳过原有安全检查。
  run.routing!.recipeConfigurationDigest = f.options.evidence!.digest("recipes");
  assert.equal(await checks.verify(run), false);
  assert.equal(reads, 1);
  assert.equal(run.status, "NeedsHuman");
  assert.match(run.message!, /Historical recipe dependency/);
  assert.equal(f.sends.length, 0);
});
