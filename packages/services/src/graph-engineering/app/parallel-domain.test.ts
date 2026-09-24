import assert from "node:assert/strict";
import test from "node:test";
import { combineParallelProposals } from "../domain/parallel.js";
import { parallelPlanSchema } from "../domain/parallel-schema.js";
const hash = (text: string) => text;
const proposal = (branchId: string, path: string, after: string) => ({
  branchId,
  digest: branchId,
  sourceDigest: branchId,
  files: [{ path, before: "base", after, kind: "edit" as const }],
});
test("Z7 Join refuses implicit conflict resolution and requires the exact reviewed source", () => {
  const proposals = [proposal("a", "shared.cs", "a"), proposal("b", "shared.cs", "b")];
  assert.throws(() => combineParallelProposals(proposals, {}, hash), /conflict choice/);
  assert.throws(
    () => combineParallelProposals(proposals, { "../outside": "a" }, hash),
    /Unexpected/,
  );
  assert.equal(
    combineParallelProposals(proposals, { "shared.cs": "b" }, hash).files[0]!.after,
    "b",
  );
  proposals[1]!.files[0]!.before = "other base";
  assert.throws(
    () => combineParallelProposals(proposals, { "shared.cs": "a" }, hash),
    /Pinned base/,
  );
});
test("Z7 disjoint proposals preserve additions, deletions and deterministic full contents", () => {
  const a = proposal("a", "a.cs", "new"),
    b = proposal("b", "b.cs", "");
  const combined = combineParallelProposals([b, a], {}, hash);
  assert.deepEqual(
    combined.files.map((f) => f.path),
    ["a.cs", "b.cs"],
  );
  assert.throws(() => combineParallelProposals([], {}, hash), /No proposed/);
});
test("Z7 plan bounds concurrency, aliases and explicit additions", () => {
  const plan = {
    version: 1,
    revision: 0,
    enabled: true,
    name: "fixture",
    request: "request",
    sharedContract: "contract",
    resultRequirements: "criteria",
    concurrency: 2,
    deadlineMs: 60000,
    admissionBudget: 5,
    buildRecipeId: "build",
    testRecipeId: "test",
    branches: [
      { id: "a", name: "a", selected: true, instructions: "edit", files: ["a.cs"], additions: [] },
    ],
  };
  assert.equal(parallelPlanSchema.parse(plan).concurrency, 2);
  assert.throws(() => parallelPlanSchema.parse({ ...plan, concurrency: 3 }));
  assert.throws(() =>
    parallelPlanSchema.parse({ ...plan, branches: [{ ...plan.branches[0], files: ["../a.cs"] }] }),
  );
  assert.throws(() =>
    parallelPlanSchema.parse({
      ...plan,
      branches: [{ ...plan.branches[0], additions: ["new.cs"] }],
    }),
  );
});
