import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ledger, modelCount, readGraphRecord, nativeSessions } from "./z5-native-observe.mjs";
import { readArtifactUi } from "./z4-native-helpers.mjs";
import { observeFixtureTrx } from "./pre-z8-dotnet-fixture.mjs";
import { ADAPTER_SOURCE, TEST_CASES } from "./pre-z8-dotnet-source.mjs";
import { u2OwnedFile, u2Sha256 } from "./pre-z8-u2-fixture.mjs";
import { assertU4Summary, captureU4Summary } from "./pre-z8-u4-ui.mjs";
import { openU3Details, u3Wait } from "./pre-z8-u3-common.mjs";

export async function assertU2NoModels(isolation, label) {
  assert.deepEqual(await ledger(isolation), [], `${label}: no Agent inputs may be admitted.`);
  assert.equal(modelCount(isolation), 0, `${label}: no model request is permitted.`);
  assert.deepEqual(
    isolation.fixture.toolResults,
    [],
    `${label}: no provider tool response is expected.`,
  );
}

export async function assertU2NoExecution(isolation, baseline, label) {
  await assertU2NoModels(isolation, label);
  const record = await readGraphRecord(isolation);
  assert.deepEqual(record.runs, baseline.runs, `${label}: native checks must not be admitted.`);
  assert.deepEqual(
    record.definition,
    baseline.definition,
    `${label}: saved design must remain unchanged.`,
  );
}

export async function assertU2Preserved(isolation, baseline, configuration) {
  const record = await readGraphRecord(isolation);
  assert.deepEqual(
    record.definition,
    baseline.definition,
    "Calibration must not replace the saved design/revision.",
  );
  assert.deepEqual(
    record.runs.slice(0, baseline.runs.length),
    baseline.runs,
    "Previous history is immutable.",
  );
  assert.equal(
    await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
    configuration,
  );
  assert.equal(await readFile(path.join(isolation.workspace, "Cases.cs"), "utf8"), TEST_CASES);
  assert.equal(
    await readFile(path.join(isolation.workspace, "adapter/Adapter.cs"), "utf8"),
    ADAPTER_SOURCE,
  );
  await assertU2NoModels(isolation, "calibration result");
  return record;
}

export function assertU2CapturedRun(run, preview) {
  assert.equal(run.version, 4);
  assert.deepEqual(run.definition, preview.definition);
  const { definition: _definition, ...receipt } = preview;
  assert.deepEqual(run.purpose.preview, receipt);
  assert.equal(run.purpose.kind, "checks");
  assert.equal(run.purpose.acknowledgedUnknowns, true);
  assert.ok(run.purpose.acceptedAt >= run.createdAt);
  assert.equal(
    run.provenance,
    undefined,
    "Tool-only calibration must not fabricate template/model provenance.",
  );
  assert.deepEqual(run.nodeAttempts, []);
  assert.equal(run.approvalAttempts?.length ?? 0, 0);
  assert.equal(run.toolAttempts.length, preview.recipes.length);
  assert.deepEqual(
    run.toolAttempts.map((attempt) => attempt.recipe),
    preview.recipes,
  );
  for (const attempt of run.toolAttempts) {
    assert.ok(attempt.sessionId && attempt.runtimeIdentity);
    assert.equal(attempt.operation.operationId, attempt.operationId);
    assert.equal(attempt.operation.sessionId, attempt.sessionId);
    assert.equal(attempt.operation.recipeId, attempt.recipe.id);
    assert.equal(attempt.dispatchPhase, "accepted");
    assert.equal(attempt.operation.processStarted, true);
    assert.equal(attempt.operation.result.processExitObserved, true);
    assert.equal(attempt.operation.result.cancelled, false);
    assert.equal(attempt.operation.result.timedOut, false);
    assert.equal(attempt.operation.result.stdout.truncated, false);
    assert.equal(attempt.operation.result.stderr.truncated, false);
    assert.ok(attempt.operation.completedAt >= attempt.operation.startedAt);
  }
  assert.equal(
    new Set(run.toolAttempts.map((attempt) => attempt.sessionId)).size,
    run.toolAttempts.length,
  );
}

