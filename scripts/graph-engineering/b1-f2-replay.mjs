import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createGraphReportCapture } from "../../packages/services/src/graph-engineering/adapters/trx-capture.ts";
const [summaryPath, runId, expectedHash] = process.argv.slice(2);
assert.ok(summaryPath && runId && /^[0-9a-f]{64}$/.test(expectedHash ?? ""));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const summaryBytes = await readFile(summaryPath);
const summary = JSON.parse(summaryBytes);
const run = summary.finalRecord.runs.find((r) => r.id === runId);
assert.ok(run);
const attempt = run.toolAttempts.find((a) => a.recipe.verifier.kind === "test");
const build = run.toolAttempts.find((a) => a.recipe.verifier.kind === "build");
const op = attempt.operation;
assert.equal(op.operationId, attempt.operationId);
assert.equal(op.processStarted, true);
assert.equal(op.result.processExitObserved, true);
assert.equal(op.result.exitCode, 1);
assert.equal(build.operation.result.exitCode, 0);
assert.equal(attempt.buildDigest, build.outputDigest);
const reportPath = attempt.recipe.verifier.reportPath.replace("{operationId}", attempt.operationId);
assert.equal(reportPath, attempt.resolvedReportPath);
const target = run.target;
const originalPath = path.join(target.workspacePath, reportPath);
const before = await readFile(originalPath);
assert.equal(sha(before), expectedHash);
const captured = await createGraphReportCapture().captureTrx(
  target,
  reportPath,
  attempt.recipe.verifier.target,
  op.startedAt,
  op.completedAt,
);
assert.equal(captured.issue, undefined);
assert.equal(captured.original.digest, expectedHash);
assert.equal(captured.report.tests.length, 3);
assert.equal(captured.report.tests.filter((t) => t.status === "passed").length, 2);
assert.equal(captured.report.tests.filter((t) => t.status === "failed").length, 1);
assert.deepEqual(await readFile(originalPath), before);
assert.deepEqual(await readFile(summaryPath), summaryBytes);
console.log(
  JSON.stringify(
    {
      kind: "read-only historical original-byte capture replay, not a new native observation or rewritten receipt",
      runId,
      operationId: op.operationId,
      scope: attempt.recipe.verifier.target,
      nativeWindow: { startedAt: op.startedAt, completedAt: op.completedAt },
      original: captured.original,
      report: captured.report,
      historicalSummarySha256: sha(summaryBytes),
      originalAndHistoryUnchanged: true,
    },
    null,
    2,
  ),
);
