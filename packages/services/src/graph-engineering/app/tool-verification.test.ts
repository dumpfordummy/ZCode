import assert from "node:assert/strict";
import test from "node:test";
import { verifyToolReport } from "../domain/tool-verification.js";

const expected = {
  operationId: "op-1",
  sourceDigest: "source-1",
  buildDigest: "build-1",
  minimumTests: 2,
  expectedTests: 2,
  requiredTests: ["adds", "subtracts"],
};
const report = () => ({
  format: "zcode-test-v1",
  operationId: "op-1",
  sourceDigest: "source-1",
  buildDigest: "build-1",
  tests: [
    { name: "adds", status: "passed" },
    { name: "subtracts", status: "passed" },
  ],
});
test("genuine report identity and positive required tests are independently checked", () => {
  assert.deepEqual(verifyToolReport(JSON.stringify(report()), expected), {
    reportParsed: true,
    provenanceValid: true,
    outcome: "pass",
    tests: report().tests,
    testCount: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    issues: [],
  });
  for (const key of ["operationId", "sourceDigest", "buildDigest"] as const) {
    const value = report();
    value[key] = "old";
    assert.ok(verifyToolReport(JSON.stringify(value), expected).issues.length);
  }
});
test("model PASS cannot make failed skipped zero malformed or duplicate-test reports pass", () => {
  for (const tests of [
    [],
    [
      { name: "adds", status: "failed" },
      { name: "subtracts", status: "passed" },
    ],
    [
      { name: "adds", status: "skipped" },
      { name: "subtracts", status: "passed" },
    ],
    [
      { name: "adds", status: "passed" },
      { name: "adds", status: "passed" },
    ],
  ]) {
    assert.ok(verifyToolReport(JSON.stringify({ ...report(), tests }), expected).issues.length);
  }
  for (const text of [
    "PASS",
    "```json\n{}\n```",
    '{"tests":[],"tests":[]}',
    JSON.stringify(report()) + " trailing",
  ])
    assert.ok(verifyToolReport(text, expected).issues.length);
});
