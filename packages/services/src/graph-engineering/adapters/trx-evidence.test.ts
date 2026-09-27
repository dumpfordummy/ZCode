import assert from "node:assert/strict";
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import type { GraphToolAttempt } from "../contract.js";
import { createGraphReportCapture } from "./trx-capture.js";
import { trxAttemptRecordErrors, validateTrxReceipt } from "../domain/trx-receipt.js";
import { captureToolReport } from "../app/tool-report-evidence.js";
import { hash, operation, trxEvidenceFixture } from "./trx-evidence.fixture.js";

test("passing structured observations keep raw preview incomplete and bind exact immutable receipt", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.prepare();
  await f.finish();
  assert.equal(f.check.status, "Completed");
  assert.equal(f.check.verification?.acceptancePassed, true);
  assert.equal(f.check.verification?.observationValid, true);
  const raw = await f.retained("reports/{operationId}/results.trx"),
    normalized = await f.retained("normalized-report");
  const receipt = JSON.parse((await f.retained("normalization")).content);
  assert.equal(raw.artifact.validation, "incomplete");
  assert.equal(raw.artifact.redacted, true);
  assert.equal(normalized.artifact.validation, "valid");
  assert.equal(receipt.original.digest, hash(f.capture().content));
  assert.notEqual(receipt.original.digest, raw.artifact.digest);
  assert.equal(receipt.preview.digest, raw.artifact.digest);
  assert.equal(receipt.normalized.digest, normalized.artifact.digest);
  assert.deepEqual(trxAttemptRecordErrors(f.run, f.check), []);
  for (const selector of ["test", "verification", "normalized-report", "normalization"])
    await f.cold().read(structuredClone(f.run), f.selector(selector)!);
  assert.equal(
    f.captures(),
    1,
    "Cold reading cannot replay native execution or reconstruct capture.",
  );
});

test("complete failed assertions yield valid failure observation but never accepted success", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.prepare();
  f.capture().report!.tests[0]!.status = "failed";
  f.check.operation = operation(f.check, 1);
  await f.finish();
  assert.equal(f.check.status, "Failed");
  assert.equal(f.check.verification?.acceptancePassed, false);
  assert.equal(f.check.verification?.observationValid, true);
  assert.equal(f.check.verification?.outcome, "fail");
  assert.ok(f.check.normalizationReceiptId);
  assert.equal((await f.retained("verification")).artifact.validation, "valid");
  await f.artifacts.binding(
    f.run,
    { kind: "artifact", nodeId: "test", selector: "verification" },
    "failure",
  );
});

const unsafeNative: Array<[string, (attempt: GraphToolAttempt) => void]> = [
  [
    "nonzero exit with passing assertions",
    (attempt) => {
      attempt.operation = operation(attempt, 1);
    },
  ],
  [
    "missing process exit observation",
    (attempt) => {
      attempt.operation!.result!.processExitObserved = false;
    },
  ],
  [
    "not started",
    (attempt) => {
      attempt.operation!.processStarted = false;
    },
  ],
  [
    "crash signal",
    (attempt) => {
      attempt.operation!.result!.signal = "SIGSEGV";
    },
  ],
  [
    "cancelled",
    (attempt) => {
      attempt.operation!.result!.cancelled = true;
    },
  ],
  [
    "timeout",
    (attempt) => {
      attempt.operation!.result!.timedOut = true;
    },
  ],
  [
    "truncated stdout",
    (attempt) => {
      attempt.operation!.result!.stdout.truncated = true;
    },
  ],
  [
    "truncated stderr",
    (attempt) => {
      attempt.operation!.result!.stderr.truncated = true;
    },
  ],
  [
    "unknown operation",
    (attempt) => {
      attempt.operation!.status = "unknown";
    },
  ],
  [
    "spawn error",
    (attempt) => {
      attempt.operation!.result!.status = "spawn_error";
    },
  ],
];
for (const [name, mutate] of unsafeNative)
  test(`native ${name} denies accepted or repair-authorizing TRX evidence`, async (t) => {
    const f = await trxEvidenceFixture(t);
    await f.prepare();
    mutate(f.check);
    await f.finish();
    assert.equal(f.check.verification?.acceptancePassed, false);
    assert.notEqual(f.check.verification?.observationValid, true);
    assert.equal(f.check.normalizationReceiptId, undefined);
  });

test("zero, all-skipped, missing-required, duplicate and invalid capture cannot authorize repair", async (t) => {
  for (const kind of ["zero", "skipped", "missing", "duplicate", "invalid"]) {
    const f = await trxEvidenceFixture(t);
    await f.prepare();
    const report = f.capture().report!;
    if (kind === "zero") report.tests = [];
    if (kind === "skipped") for (const item of report.tests) item.status = "skipped";
    if (kind === "missing") report.tests[0]!.name = "not-required";
    if (kind === "duplicate") report.tests[1]!.name = report.tests[0]!.name;
    if (kind === "invalid")
      f.setCapture({
        ...f.capture(),
        report: undefined,
        issue: "Rejected invalid XML/old report by trusted capture.",
      });
    await f.finish();
    assert.equal(f.check.verification?.acceptancePassed, false, kind);
    assert.notEqual(f.check.verification?.observationValid, true, kind);
    assert.equal(f.check.normalizationReceiptId, undefined, kind);
  }
});

