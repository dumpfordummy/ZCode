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

test("Z8.1 the parallel entry and admissions follow only the Host policy", async () => {
  const { parallelAdmissionsBlocked, parallelAdvancedVisible } =
    await import("../src/graph-engineering/graphParallelView.js");
  const policy = (mode: "disabled" | "experimental") => ({ mode, source: "default", reason: "r" });
  const view = (mode: "disabled" | "experimental", runs: unknown[] = [], plan?: unknown) =>
    ({ policy: policy(mode), runs, plan, children: {} }) as never;
  // 未知（尚未读取或读取失败）：不显示入口，也不阻止后续由 Host 拒绝。
  assert.equal(parallelAdvancedVisible(null), false);
  assert.equal(parallelAdmissionsBlocked(null), false);
  // 受支持包：没有历史就没有入口；有历史则只读可见，准入被阻止。
  assert.equal(parallelAdvancedVisible(view("disabled")), false);
  assert.equal(parallelAdvancedVisible(view("disabled", [{}])), true);
  assert.equal(parallelAdvancedVisible(view("disabled", [], { enabled: false })), true);
  assert.equal(parallelAdmissionsBlocked(view("disabled", [{}])), true);
  // 显式开发 opt-in：入口可见，准入不被 UI 阻止。
  assert.equal(parallelAdvancedVisible(view("experimental")), true);
  assert.equal(parallelAdmissionsBlocked(view("experimental")), false);
});
