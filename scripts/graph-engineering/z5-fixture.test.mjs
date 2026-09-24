import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import { createIsolation, root } from "./isolation.mjs";
import { buildFixture, testFixture, verifyFixtureResult } from "./z4-fixture.mjs";
import { REQUIRED_TESTS } from "./z4-csharp-source.mjs";
import {
  assertRunnerUnchanged,
  GOOD_SOURCE,
  INITIAL_SOURCE,
  PARTIAL_SOURCE,
  SEED_SOURCE,
  permanentSource,
  prepareZ5Fixture,
  repairedSource,
} from "./z5-fixture.mjs";

test("independent C# assertions require two distinct repairs and preserve immutable tests", async () => {
  const isolation = await createIsolation({ noProvider: true });
  try {
    await prepareZ5Fixture(isolation);
    const stages = [];
    for (const [source, passed] of [
      [INITIAL_SOURCE, 0],
      [PARTIAL_SOURCE, 2],
      [GOOD_SOURCE, 3],
    ]) {
      await writeFile(path.join(isolation.workspace, "MathOps.cs"), source);
      const build = await buildFixture(isolation);
      const execution = await testFixture(isolation, build);
      assert.equal(execution.command.exitCode, passed === 3 ? 0 : 1);
      assert.deepEqual(
        execution.report.tests.map((item) => item.name),
        REQUIRED_TESTS,
      );
      assert.equal(
        execution.report.tests.filter((item) => item.status === "passed").length,
        passed,
      );
      await assertRunnerUnchanged(isolation);
      if (passed === 3) await verifyFixtureResult(isolation, build, execution);
      stages.push({ source, build, execution });
    }
    assert.equal(new Set(stages.map((item) => item.build.source.digest)).size, 3);
    assert.equal(new Set(stages.map((item) => item.build.build.digest)).size, 3);
    assert.equal(new Set(stages.map((item) => item.execution.operationId)).size, 3);
    await writeFile(
      path.join(isolation.home, "z5-independent-repairs.json"),
      JSON.stringify(stages, null, 2),
    );
  } finally {
    await isolation.close();
  }
});

test("permanent fault remains genuine failure while no-progress source remains identical", async () => {
  const isolation = await createIsolation({ noProvider: true });
  try {
    await prepareZ5Fixture(isolation);
    assert.equal(repairedSource(INITIAL_SOURCE, "no-progress"), INITIAL_SOURCE);
    const stages = [];
    for (const offset of [1, 2, 3]) {
      const source = permanentSource(offset);
      await writeFile(path.join(isolation.workspace, "MathOps.cs"), source);
      const build = await buildFixture(isolation);
      const execution = await testFixture(isolation, build);
      assert.equal(execution.command.exitCode, 1);
      assert.equal(execution.report.tests.filter((item) => item.status === "failed").length, 3);
      await assertRunnerUnchanged(isolation);
      stages.push({ build, execution });
    }
    assert.equal(repairedSource(INITIAL_SOURCE, "exhausted"), permanentSource(2));
    assert.equal(new Set(stages.map((item) => item.execution.report.tests[0].message)).size, 3);
    await writeFile(
      path.join(isolation.home, "z5-independent-exhaustion.json"),
      JSON.stringify(stages, null, 2),
    );
  } finally {
    await isolation.close();
  }
});

test("manual recipe helper prints exact Build identity and independently executes the unchanged runner", async () => {
  const isolation = await createIsolation({ manual: true });
  try {
    const original = await prepareZ5Fixture(isolation);
    await writeFile(path.join(isolation.home, "z5-manual-fixture.json"), JSON.stringify(original));
    const script = path.join(root, "scripts/graph-engineering/z5-manual-recipes.mjs");
    const invoke = (args) =>
      promisify(execFile)(process.execPath, [script, "--profile", isolation.home, ...args], {
        cwd: root,
        env: isolation.env,
        windowsHide: true,
      });
    const printed = JSON.parse(
      (await invoke(["--build-node-id", "exact-visible-build-id"])).stdout,
    );
    assert.equal(
      printed.find((item) => item.id === "fixture-test").verifier.buildNodeId,
      "exact-visible-build-id",
    );
    assert.equal(await readFile(path.join(isolation.workspace, "MathOps.cs"), "utf8"), SEED_SOURCE);
    await writeFile(path.join(isolation.workspace, "MathOps.cs"), GOOD_SOURCE);
    const build = await buildFixture(isolation);
    const verified = JSON.parse((await invoke(["--verify"])).stdout);
    await verifyFixtureResult(isolation, build, verified);
    await assertRunnerUnchanged(isolation);
    assert.equal(isolation.fixture.requests.length, 0);
    await writeFile(
      path.join(isolation.home, "z5-manual-helper-proof.json"),
      JSON.stringify(
        {
          status: "PASS",
          printed,
          build,
          verified,
          modelRequests: 0,
          note: "Independent fixture helper check; no app, agent input or user-operated check.",
        },
        null,
        2,
      ),
    );
  } finally {
    await isolation.close();
  }
});