async function observedFiles(isolation, names) {
  const files = [];
  for (const name of [...names].sort()) {
    const file = await u2OwnedFile(isolation, name);
    const content = await readFile(file),
      metadata = await stat(file);
    files.push({
      path: name,
      bytes: content.length,
      digest: u2Sha256(content),
      modifiedAt: metadata.mtimeMs,
    });
  }
  return {
    files,
    digest: u2Sha256(
      JSON.stringify(files.map(({ path, bytes, digest }) => ({ path, bytes, digest }))),
    ),
  };
}

export async function verifyU2BuildBoundary(isolation, summary, run) {
  const build = run.toolAttempts.find((attempt) => attempt.recipe.verifier.kind === "build");
  assert.equal(build.status, "Completed");
  const source = await observedFiles(isolation, build.recipe.sourcePaths);
  const outputs = await observedFiles(isolation, build.recipe.expectedOutputs);
  assert.equal(source.digest, build.sourceDigest);
  assert.equal(outputs.digest, build.outputDigest);
  for (const file of outputs.files) {
    assert.ok(
      file.modifiedAt >= build.operation.startedAt,
      `${file.path}: output predates actual Build.`,
    );
    assert.ok(
      Math.floor(file.modifiedAt) <= build.operation.completedAt,
      `${file.path}: output has future modification time.`,
    );
    const before = build.outputsBefore.find((entry) => entry.path === file.path);
    assert.ok(before && (!before.exists || before.modifiedAt !== file.modifiedAt));
  }
  summary.buildAtTestPermission = { operationId: build.operationId, source, outputs };
}

/**
 * 断言工件预览的脱敏结果与预期一致。预期（clean/sensitive）由调用方根据已知 fixture
 * 内容独立判定，不依赖被测脱敏函数的输出。两种预期都拒绝标志/digest 不一致的中间态：
 *  - clean：redacted 未置位、validation=valid、digest 与 original 一致（产品不得误脱敏干净内容）。
 *  - sensitive：redacted=true、validation=incomplete、digest 与 original 漂移（产品不得漏脱敏敏感内容）。
 * 这样 proof 不会因为产品返回 redacted 与否就选择一条总能接受当前输出的分支。
 */
export function assertArtifactRedaction(rawPreview, receipt, expected) {
  if (expected === "sensitive") {
    assert.equal(rawPreview.redacted, true, "sensitive content must be marked redacted");
    assert.equal(rawPreview.validation, "incomplete", "sensitive content must be incomplete");
    assert.notEqual(
      rawPreview.digest,
      receipt.original.digest,
      "sensitive content digest must drift from original",
    );
  } else {
    assert.notEqual(rawPreview.redacted, true, "clean content must not be marked redacted");
    assert.equal(rawPreview.validation, "valid", "clean content must remain valid");
    assert.equal(
      rawPreview.digest,
      receipt.original.digest,
      "clean content digest must match original",
    );
  }
}

export async function verifyU2Result(
  isolation,
  window,
  summary,
  run,
  preview,
  scenario,
  { reopened = false } = {},
) {
  assertU2CapturedRun(run, preview);
  await verifyU2CurrentSummary(isolation, window, summary, run, scenario, reopened);
  assert.equal(nativeSessions(isolation, run).length, run.toolAttempts.length);
  const build = run.toolAttempts.find((attempt) => attempt.recipe.verifier.kind === "build");
  const tests = run.toolAttempts.filter((attempt) => attempt.recipe.verifier.kind === "test");
  assert.ok(build);
  assert.equal(tests.length, scenario === "multi" ? 2 : 1);
  assert.equal(build.status, "Completed");
  assert.equal(build.verification.acceptancePassed, true);
  assert.equal(build.operation.result.exitCode, 0);
  const currentSource = await observedFiles(isolation, build.recipe.sourcePaths);
  const currentOutputs = await observedFiles(isolation, build.recipe.expectedOutputs);
  if (scenario === "source-drift") assert.notEqual(currentSource.digest, build.sourceDigest);
  else assert.equal(currentSource.digest, build.sourceDigest);
  if (scenario === "build-drift") assert.notEqual(currentOutputs.digest, build.outputDigest);
  else assert.equal(currentOutputs.digest, build.outputDigest);
  summary.afterTestFiles = { source: currentSource, outputs: currentOutputs };
  assert.equal(new Set(tests.map((test) => test.resolvedReportPath)).size, tests.length);
  for (const test of tests)
    await verifyU2Test(isolation, window, summary, run, build, test, scenario, reopened);
  summary.assertions.push(
    `Genuine ${scenario} native VSTest process/report facts and independent source/build association retain their distinct acceptance outcome.`,
  );
}

