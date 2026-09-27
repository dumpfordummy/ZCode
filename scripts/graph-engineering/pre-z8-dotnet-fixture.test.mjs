import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseGraphTrxReport } from "../../packages/services/src/graph-engineering/domain/trx-report.ts";
import { BAD_SOURCE, GOOD_SOURCE } from "./pre-z8-dotnet-source.mjs";
import { captureFixtureReport } from "./pre-z8-dotnet-artifact-probe.mjs";
import {
  buildVstestFixture,
  createVstestFixture,
  fingerprint,
  saveFixtureEvidence,
  testVstestFixture as executeVstestFixture,
  verifyFixtureAssociation,
} from "./pre-z8-dotnet-fixture.mjs";

async function testVstestFixture(fixture, build, options) {
  const result = await executeVstestFixture(fixture, build, options);
  const assembly = `bin/Release/${fixture.framework}/${fixture.project.replace(/\.csproj$/, ".dll")}`;
  result.parsedReport = parseGraphTrxReport({
    bytes: await readFile(path.join(fixture.workspace, result.reportPath)),
    target: {
      project: fixture.project,
      configuration: "Release",
      framework: fixture.framework,
      assembly,
      ...(options?.filter ? { filter: options.filter } : {}),
    },
    expectedAssemblyPath: path.join(fixture.workspace, assembly),
    pathCase: process.platform === "win32" ? "insensitive" : "sensitive",
    startedAt: result.command.startedAt,
    completedAt: result.command.finishedAt,
  });
  assert.equal(result.parsedReport.tests.length, result.observation.counters.total);
  for (const [outcome, status] of [
    ["Passed", "passed"],
    ["Failed", "failed"],
    ["NotExecuted", "skipped"],
  ])
    assert.equal(
      result.parsedReport.tests.filter((item) => item.status === status).length,
      result.observation.results.filter((item) => item.outcome === outcome).length,
    );
  return result;
}

