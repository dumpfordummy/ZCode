import assert from "node:assert/strict";
import test from "node:test";
import { packagedCases } from "./packaged-cases.mjs";
import { caseOutcome, parseCaseFilter, summarizeSuite } from "./packaged-suite.mjs";

const names = ["a", "b", "c"];
const ok = (name) => ({ name, exitCode: 0, status: "PASS" });
const bad = (name, exitCode = 1) => ({ name, exitCode, status: "FAIL" });

test("a case passes only with exit 0 and status PASS", () => {
  assert.equal(caseOutcome(0, { status: "PASS" }), "PASS");
  assert.equal(caseOutcome(1, { status: "PASS" }), "FAIL");
  assert.equal(caseOutcome(0, { status: "FAIL" }), "FAIL");
  assert.equal(caseOutcome(null, { status: "PASS" }), "FAIL");
  assert.equal(caseOutcome(0, undefined), "FAIL");
});

test("only a complete, fully passing suite satisfies the release gate", () => {
  const full = summarizeSuite({
    allCaseNames: names,
    selectedNames: names,
    results: names.map(ok),
  });
  assert.deepEqual(
    [full.scope, full.status, full.satisfiesFullReleaseGate, full.exitCode],
    ["full", "PASS", true, 0],
  );
});

test("any failure or unrun selected case makes the suite fail with a nonzero exit", () => {
  const failed = summarizeSuite({
    allCaseNames: names,
    selectedNames: names,
    results: [ok("a"), bad("b"), ok("c")],
  });
  assert.deepEqual([failed.status, failed.exitCode, failed.failed], ["FAIL", 1, ["b"]]);
  assert.equal(failed.satisfiesFullReleaseGate, false);
  // 非 keep-going 在首个失败处停止：其后的用例未运行，同样是失败。
  const aborted = summarizeSuite({
    allCaseNames: names,
    selectedNames: names,
    results: [bad("a")],
  });
  assert.deepEqual([aborted.status, aborted.exitCode, aborted.notRun], ["FAIL", 1, ["b", "c"]]);
  const crashed = summarizeSuite({
    allCaseNames: names,
    selectedNames: names,
    results: [ok("a"), ok("b"), bad("c", null)],
  });
  assert.equal(crashed.exitCode, 1);
});

test("a passing subset is labelled as a subset and never satisfies the full gate", () => {
  const subset = summarizeSuite({
    allCaseNames: names,
    selectedNames: ["a", "c"],
    results: [ok("a"), ok("c")],
  });
  assert.deepEqual(
    [
      subset.scope,
      subset.status,
      subset.satisfiesFullReleaseGate,
      subset.exitCode,
      subset.notSelected,
    ],
    ["subset", "SUBSET-PASS", false, 0, ["b"]],
  );
  const failedSubset = summarizeSuite({
    allCaseNames: names,
    selectedNames: ["b"],
    results: [bad("b")],
  });
  assert.deepEqual([failedSubset.status, failedSubset.exitCode], ["FAIL", 1]);
});

test("the case filter rejects unknown and duplicate names and keeps suite order", () => {
  assert.deepEqual(parseCaseFilter(undefined, names), { selectedNames: names, filtered: false });
  assert.deepEqual(parseCaseFilter("c,a", names), { selectedNames: ["a", "c"], filtered: true });
  assert.throws(() => parseCaseFilter("a,zzz", names), /Unknown/);
  assert.throws(() => parseCaseFilter("a,a", names), /Duplicate/);
});

test("the real packaged matrix has the thirteen expected cases, including the current sequential journey", () => {
  const list = packagedCases.map((item) => item.name);
  assert.equal(list.length, 13);
  assert.equal(new Set(list).size, 13);
  for (const required of [
    "ordinary-chat",
    "telemetry-canary",
    "no-provider",
    "z1-literal-compatibility",
    "sequential-engineering-reviewer",
  ])
    assert.ok(list.includes(required), required);
  assert.equal(list.filter((name) => name.startsWith("z2-")).length, 8);
  const reviewer = packagedCases.find((item) => item.name === "sequential-engineering-reviewer");
  assert.deepEqual([reviewer.script, reviewer.args], ["reviewer-native.mjs", ["--scenario=pass"]]);
});
