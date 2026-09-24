import assert from "node:assert/strict";
import test from "node:test";
import type { GraphParallelRun } from "@zcode/services";
import {
  emptyParallelPlan,
  parallelConflicts,
} from "../src/graph-engineering/graphParallelView.js";
test("Z7 starts disabled and every duplicate source path is an explicit visible conflict", () => {
  assert.equal(emptyParallelPlan().enabled, false);
  const run = {
    children: [
      { id: "a", proposal: { files: [{ path: "same.cs" }, { path: "only-a.cs" }] } },
      { id: "b", proposal: { files: [{ path: "same.cs" }] } },
    ],
  } as GraphParallelRun;
  assert.deepEqual(parallelConflicts(run), [["same.cs", ["a", "b"]]]);
});