async function verifyU2CurrentSummary(isolation, window, summary, run, scenario, reopened) {
  const record = await readGraphRecord(isolation);
  if (summary.probe && !reopened) {
    const probe = record.runs.find((item) => item.id === summary.probe.runId);
    assert.ok(probe);
    const projection = await assertU4Summary(window, summary, probe, {
      evidence: "command-only",
      human: "not-required",
    });
    assert.equal(projection.evidence.configuredTestCount, 0);
    assert.equal(projection.evidence.checks.length, 1);
    assert.equal(projection.evidence.checks[0].kind, "command");
    await captureU4Summary(isolation, window, summary, "pre-z8-u4-probe-command-only");
  }
  const evidence = ["pass", "multi"].includes(scenario)
    ? "tests-passed"
    : scenario === "fail"
      ? "tests-failed"
      : "invalid";
  const projection = await assertU4Summary(window, summary, run, {
    evidence,
    human: "not-required",
  });
  assert.equal(projection.evidence.configuredTestCount, scenario === "multi" ? 2 : 1);
  const details = window.getByTestId("graph-run-checks");
  await openU3Details(details);
  for (const check of projection.evidence.checks) {
    const attempt = run.toolAttempts.find((item) => item.attemptId === check.attemptId);
    assert.ok(attempt);
    assert.equal(check.nodeId, attempt.nodeId);
    assert.deepEqual(check.verification, attempt.verification);
    const row = window.locator(
      `[data-testid="graph-run-check"][data-node-id="${check.nodeId}"][data-attempt-id="${check.attemptId}"]`,
    );
    assert.equal(await row.count(), 1);
    const expected =
      check.kind === "test"
        ? evidence === "tests-passed"
          ? "passed"
          : evidence === "tests-failed"
            ? "failed"
            : "invalid"
        : "command-result";
    assert.equal(check.state, expected);
    assert.equal(await row.getAttribute("data-state"), expected);
    if (expected === "failed" || expected === "invalid") {
      const action = window.locator(
        `[data-testid="graph-run-inspect-evidence"][data-node-id="${check.nodeId}"]`,
      );
      assert.equal(await action.count(), 1);
      await action.click();
      await u3Wait(
        () => window.getByTestId("graph-tool-inspector").getAttribute("data-operation-id"),
        (value) => value === attempt.operationId,
        "exact captured check inspection action",
      );
    }
  }
  await details.locator(":scope > summary").click();
  if (!reopened && summary.screenshots)
    await captureU4Summary(isolation, window, summary, `pre-z8-u4-${scenario}-${evidence}`);
  assert.deepEqual(await readGraphRecord(isolation), record);
  await assertU2NoModels(isolation, "U4 captured summary and check navigation");
  summary.assertions.push(
    `U4 presentation projects ${evidence}, exact per-check facts and not-required human decision from this genuine native run without admitting or revalidating work.`,
  );
}

