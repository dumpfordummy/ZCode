import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { GraphRun } from "@zcode/services";
import { graphRunSummary } from "../src/graph-engineering/graphRunSummary.js";

// Read-only replay of preserved isolated native receipts; these tests run no native work.
for (const [directory, expected] of [
  ["pass-attempt-3", "tests-passed"],
  ["multi-attempt-1", "tests-passed"],
  ["fail-attempt-1", "tests-failed"],
  ["zero-attempt-1", "invalid"],
  ["skipped-attempt-1", "invalid"],
  ["missing-required-attempt-1", "invalid"],
  ["source-drift-attempt-1", "invalid"],
  ["build-drift-attempt-1", "invalid"],
] as const)
  test(`retained genuine U2 ${directory} projects captured ${expected} without new execution`, async () => {
    const receipt = JSON.parse(
      await readFile(
        new URL(
          `../../../docs/graph-engineering/evidence/pre-z8/u2/${directory}/pre-z8-u2-summary.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { runId: string; finalRecord: { runs: GraphRun[] } };
    const run = receipt.finalRecord.runs.find((item) => item.id === receipt.runId);
    assert.ok(run);
    const original = JSON.stringify(run),
      result = graphRunSummary(run);
    assert.equal(result.evidence.state, expected);
    assert.ok(result.evidence.configuredTestCount > 0);
    assert.equal(result.human.state, "not-required");
    assert.equal(JSON.stringify(run), original);
  });

test("retained U3 completed native handoff stays agent-reported with its exact human approval", async () => {
  const record = JSON.parse(
    await readFile(
      new URL(
        "../../../docs/graph-engineering/evidence/pre-z8/u3/handoff-attempt-1/graph-record.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { runs: GraphRun[] };
  const run = record.runs.find((item) => item.status === "Completed");
  assert.ok(run);
  const result = graphRunSummary(run);
  assert.equal(result.execution.status, "Completed");
  assert.equal(result.evidence.state, "agent-reported");
  assert.equal(result.evidence.configuredTestCount, 0);
  assert.equal(result.human.state, "approved");
  assert.equal(result.result.kind, "text");
  assert.ok(result.sourceChanges.length);
});