test("package-free genuine VSTest emits independently passing and failing TRX", async (t) => {
  const fixture = await createVstestFixture();
  const evidence = { kind: "pre-z8-genuine-vstest", version: 1, cases: [], status: "running" };
  try {
    const original = await fingerprint(fixture, ["Cases.cs", "adapter/Adapter.cs"]);
    const build = await buildVstestFixture(fixture);
    evidence.initialBuild = build;
    for (const assetsPath of ["obj/project.assets.json", "adapter/obj/project.assets.json"]) {
      const assets = JSON.parse(await readFile(path.join(fixture.workspace, assetsPath), "utf8"));
      assert.ok(Object.values(assets.libraries).every((item) => item.type !== "package"));
      assert.deepEqual(assets.project.restore.configFilePaths, [
        path.join(fixture.workspace, "NuGet.Config"),
      ]);
      assert.equal(path.resolve(assets.project.restore.packagesPath), fixture.env.NUGET_PACKAGES);
    }
    assert.deepEqual(await readdir(fixture.env.NUGET_PACKAGES), []);

    let passing, failing;
    await t.test("real assertions pass and an explicitly disabled case stays skipped", async () => {
      passing = await testVstestFixture(fixture, build);
      await verifyFixtureAssociation(fixture, build, passing);
      assert.equal(passing.command.exitCode, 0, passing.command.stderr);
      assert.equal(passing.observation.results.length, 4);
      assert.equal(passing.observation.counters.passed, 3);
      assert.equal(passing.observation.counters.failed, 0);
      // 真实 VSTest 17.11.1 的 notExecuted 汇总恒为零；跳过必须从结果条目及 total/executed 核对。
      assert.equal(passing.observation.counters.executed, 3);
      assert.equal(
        passing.observation.results.filter((item) => item.outcome === "NotExecuted").length,
        1,
      );
      assert.ok(passing.observation.codeBases.every((item) => item.endsWith("Fixture.Tests.dll")));
      assert.ok(passing.command.stdout.includes("net8.0"));
      evidence.cases.push({ name: "pass-and-skip", result: passing });
    });
    await t.test("a filter that matches no tests preserves zero-result evidence", async () => {
      const result = await testVstestFixture(fixture, build, {
        filter: "FullyQualifiedName=PreZ8Fixture.Cases.DoesNotExist",
      });
      await verifyFixtureAssociation(fixture, build, result);
      assert.equal(result.command.exitCode, 0);
      assert.deepEqual(result.observation.results, []);
      assert.equal(result.observation.counters.total, 0);
      evidence.cases.push({ name: "zero-tests-not-adequate", result });
    });
    await t.test("all-skipped selection remains an inadequate test result", async () => {
      const result = await testVstestFixture(fixture, build, {
        filter: "FullyQualifiedName=PreZ8Fixture.Cases.Disabled",
      });
      await verifyFixtureAssociation(fixture, build, result);
      assert.equal(result.command.exitCode, 0);
      assert.equal(result.observation.counters.passed, 0);
      assert.equal(result.observation.counters.total, 1);
      assert.equal(result.observation.counters.executed, 0);
      assert.deepEqual(
        result.observation.results.map((item) => item.outcome),
        ["NotExecuted"],
      );
      evidence.cases.push({ name: "all-skipped-not-adequate", result });
    });
    await t.test(
      "each native invocation owns a new report and preserves earlier bytes",
      async () => {
        const before = await readFile(path.join(fixture.workspace, passing.reportPath));
        const next = await testVstestFixture(fixture, build);
        assert.notEqual(next.operationId, passing.operationId);
        assert.notEqual(next.reportPath, passing.reportPath);
        assert.notEqual(next.observation.runId, passing.observation.runId);
        assert.deepEqual(await readFile(path.join(fixture.workspace, passing.reportPath)), before);
        await assert.rejects(
          testVstestFixture(fixture, build, { operationId: passing.operationId }),
          /already exists/,
        );
        evidence.cases.push({ name: "unique-report-no-overwrite", result: next });
      },
    );
    await t.test(
      "equal assertion names stay scoped to a second project and framework",
      async () => {
        const secondary = await createVstestFixture({
          projectName: "Alternative",
          framework: "net6.0",
        });
        const details = { kind: "pre-z8-vstest-scope", status: "running", cases: [] };
        try {
          const secondaryBuild = await buildVstestFixture(secondary);
          const result = await testVstestFixture(secondary, secondaryBuild);
          await verifyFixtureAssociation(secondary, secondaryBuild, result);
          assert.equal(result.command.exitCode, 0, result.command.stderr);
          assert.equal(result.observation.counters.passed, 3);
          assert.deepEqual(
            result.observation.results.map((item) => item.testName).sort(),
            passing.observation.results.map((item) => item.testName).sort(),
          );
          assert.equal(result.scope.project, "Alternative.Tests.csproj");
          assert.equal(result.scope.framework, "net6.0");
          assert.ok(result.command.stdout.includes("net6.0"));
          assert.ok(
            result.observation.codeBases.every((item) => item.endsWith("Alternative.Tests.dll")),
          );
          assert.notDeepEqual(result.observation.codeBases, passing.observation.codeBases);
          details.cases.push({ name: "second-project-framework", build: secondaryBuild, result });
          details.status = "passed";
          evidence.cases.push({
            name: "project-framework-scope",
            evidencePath: path.join(secondary.home, "evidence.json"),
            result,
          });
        } catch (error) {
          details.status = "failed";
          details.failure = error instanceof Error ? error.stack : String(error);
          throw error;
        } finally {
          await saveFixtureEvidence(secondary, details);
        }
      },
    );
    await t.test("old passing binaries cannot prove source changed after Build", async () => {
      await writeFile(path.join(fixture.workspace, "MathOps.cs"), BAD_SOURCE);
      const result = await testVstestFixture(fixture, build);
      assert.equal(result.command.exitCode, 0);
      assert.equal(result.observation.counters.passed, 3);
      await assert.rejects(verifyFixtureAssociation(fixture, build, result), /Source changed/);
      evidence.cases.push({ name: "stale-source-not-adequate", result });
    });
    await t.test("unchanged independent assertions fail against rebuilt buggy source", async () => {
      const faultyBuild = await buildVstestFixture(fixture);
      const result = (failing = await testVstestFixture(fixture, faultyBuild));
      await verifyFixtureAssociation(fixture, faultyBuild, result);
      assert.equal(result.command.exitCode, 1);
      assert.equal(result.observation.counters.passed, 0);
      assert.equal(result.observation.counters.failed, 3);
      assert.equal(result.observation.counters.executed, 3);
      assert.equal(
        result.observation.results.filter((item) => item.outcome === "NotExecuted").length,
        1,
      );
      assert.ok(result.observation.results.some((item) => item.outcome === "Failed"));
      assert.notEqual(faultyBuild.build.digest, build.build.digest);
      evidence.cases.push({ name: "actual-failed-assertions", build: faultyBuild, result });
      await writeFile(path.join(fixture.workspace, "MathOps.cs"), GOOD_SOURCE);
      await assert.rejects(
        verifyFixtureAssociation(fixture, build, result),
        /Build outputs changed/,
      );
    });
    await t.test(
      "existing artifact store preserves its redaction and integrity boundary",
      async () => {
        const observations = [];
        for (const result of [passing, failing]) {
          assert.ok(result, "Actual passing and failing native reports must exist.");
          observations.push(await captureFixtureReport(fixture, result));
        }
        evidence.cases.push({ name: "existing-artifact-retention", observations });
      },
    );
    assert.deepEqual(await fingerprint(fixture, ["Cases.cs", "adapter/Adapter.cs"]), original);
    assert.deepEqual(await readdir(fixture.env.NUGET_PACKAGES), []);
    // Node 子测试失败不会抛出到父测试；必须核对成功案例数，避免把失败记录误标为通过。
    assert.equal(evidence.cases.length, 8, "Every required experiment case must complete.");
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = error instanceof Error ? error.stack : String(error);
    throw error;
  } finally {
    await saveFixtureEvidence(fixture, evidence);
    console.log(`Genuine VSTest evidence: ${path.join(fixture.home, "evidence.json")}`);
  }
});
