// CLOUD-BOOTSTRAP-1: 证明 graph-cloud-required 会拒绝缺失、失败、取消、被跳过的必需 job。
// 这些用例在隔离的子进程里以合成的 `needs` JSON 运行真实的门禁脚本，不需要改动任何真实状态。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COUNTED_JOBS, MANDATORY_JOBS, evaluateNeeds } from "./graph-cloud-gate.mjs";

const gate = path.join(path.dirname(fileURLToPath(import.meta.url)), "graph-cloud-gate.mjs");
const countedOutputs = {
  ok: "true",
  tests: "100",
  pass: "96",
  fail: "0",
  cancelled: "0",
  skipped: "4",
};

function healthyNeeds() {
  return Object.fromEntries(
    MANDATORY_JOBS.map((job) => [
      job,
      { result: "success", outputs: COUNTED_JOBS.includes(job) ? { ...countedOutputs } : {} },
    ]),
  );
}

function runGate(needs) {
  const result = spawnSync(process.execPath, [gate], {
    env: {
      PATH: process.env.PATH,
      NEEDS_JSON: typeof needs === "string" ? needs : JSON.stringify(needs),
    },
    encoding: "utf8",
  });
  return { exit: result.status, out: `${result.stdout}${result.stderr}` };
}

test("accepts only when every mandatory job succeeded with real counts", () => {
  const { exit, out } = runGate(healthyNeeds());
  assert.equal(exit, 0, out);
  assert.match(out, /All mandatory jobs succeeded/);
});

for (const result of ["failure", "cancelled", "skipped"]) {
  for (const job of MANDATORY_JOBS) {
    test(`rejects a ${result} prerequisite: ${job}`, () => {
      const needs = healthyNeeds();
      needs[job].result = result;
      const { exit, out } = runGate(needs);
      assert.equal(exit, 1, out);
      assert.match(out, new RegExp(`${job}: result is '${result}'`));
    });
  }
}

test("rejects a mandatory job that is missing from needs", () => {
  const needs = healthyNeeds();
  delete needs["static-checks"];
  const { exit, out } = runGate(needs);
  assert.equal(exit, 1, out);
  assert.match(out, /static-checks: missing from needs/);
});

test("rejects an unclassified extra job so new work cannot bypass the gate silently", () => {
  const needs = { ...healthyNeeds(), "new-job": { result: "success", outputs: {} } };
  const { exit, out } = runGate(needs);
  assert.equal(exit, 1, out);
  assert.match(out, /new-job: unexpected job/);
});

test("rejects a successful test job whose recorded counts are empty, failing or cancelled", () => {
  for (const patch of [
    { tests: "0" },
    { tests: "" },
    { fail: "1" },
    { cancelled: "1" },
    { ok: "false" },
  ]) {
    const needs = healthyNeeds();
    needs["graph-tests"].outputs = { ...countedOutputs, ...patch };
    const { exit } = runGate(needs);
    assert.equal(exit, 1, JSON.stringify(patch));
  }
  const needs = healthyNeeds();
  needs["graph-tests"].outputs = {};
  assert.equal(runGate(needs).exit, 1, "missing outputs");
});

test("rejects malformed or empty needs input", () => {
  assert.equal(runGate("not json").exit, 1);
  assert.equal(runGate("{}").exit, 1);
  assert.equal(runGate("[]").exit, 1);
  assert.deepEqual(evaluateNeeds(null), ["needs context is not an object"]);
});
