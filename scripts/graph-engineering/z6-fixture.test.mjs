import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { createIsolation, root } from "./isolation.mjs";
import {
  GAME_DOC,
  GOOD_SLOT_SOURCE,
  NORMAL_ONLY_SOURCE,
  REQUIRED_SLOT_TESTS,
  RULE_TESTS,
  SEED_SLOT_SOURCE,
  SLOT_RUNNER,
} from "./z6-slot-source.mjs";
import {
  assertSlotAuthorityUnchanged,
  buildSlotFixture,
  prepareSlotFixture,
  slotRecipes,
  testSlotFixture,
  verifySlotResult,
} from "./z6-fixture.mjs";

test("synthetic GameDoc anchors every fixed edge-case assertion without inferred RTP targets", () => {
  assert.deepEqual(Object.keys(RULE_TESTS), ["R1", "R2", "R3", "R4", "R5"]);
  for (const [rule, names] of Object.entries(RULE_TESTS)) {
    assert.ok(GAME_DOC.includes(`## ${rule}`));
    assert.ok(names.length > 0);
    for (const name of names) assert.ok(SLOT_RUNNER.includes(`Check("${name}"`));
  }
  assert.deepEqual(
    [...new Set(Object.values(RULE_TESTS).flat())].sort(),
    [...REQUIRED_SLOT_TESTS].sort(),
  );
  assert.ok(GAME_DOC.includes("Bonus and Respin are not present"));
  assert.ok(GAME_DOC.includes("No RTP target"));
});

test("manual recipe helper only prints unless independent verification is explicitly requested", async () => {
  const isolation = await createIsolation({ manual: true });
  try {
    const fixture = await prepareSlotFixture(isolation);
    await writeFile(path.join(isolation.home, "z6-manual-fixture.json"), JSON.stringify(fixture));
    const invoke = (args) =>
      promisify(execFile)(
        process.execPath,
        [
          path.join(root, "scripts/graph-engineering/z6-manual-recipes.mjs"),
          "--profile",
          isolation.home,
          ...args,
        ],
        { cwd: root, env: isolation.env, windowsHide: true },
      );
    assert.deepEqual(JSON.parse((await invoke([])).stdout), slotRecipes("build"));
    assert.equal(
      await readFile(path.join(isolation.workspace, "SlotRules.cs"), "utf8"),
      SEED_SLOT_SOURCE,
    );
    await writeFile(path.join(isolation.workspace, "SlotRules.cs"), GOOD_SLOT_SOURCE);
    const build = await buildSlotFixture(isolation);
    const result = JSON.parse((await invoke(["--verify"])).stdout);
    await verifySlotResult(isolation, build, result);
    assert.equal(isolation.fixture.requests.length, 0);
    await writeFile(
      path.join(isolation.home, "z6-manual-helper-proof.json"),
      JSON.stringify({ status: "PASS", build, result, modelRequests: 0 }, null, 2),
    );
  } finally {
    await isolation.close();
  }
});

test("independent native C# edge cases fail seeded defects and pass only after sequential fixes", async () => {
  const isolation = await createIsolation({ noProvider: true });
  try {
    const fixture = await prepareSlotFixture(isolation);
    const stages = [];
    for (const source of [SEED_SLOT_SOURCE, NORMAL_ONLY_SOURCE, GOOD_SLOT_SOURCE]) {
      await writeFile(path.join(isolation.workspace, "SlotRules.cs"), source);
      const build = await buildSlotFixture(isolation);
      const execution = await testSlotFixture(isolation, build);
      assert.deepEqual(
        execution.report.tests.map((item) => item.name).sort(),
        [...REQUIRED_SLOT_TESTS].sort(),
      );
      const passed = execution.report.tests.filter((item) => item.status === "passed").length;
      assert.equal(execution.command.exitCode, source === GOOD_SLOT_SOURCE ? 0 : 1);
      if (source === GOOD_SLOT_SOURCE) await verifySlotResult(isolation, build, execution);
      else assert.ok(passed < REQUIRED_SLOT_TESTS.length);
      await assertSlotAuthorityUnchanged(isolation);
      stages.push({ passed, build, execution });
    }
    assert.ok(stages[1].passed > stages[0].passed);
    assert.ok(stages[2].passed > stages[1].passed);
    assert.equal(stages[2].passed, REQUIRED_SLOT_TESTS.length);
    assert.equal(new Set(stages.map((item) => item.build.source.digest)).size, 3);
    assert.equal(new Set(stages.map((item) => item.execution.operationId)).size, 3);
    assert.equal(await readFile(path.join(isolation.workspace, "GameDoc.md"), "utf8"), GAME_DOC);
    await writeFile(
      path.join(isolation.home, "z6-independent-slot.json"),
      JSON.stringify({ fixture, stages }, null, 2),
    );
  } finally {
    await isolation.close();
  }
});
