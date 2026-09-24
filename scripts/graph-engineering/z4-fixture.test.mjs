import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { createIsolation } from "./isolation.mjs";
import { BAD_SOURCE, GOOD_SOURCE, REQUIRED_TESTS } from "./z4-csharp-source.mjs";
import {
  buildFixture,
  prepareCSharpFixture,
  testFixture,
  verifyFixtureResult,
} from "./z4-fixture.mjs";

test("real isolated C# processes distinguish passing assertions from invalid evidence", async (t) => {
  const isolation = await createIsolation({ noProvider: true });
  const evidence = { profile: isolation.home, cases: [] };
  try {
    const initial = await prepareCSharpFixture(isolation);
    const proof = await buildFixture(isolation);
    evidence.positiveBuild = proof;
    const assets = JSON.parse(
      await readFile(path.join(isolation.workspace, "obj/project.assets.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(assets.libraries), []);
    assert.deepEqual(assets.project.restore.configFilePaths, [
      path.join(isolation.workspace, "NuGet.Config"),
    ]);
    assert.equal(path.resolve(assets.project.restore.packagesPath), isolation.env.NUGET_PACKAGES);
    await t.test(
      "three known assertions genuinely pass with an offline no-package build",
      async () => {
        const result = await testFixture(isolation, proof);
        await verifyFixtureResult(isolation, proof, result);
        assert.equal(result.command.exitCode, 0);
        assert.deepEqual(
          result.report.tests,
          REQUIRED_TESTS.map((name) => ({ name, status: "passed" })),
        );
        evidence.cases.push({ name: "positive", result });
      },
    );
    await t.test(
      "actual zero-test and missing-report processes do not become passing evidence",
      async () => {
        for (const flag of ["--zero", "--omit-report"]) {
          const result = await testFixture(isolation, proof, { extraArgs: [flag] });
          assert.equal(result.command.exitCode, 0);
          await assert.rejects(verifyFixtureResult(isolation, proof, result));
          if (flag === "--zero") assert.deepEqual(result.report.tests, []);
          else assert.equal(result.report, undefined);
          evidence.cases.push({ name: flag.slice(2), result });
        }
      },
    );
    await t.test(
      "a genuine earlier report cannot satisfy a later process that omits its report",
      async () => {
        const first = await testFixture(isolation, proof, {
          operationId: "earlier-operation",
          reportPath: "results/stale.json",
        });
        await verifyFixtureResult(isolation, proof, first);
        const later = await testFixture(isolation, proof, {
          operationId: "later-operation",
          reportPath: "results/stale.json",
          extraArgs: ["--omit-report"],
        });
        assert.equal(later.command.exitCode, 0);
        assert.deepEqual(later.report, first.report);
        await assert.rejects(
          verifyFixtureResult(isolation, proof, later),
          /Stale report operation/,
        );
        evidence.cases.push({ name: "stale", first, later });
      },
    );
    await t.test(
      "real tests of an old passing binary cannot verify subsequently changed source",
      async () => {
        await writeFile(path.join(isolation.workspace, "MathOps.cs"), BAD_SOURCE);
        const result = await testFixture(isolation, proof);
        assert.equal(result.command.exitCode, 0);
        assert.ok(result.report.tests.every((item) => item.status === "passed"));
        await assert.rejects(
          verifyFixtureResult(isolation, proof, result),
          /Source changed after Build/,
        );
        evidence.cases.push({ name: "wrong-source", result });
        await writeFile(path.join(isolation.workspace, "MathOps.cs"), GOOD_SOURCE);
      },
    );
    await t.test(
      "exact owned C# child starts and is cancelled without process-name termination",
      async () => {
        const controller = new AbortController();
        let child, closed;
        const pending = testFixture(isolation, proof, {
          operationId: "held-operation",
          extraArgs: ["--hold", "--ready-file", "results/ready.json"],
          signal: controller.signal,
          onSpawn: (value) => {
            child = value;
            closed = new Promise((resolve) =>
              child.once("close", (code, signal) => resolve({ code, signal })),
            );
          },
        });
        const outcome = pending.then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        try {
          const deadline = Date.now() + 30000;
          let receipt;
          while (Date.now() < deadline && !receipt) {
            receipt = await readFile(path.join(isolation.workspace, "results/ready.json"), "utf8")
              .then(JSON.parse)
              .catch((error) => {
                if (error.code !== "ENOENT") throw error;
              });
            if (!receipt) await wait(25);
          }
          assert.equal(receipt?.state, "actual-process-started");
          assert.equal(receipt.processId, child.pid);
          controller.abort();
          const exit = await closed;
          const result = await outcome;
          assert.equal(result.error?.name, "AbortError");
          evidence.cases.push({ name: "owned-child-cancel", receipt, exit });
        } finally {
          controller.abort();
          await outcome;
          await closed;
        }
      },
    );
    await t.test("genuine failed assertions and a different build remain failures", async () => {
      await writeFile(path.join(isolation.workspace, "MathOps.cs"), BAD_SOURCE);
      const faulty = await buildFixture(isolation);
      const result = await testFixture(isolation, faulty);
      assert.equal(result.command.exitCode, 1);
      assert.equal(result.report.tests.length, 3);
      assert.ok(result.report.tests.every((item) => item.status === "failed"));
      await assert.rejects(
        verifyFixtureResult(isolation, faulty, result),
        /Actual test process failed/,
      );
      evidence.cases.push({ name: "actual-failed-tests", build: faulty, result });
      await writeFile(path.join(isolation.workspace, "MathOps.cs"), GOOD_SOURCE);
      const wrongBuild = await testFixture(isolation, proof);
      await assert.rejects(
        verifyFixtureResult(isolation, proof, wrongBuild),
        /Build outputs changed/,
      );
      evidence.cases.push({ name: "wrong-build", result: wrongBuild });
    });
    assert.equal(
      await readFile(path.join(isolation.workspace, "Runner.cs"), "utf8"),
      await import("./z4-csharp-source.mjs").then((module) => module.RUNNER),
    );
    assert.deepEqual(isolation.fixture.requests, []);
    evidence.runnerDigest = initial.runnerDigest;
  } finally {
    await writeFile(
      path.join(isolation.home, "z4-fixture-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log(`C# fixture evidence: ${path.join(isolation.home, "z4-fixture-evidence.json")}`);
    await isolation.close();
  }
});