test("pre-existing report is rejected before dispatch at the unique resolved operation path", async (t) => {
  const f = await trxEvidenceFixture(t),
    path = join(f.target.workspacePath, "reports/test-operation/results.trx");
  await mkdir(dirname(path));
  await writeFile(path, "old owned report");
  await assert.rejects(f.prepare(), /already exists/);
  assert.equal(f.captures(), 0);
});

for (const file of ["MathOps.cs", "bin/Fixture.Tests.dll"])
  for (const when of ["before finish", "during capture"])
    test(`${file} mutation ${when} denies stale report authority`, async (t) => {
      const f = await trxEvidenceFixture(t);
      await f.prepare();
      if (when === "before finish") await f.mutate(file, "changed");
      else f.duringCapture(() => f.mutate(file, "changed"));
      await f.finish();
      assert.equal(f.check.verification?.acceptancePassed, false);
      assert.notEqual(f.check.verification?.observationValid, true);
      assert.equal(f.check.normalizationReceiptId, undefined);
    });

test("redaction of normalized assertion identities cannot yield valid evidence", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.prepare();
  const name = "token=ONLY_SYNTHETIC_SECRET";
  f.capture().report!.tests[0]!.name = name;
  if (f.check.recipe.verifier.kind !== "test") throw new Error("Test verifier missing.");
  f.check.recipe.verifier.requiredTests[0] = name;
  await f.finish();
  assert.notEqual(f.check.verification?.observationValid, true);
  assert.equal(f.check.verification?.acceptancePassed, false);
  assert.equal(f.check.normalizationReceiptId, undefined);
});

test("captureToolReport cannot mint a receipt without native authority", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.prepare();
  const result = await captureToolReport(f.state, f.artifacts, f.run, f.check, false);
  assert.equal(result.report.validation, "invalid");
  assert.equal(f.check.normalizationReceiptId, undefined);
});

for (const selector of ["test", "verification", "normalized-report", "normalization"])
  for (const damage of [
    "missing reference",
    "missing receipt file",
    "corrupt receipt",
    "corrupt preview",
    "corrupt normalized",
  ])
    test(`cold ${selector} read rejects ${damage}`, async (t) => {
      const f = await trxEvidenceFixture(t);
      await f.prepare();
      await f.finish();
      const id = f.selector(selector)!,
        run = structuredClone(f.run),
        attempt = run.toolAttempts![1]!;
      if (damage === "missing reference") delete attempt.normalizationReceiptId;
      if (damage === "missing receipt file") await rm(f.file(f.check.normalizationReceiptId!));
      if (damage === "corrupt receipt")
        await f.tamper(f.check.normalizationReceiptId!, (value) => {
          value.content += " ";
        });
      if (damage === "corrupt preview")
        await f.tamper(f.selector("reports/{operationId}/results.trx")!, (value) => {
          value.content += "changed";
        });
      if (damage === "corrupt normalized")
        await f.tamper(f.selector("normalized-report")!, (value) => {
          value.content = value.content.replace('"passed"', '"failed"');
        });
      await assert.rejects(f.cold().read(run, id), /receipt|digest|normalization|ENOENT/i);
    });

test("completed cold record requires exact receipt metadata and unique operation path", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.prepare();
  await f.finish();
  const original = structuredClone(f.run);
  for (const mutate of [
    (attempt: GraphToolAttempt) => {
      delete attempt.normalizationReceiptId;
    },
    (attempt: GraphToolAttempt) => {
      attempt.resolvedReportPath = "reports/old/results.trx";
    },
    (attempt: GraphToolAttempt) => {
      attempt.beforeReportDigest = hash("old");
    },
  ]) {
    const run = structuredClone(original),
      attempt = run.toolAttempts![1]!;
    mutate(attempt);
    assert.ok(trxAttemptRecordErrors(run, attempt).length);
  }
});

test("receipt semantic checks bind invocation, source, Build, scope, original time and artifacts", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.prepare();
  await f.finish();
  const receipt = JSON.parse((await f.retained("normalization")).content);
  for (const changed of [
    { ...receipt, operationId: "old-operation" },
    { ...receipt, sourceDigest: hash("old-source") },
    { ...receipt, buildDigest: hash("old-build") },
    { ...receipt, scope: { ...receipt.scope, framework: "net6.0" } },
    { ...receipt, original: { ...receipt.original, modifiedAt: 100 } },
    { ...receipt, original: { ...receipt.original, modifiedAt: 9000 } },
    { ...receipt, original: { ...receipt.original, bytes: 0 } },
    { ...receipt, normalized: { ...receipt.normalized, digest: hash("other") } },
    { ...receipt, normalized: receipt.preview },
  ])
    assert.throws(() => validateTrxReceipt(changed, f.run, f.check));
});

