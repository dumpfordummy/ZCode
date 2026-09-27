import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ADAPTER_SOURCE, GOOD_SOURCE, TEST_CASES, TEST_PROJECT } from "./pre-z8-dotnet-source.mjs";
import { prepareU2Fixture } from "./pre-z8-u2-fixture.mjs";
import { withU2OwnedMutation } from "./pre-z8-u2-fault.mjs";

const repository = fileURLToPath(new URL("../..", import.meta.url));
async function ownedFixture(t) {
  const base = await realpath(path.join(repository, ".tmp"));
  const home = path.join(base, `z1-native-${Date.now()}-${randomUUID().slice(0, 6)}`);
  await mkdir(home);
  const workspace = path.join(home, "workspace");
  await mkdir(workspace);
  const fixture = { home, workspace, env: {} };
  t.after(async () => {
    const exact = await realpath(home);
    assert.equal(path.dirname(exact), base);
    assert.equal(exact, home);
    assert.match(path.basename(exact), /^z1-native-\d+-[a-f0-9]{6}$/);
    await rm(exact, { recursive: true });
  });
  return fixture;
}

test("fresh U2 source seeding reuses genuine assertions without executing a command", async (t) => {
  const fixture = await ownedFixture(t);
  const seeded = await prepareU2Fixture(fixture);
  assert.equal(await readFile(path.join(fixture.workspace, "Cases.cs"), "utf8"), TEST_CASES);
  assert.equal(
    await readFile(path.join(fixture.workspace, "adapter/Adapter.cs"), "utf8"),
    ADAPTER_SOURCE,
  );
  assert.equal(
    await readFile(path.join(fixture.workspace, "Fixture.Tests.csproj"), "utf8"),
    TEST_PROJECT,
  );
  assert.equal(await readFile(path.join(fixture.workspace, "MathOps.cs"), "utf8"), GOOD_SOURCE);
  assert.deepEqual(seeded.commands, []);
  assert.equal(seeded.prerequisite, "NOT RUN");
  assert.ok(seeded.source.files.some((item) => item.path === "Cases.cs"));
  await assert.rejects(readFile(path.join(fixture.workspace, "obj/project.assets.json")), {
    code: "ENOENT",
  });
  assert.equal(fixture.env.NUGET_PACKAGES, path.join(fixture.home, "nuget-packages"));
  await assert.rejects(prepareU2Fixture(fixture), /existing|reused/i);
});

test("seeding refuses pre-existing project bytes instead of replacing them", async (t) => {
  const fixture = await ownedFixture(t);
  const project = path.join(fixture.workspace, "Fixture.Tests.csproj");
  await writeFile(project, "unrelated preserved input");
  await assert.rejects(prepareU2Fixture(fixture), /existing/i);
  assert.equal(await readFile(project, "utf8"), "unrelated preserved input");
});

test("seeding refuses a workspace outside its declared owned home", async (t) => {
  const fixture = await ownedFixture(t);
  await assert.rejects(
    prepareU2Fixture({ ...fixture, workspace: path.dirname(fixture.home) }),
    /workspace|owned/i,
  );
});

test("observed native-boundary source fault restores exact bytes and keeps a receipt", async (t) => {
  const fixture = await ownedFixture(t);
  await prepareU2Fixture(fixture);
  const result = await withU2OwnedMutation(fixture, "source", async (receipt) => {
    assert.notEqual(
      await readFile(path.join(fixture.workspace, "MathOps.cs"), "utf8"),
      GOOD_SOURCE,
    );
    assert.notEqual(receipt.beforeSha256, receipt.mutatedSha256);
    return "observed";
  });
  assert.equal(result.value, "observed");
  assert.equal(result.receipt.restoration, "restored-exact-bytes");
  assert.equal(result.receipt.afterSha256, result.receipt.beforeSha256);
  assert.equal(await readFile(path.join(fixture.workspace, "MathOps.cs"), "utf8"), GOOD_SOURCE);
  assert.equal(await readFile(result.receipt.backupPath, "utf8"), GOOD_SOURCE);
});

test("native-boundary observer failure still restores the source before rejection", async (t) => {
  const fixture = await ownedFixture(t);
  await prepareU2Fixture(fixture);
  await assert.rejects(
    withU2OwnedMutation(fixture, "source", async () => {
      throw new Error("observed failure");
    }),
    /observed failure/,
  );
  assert.equal(await readFile(path.join(fixture.workspace, "MathOps.cs"), "utf8"), GOOD_SOURCE);
});

test("build drift changes only JSON whitespace and restores exact output bytes", async (t) => {
  const fixture = await ownedFixture(t);
  await prepareU2Fixture(fixture);
  const output = path.join(fixture.workspace, "bin/Release/net8.0/Fixture.Tests.deps.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, '{"runtimeTarget":{"name":"synthetic fixture-only"}}');
  const before = await readFile(output);
  const result = await withU2OwnedMutation(fixture, "build", async () => {
    const during = await readFile(output);
    assert.notDeepEqual(during, before);
    assert.deepEqual(JSON.parse(during.toString()), JSON.parse(before.toString()));
  });
  assert.equal(result.receipt.restoration, "restored-exact-bytes");
  assert.deepEqual(await readFile(output), before);
});

test("unexpected concurrent edits survive and retain original backup evidence", async (t) => {
  const fixture = await ownedFixture(t);
  await prepareU2Fixture(fixture);
  let receipt;
  await assert.rejects(
    withU2OwnedMutation(fixture, "source", async (value) => {
      receipt = value;
      await writeFile(path.join(fixture.workspace, "MathOps.cs"), "unexpected concurrent edit");
    }),
    /changed|restore/i,
  );
  assert.equal(
    await readFile(path.join(fixture.workspace, "MathOps.cs"), "utf8"),
    "unexpected concurrent edit",
  );
  assert.equal(await readFile(receipt.backupPath, "utf8"), GOOD_SOURCE);
  const saved = JSON.parse(await readFile(receipt.receiptPath, "utf8"));
  assert.equal(saved.restoration, "refused-concurrent-change");
});
