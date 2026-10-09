import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { observeFixtureTrx } from "./pre-z8-dotnet-fixture.mjs";
import { assertU2CapturedRun } from "./pre-z8-u2-proof.mjs";
import { readArtifactUi } from "./z4-native-helpers.mjs";
import { selectU4Run } from "./pre-z8-u4-ui.mjs";
const sha = (value) => createHash("sha256").update(value).digest("hex");
export async function verifyB1Result(isolation, window, run, preview, fail) {
  assertU2CapturedRun(run, preview);
  const build = run.toolAttempts.find((a) => a.recipe.verifier.kind === "build");
  const test = run.toolAttempts.find((a) => a.recipe.verifier.kind === "test");
  assert.equal(build.verification.acceptancePassed, true);
  assert.equal(build.operation.result.exitCode, 0);
  assert.equal(test.buildDigest, build.outputDigest);
  assert.equal(test.recipe.verifier.buildNodeId, build.nodeId);
  assert.ok(test.operation.startedAt >= build.operation.completedAt);
  assert.equal(test.verification.acceptancePassed, !fail);
  assert.equal(test.verification.observationValid, true);
  assert.equal(test.verification.outcome, fail ? "fail" : "pass");
  assert.equal(test.operation.result.exitCode, fail ? 1 : 0);
  assert.equal(run.status, fail ? "Failed" : "Completed");
  const report = path.join(isolation.workspace, test.resolvedReportPath);
  const bytes = await readFile(report);
  const info = await stat(report);
  const observed = observeFixtureTrx(bytes.toString("utf8"));
  assert.equal(observed.counters.total, 3);
  assert.equal(observed.counters.passed, fail ? 2 : 3);
  assert.equal(observed.counters.failed, fail ? 1 : 0);
  assert.deepEqual(observed.results.map((t) => t.testName).sort(), [
    "B1.Tests.ArithmeticTests.AddNegative",
    "B1.Tests.ArithmeticTests.AddPositive",
    "B1.Tests.ArithmeticTests.AddZero",
  ]);
  assert.ok(info.mtimeMs >= test.operation.startedAt);
  assert.ok(Math.floor(info.mtimeMs) <= test.operation.completedAt);
  assert.ok(
    observed.codeBases.every((p) =>
      p.replaceAll("\\", "/").toLowerCase().endsWith("/tests/bin/debug/net8.0/b1.tests.dll"),
    ),
  );
  await selectU4Run(window, run.id);
  await window
    .locator(
      '[data-testid="graph-run-evidence"][data-state="' +
        (fail ? "tests-failed" : "tests-passed") +
        '"]',
    )
    .waitFor();
  assert.equal(await window.getByTestId("graph-run-evidence").isVisible(), true);
  const artifact = run.artifacts.find((a) => a.id === test.normalizationReceiptId);
  assert.ok(artifact);
  assert.equal(artifact.validation, "valid");
  const receipt = JSON.parse(await readArtifactUi(window, run, artifact));
  assert.equal(receipt.parserVersion, "dotnet-vstest-trx-v1");
  assert.equal(receipt.operationId, test.operationId);
  assert.equal(receipt.sourceDigest, test.sourceDigest);
  assert.equal(receipt.buildDigest, test.buildDigest);
  assert.equal(receipt.original.digest, sha(bytes));
  assert.equal(receipt.reportId, observed.runId);
  const normalized = run.artifacts.find((a) => a.id === receipt.normalized.artifactId);
  assert.equal(normalized.validation, "valid");
  const value = JSON.parse(await readArtifactUi(window, run, normalized));
  assert.equal(value.tests.length, 3);
  assert.equal(value.tests.filter((t) => t.status === "passed").length, fail ? 2 : 3);
  assert.equal(value.tests.filter((t) => t.status === "failed").length, fail ? 1 : 0);
  return {
    runId: run.id,
    buildOperation: build.operationId,
    testOperation: test.operationId,
    buildExit: build.operation.result.exitCode,
    testExit: test.operation.result.exitCode,
    verification: test.verification,
    report: {
      path: test.resolvedReportPath,
      originalSha256: sha(bytes),
      bytes: bytes.length,
      observation: observed,
    },
    normalizationReceipt: receipt,
    runner: test.operation.result.stdout.text,
  };
}