test("dotnet Build trusts structured process facts while output privacy remains incomplete", async (t) => {
  const f = await trxEvidenceFixture(t);
  await f.evidence.finish(f.run, f.build);
  assert.equal(f.build.verification?.acceptancePassed, true);
  assert.equal((await f.retained("command", "build")).artifact.validation, "valid");
  const preview = await f.retained("command-output", "build");
  assert.equal(preview.artifact.validation, "incomplete");
  assert.equal(preview.artifact.redacted, true);
  assert.doesNotMatch(preview.content, /ONLY_SYNTHETIC_SECRET/);
});

for (const flag of ["cancelled", "timedOut", "signal"] as const)
  test(`dotnet Build cannot convert contradictory ${flag} into success`, async (t) => {
    const f = await trxEvidenceFixture(t);
    if (flag === "signal") f.build.operation!.result!.signal = "SIGSEGV";
    else f.build.operation!.result![flag] = true;
    await f.evidence.finish(f.run, f.build);
    assert.equal(f.build.verification?.acceptancePassed, false, flag);
  });

for (const exitCode of [-1073741819, 3221225477, 2, 137])
  test(`unsupported TRX exit ${exitCode} cannot authorize repair from a complete failed report`, async (t) => {
    const f = await trxEvidenceFixture(t);
    await f.prepare();
    f.capture().report!.tests[0]!.status = "failed";
    f.check.operation = operation(f.check, exitCode);
    await f.finish();
    assert.equal(f.check.verification?.acceptancePassed, false);
    assert.notEqual(f.check.verification?.observationValid, true);
    assert.equal(f.check.normalizationReceiptId, undefined);
  });

test("dotnet Build outputs dated after native completion cannot establish freshness", async (t) => {
  const f = await trxEvidenceFixture(t);
  await utimes(join(f.target.workspacePath, "bin/Fixture.Tests.dll"), 8, 8);
  await f.evidence.finish(f.run, f.build);
  assert.equal(f.build.verification?.acceptancePassed, false);
});

test("genuine parsed assertions feed unit-simulated native/source/Build authority without execution", async (t) => {
  const manifestPath = process.env.PRE_Z8_TRX_FIXTURE_MANIFEST;
  if (!manifestPath) {
    t.skip(
      "Provide an owned genuine TRX fixture manifest for replay; this test executes no command.",
    );
    return;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.kind, "pre-z8-genuine-vstest");
  assert.equal(manifest.status, "passed");
  assert.equal(resolve(manifest.fixtureHome), dirname(resolve(manifestPath)));
  assert.deepEqual(
    JSON.parse(await readFile(join(manifest.fixtureHome, "fixture-owner.json"), "utf8")),
    { kind: "pre-z8-dotnet", version: 1 },
  );
  for (const name of ["pass-and-skip", "actual-failed-assertions"]) {
    const original = manifest.cases.find((item: { name: string }) => item.name === name).result;
    const assembly = `bin/Release/${original.scope.framework}/${original.scope.project.replace(/\.csproj$/, ".dll")}`;
    const scope = {
      project: original.scope.project,
      configuration: original.scope.configuration,
      framework: original.scope.framework,
      assembly,
    };
    const captured = await createGraphReportCapture().captureTrx(
      { workspacePath: original.command.cwd },
      original.reportPath,
      scope,
      original.command.startedAt,
      original.command.finishedAt,
    );
    assert.equal(captured.issue, undefined);
    assert.equal(captured.original.digest, original.reportDigest);
    // The original bytes and parsing are genuine; the native/source/Build authority below is
    // deliberately simulated unit input, not another native Graph acceptance receipt.
    const f = await trxEvidenceFixture(t);
    f.setCapture(captured);
    if (
      f.check.recipe.verifier.kind !== "test" ||
      f.check.recipe.verifier.format !== "dotnet-vstest-trx-v1"
    )
      throw new Error("TRX verifier missing.");
    Object.assign(f.check.recipe.verifier, {
      target: scope,
      minimumTests: 4,
      expectedTests: 4,
      requiredTests: captured
        .report!.tests.filter((item) => item.status !== "skipped")
        .map((item) => item.name),
    });
    await mkdir(dirname(join(f.target.workspacePath, assembly)), { recursive: true });
    await writeFile(join(f.target.workspacePath, assembly), "simulated captured Build bytes");
    f.build.recipe.expectedOutputs = [assembly];
    f.build.outputDigest = (await f.options.recipes!.fingerprint(f.target, [assembly])).digest;
    await f.prepare();
    f.check.operation = operation(f.check, original.command.exitCode);
    f.check.operation.startedAt = original.command.startedAt;
    f.check.operation.completedAt = original.command.finishedAt;
    await f.finish();
    assert.equal(f.check.verification?.observationValid, true, name);
    assert.equal(f.check.verification?.outcome, name === "pass-and-skip" ? "pass" : "fail");
    assert.equal(f.check.verification?.acceptancePassed, name === "pass-and-skip");
    await f.retained("verification");
  }
});
