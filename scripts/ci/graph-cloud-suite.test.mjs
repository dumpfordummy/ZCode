// CLOUD-BOOTSTRAP-1: 测试选择器的分类与计数判定，不运行真实测试套件。
import assert from "node:assert/strict";
import test from "node:test";
import { classifyInventory, evaluateGroup, parseTapSummary } from "./graph-cloud-suite.mjs";
import { selectFormatTargets } from "./format-changed.mjs";

const tap =
  "TAP version 13\n# tests 10\n# suites 0\n# pass 8\n# fail 0\n# cancelled 0\n# skipped 2\n# todo 0\n";

test("parses real TAP summary counts and rejects output without a summary", () => {
  assert.deepEqual(parseTapSummary(tap), {
    tests: 10,
    pass: 8,
    fail: 0,
    cancelled: 0,
    skipped: 2,
    todo: 0,
  });
  assert.throws(() => parseTapSummary("nothing here"), /no '# tests'/);
});

test("group evaluation fails on non-zero exit, zero tests, failures and unexpected skips", () => {
  const group = { expectedSkipped: 2 };
  const ok = { tests: 10, pass: 8, fail: 0, cancelled: 0, skipped: 2, todo: 0 };
  assert.deepEqual(evaluateGroup(group, 0, ok), []);
  assert.notEqual(evaluateGroup(group, 1, ok).length, 0);
  assert.notEqual(evaluateGroup(group, 0, { ...ok, tests: 0, pass: 0, skipped: 0 }).length, 0);
  assert.notEqual(evaluateGroup(group, 0, { ...ok, pass: 7, fail: 1 }).length, 0);
  assert.notEqual(evaluateGroup(group, 0, { ...ok, pass: 7, skipped: 3 }).length, 0);
  assert.notEqual(evaluateGroup(group, 0, { ...ok, pass: 9, skipped: 1 }).length, 0);
});

test("inventory flags unclassified test files, stale exclusions and empty directories", () => {
  const manifest = () => ({
    groups: [
      {
        id: "g",
        dirs: [{ dir: "a", suffix: ".test.ts" }],
        exclude: [{ file: "a/env.test.ts", reason: "needs dotnet" }],
      },
    ],
    notSelected: [{ prefix: "docs/", reason: "fixtures" }],
  });
  const tracked = ["a/x.test.ts", "a/env.test.ts", "docs/f.test.ts"];
  const listing = { a: ["x.test.ts", "env.test.ts"] };
  assert.deepEqual(classifyInventory(manifest(), tracked, listing), []);
  assert.match(
    classifyInventory(manifest(), [...tracked, "b/new.test.ts"], listing).join("\n"),
    /unclassified test file: b\/new\.test\.ts/,
  );
  assert.match(
    classifyInventory(manifest(), ["a/x.test.ts"], listing).join("\n"),
    /stale exclusion a\/env\.test\.ts/,
  );
  assert.match(classifyInventory(manifest(), tracked, { a: [] }).join("\n"), /matches no files/);
  const m = manifest();
  m.groups[0].exclude[0].reason = " ";
  assert.match(classifyInventory(m, tracked, listing).join("\n"), /without reason/);
});

test("format targets exclude byte-preserved evidence and fixtures only", () => {
  const { targets, excluded } = selectFormatTargets([
    "docs/graph-engineering/z8/evidence/z8-3/probe.cjs",
    "docs/graph-engineering/z8/fixtures/historical/a.json",
    "scripts/ci/graph-cloud-gate.mjs",
    "docs/graph-engineering/ci/GRAPH_CLOUD_REQUIRED.md",
  ]);
  assert.deepEqual(targets, [
    "scripts/ci/graph-cloud-gate.mjs",
    "docs/graph-engineering/ci/GRAPH_CLOUD_REQUIRED.md",
  ]);
  assert.equal(excluded.length, 2);
});
