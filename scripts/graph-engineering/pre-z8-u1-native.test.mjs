import assert from "node:assert/strict";
import test from "node:test";
import { assertAgentLedVerification } from "./pre-z8-u1-ui.mjs";

// 只模拟 Playwright 的读取接口；同一断言另由 u1-browser 在真实组件上执行。
function pageWithFacts({
  runId = "run-agent",
  execution = "Completed",
  evidence = "agent-reported",
  visible = true,
} = {}) {
  const facts = {
    "graph-run-execution": { state: execution },
    "graph-run-evidence": { state: evidence },
  };
  return {
    getByTestId(id) {
      assert.equal(id, "graph-run-summary");
      return {
        async getAttribute(name) {
          assert.equal(name, "data-run-id");
          return runId;
        },
        getByTestId(factId) {
          assert.ok(Object.hasOwn(facts, factId));
          return {
            async isVisible() {
              return visible;
            },
            async getAttribute(name) {
              assert.equal(name, "data-state");
              return facts[factId].state;
            },
          };
        },
      };
    },
  };
}

test("native U1 completion accepts visible agent-reported evidence for the selected run", async () => {
  await assertAgentLedVerification(pageWithFacts(), "run-agent");
});

test("native U1 completion rejects verified, absent, hidden and unrelated verification facts", async () => {
  for (const evidence of ["tests-passed", "tests-failed", "no-tests", null]) {
    await assert.rejects(assertAgentLedVerification(pageWithFacts({ evidence }), "run-agent"));
  }
  for (const facts of [{ visible: false }, { runId: "other-run" }, { execution: "Running" }]) {
    await assert.rejects(assertAgentLedVerification(pageWithFacts(facts), "run-agent"));
  }
});