async function verifyU2Test(isolation, window, summary, run, build, test, scenario, reopened) {
  assert.equal(test.buildDigest, build.outputDigest);
  assert.equal(test.recipe.verifier.buildNodeId, build.nodeId);
  assert.ok(test.resolvedArgs.includes("--no-build") && test.resolvedArgs.includes("--no-restore"));
  assert.equal(test.resolvedReportPath, `.zcode/graph-results/${test.operationId}/results.trx`);
  const report = await u2OwnedFile(isolation, test.resolvedReportPath);
  const original = await readFile(report),
    metadata = await stat(report);
  const genuine = observeFixtureTrx(original.toString("utf8"));
  assert.ok(metadata.mtimeMs >= test.operation.startedAt);
  assert.ok(Math.floor(metadata.mtimeMs) <= test.operation.completedAt);
  const reportCopy = path.join(isolation.home, `pre-z8-u2-${scenario}-${test.nodeId}-original.trx`);
  if (reopened) assert.deepEqual(await readFile(reportCopy), original);
  else await writeFile(reportCopy, original, { flag: "wx" });
  (summary.genuineReports ??= []).push({
    nodeId: test.nodeId,
    file: reportCopy,
    reportPath: test.resolvedReportPath,
    originalSha256: u2Sha256(original),
    bytes: original.length,
    modifiedAt: metadata.mtimeMs,
    observation: genuine,
  });
  const expectedPass = scenario === "pass" || scenario === "multi";
  assert.equal(test.verification.acceptancePassed, expectedPass);
  assert.equal(run.status, expectedPass ? "Completed" : "Failed");
  assert.equal(test.operation.result.exitCode, scenario === "fail" ? 1 : 0);
  if (scenario === "fail") {
    assert.equal(genuine.counters.failed, 3);
    assert.equal(test.verification.observationValid, true);
    assert.equal(test.verification.outcome, "fail");
  } else if (scenario === "zero") assert.equal(genuine.counters.total, 0);
  else if (scenario === "skipped") {
    assert.equal(genuine.counters.total, 1);
    assert.equal(genuine.counters.executed, 0);
  } else assert.equal(genuine.counters.passed, scenario === "multi" ? 1 : 3);
  if (["source-drift", "build-drift", "zero", "skipped", "missing-required"].includes(scenario))
    assert.notEqual(test.verification.observationValid, true);
  if (scenario === "source-drift")
    assert.match(test.verification.issues.join("\n"), /source.*changed/i);
  if (scenario === "build-drift")
    assert.match(test.verification.issues.join("\n"), /build.*changed/i);
  if (["pass", "fail", "multi"].includes(scenario)) {
    assert.ok(
      test.normalizationReceiptId,
      "Valid genuine observation requires retained normalization proof.",
    );
    const receiptArtifact = run.artifacts.find(
      (artifact) => artifact.id === test.normalizationReceiptId,
    );
    assert.equal(receiptArtifact.validation, "valid");
    const receipt = JSON.parse(await readArtifactUi(window, run, receiptArtifact));
    assert.equal(receipt.version, 1);
    assert.equal(receipt.parserVersion, "dotnet-vstest-trx-v1");
    assert.equal(receipt.operationId, test.operationId);
    assert.equal(receipt.sourceDigest, test.sourceDigest);
    assert.equal(receipt.buildDigest, test.buildDigest);
    assert.deepEqual(receipt.scope, test.recipe.verifier.target);
    assert.equal(receipt.reportId, genuine.runId);
    assert.equal(receipt.original.digest, u2Sha256(original));
    assert.equal(receipt.original.bytes, original.length);
    assert.equal(receipt.original.modifiedAt, metadata.mtimeMs);
    const rawPreview = run.artifacts.find((artifact) => artifact.id === receipt.preview.artifactId);
    const normalized = run.artifacts.find(
      (artifact) => artifact.id === receipt.normalized.artifactId,
    );
    assert.equal(rawPreview.digest, receipt.preview.digest);
    assert.equal(normalized.digest, receipt.normalized.digest);
    assert.equal(normalized.validation, "valid");
    // 合成 fixture 的 TRX 来自已知无敏感字段的 Cases.cs/Adapter.cs（assertU2Preserved
    // 已断言源码等于静态常量），预览必须保持未脱敏。预期 clean 由 fixture 已知内容独立判定，
    // 不依赖产品脱敏输出；若产品误脱敏或 digest 漂移，proof 拒绝而非接受另一分支。
    assertArtifactRedaction(rawPreview, receipt, "clean");
    const normalizedValue = JSON.parse(await readArtifactUi(window, run, normalized));
    assert.equal(normalizedValue.format, "zcode-test-v1");
    assert.equal(normalizedValue.operationId, test.operationId);
    assert.equal(normalizedValue.sourceDigest, test.sourceDigest);
    assert.equal(normalizedValue.buildDigest, test.buildDigest);
    const count = scenario === "multi" ? 1 : 4;
    assert.equal(normalizedValue.tests.length, count);
    assert.equal(new Set(normalizedValue.tests.map((entry) => entry.name)).size, count);
    (summary.normalizationReceipts ??= []).push(receipt);
  }
}
