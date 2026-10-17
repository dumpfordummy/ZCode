import assert from "node:assert/strict";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import {
  ADMISSION_OPS,
  T,
  admissionCalls,
  assertClean,
  editCheckByKeyboard,
  finished,
  preparedDraft,
  started,
  until,
} from "./ux-m1-helpers.mjs";

await runUxBrowserSuite({
  suite: "ENG-P1-I1 passive negative controls",
  scenarios: [
    {
      name: "passive Checks history permits only reads; injected mutation, admission and model calls fail",
      async run({ page, host, url }) {
        await preparedDraft(page, host, url);
        await editCheckByKeyboard(page, "test");
        await until(
          () => finished(host, "inspection-history").length > 0,
          "read-only history completed",
        );
        const passive = () => {
          assertClean(host);
          assert.deepEqual(admissionCalls(host), [], "passive view admits nothing");
          assert.deepEqual(started(host, "graph.recipes.save"), [], "passive view saves nothing");
        };
        passive();
        assert.equal(await T(page, "graph-guided-recipe").count(), 1);
        // 在真实被动页面的调用账本注入故障；逐项证明旧守卫仍会失败，再精确移除该项。
        for (const op of [
          "inspection",
          "prepare-web-profile",
          "unknown-inspection",
          "FORBIDDEN",
          "graph.recipes.save",
          ...ADMISSION_OPS,
        ]) {
          const before = host.calls.length;
          host.log(op, "start", { member: "negative-control-only" });
          try {
            assert.throws(passive, { name: "AssertionError" }, `${op} must fail`);
          } finally {
            host.calls.splice(before);
          }
        }
        passive();
      },
    },
  ],
});
