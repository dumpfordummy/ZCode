import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGraphRecipeStore } from "./recipes.js";
import { validateGraphRecipes } from "../domain/artifact-schemas.js";
import { assertWorkspaceFilePath } from "./artifact-files.js";
import type { GraphRecipe } from "../artifact-types.js";

const recipe: GraphRecipe = {
  id: "build",
  name: "Build",
  executable: "dotnet",
  args: ["build"],
  cwd: ".",
  timeoutMs: 60000,
  sourcePaths: ["fixture.csproj"],
  expectedOutputs: ["bin/fixture.dll"],
  verifier: { kind: "build" },
};
test("project recipe writes preserve unrelated keys and reject stale/concurrent revisions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "z4-recipe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: root },
    store = createGraphRecipeStore();
  assert.deepEqual((await store.read(target)).recipes, []);
  await mkdir(join(root, ".zcode"));
  await writeFile(
    join(root, ".zcode", "config.json"),
    JSON.stringify({ unrelated: { keep: true } }),
  );
  const before = await store.read(target),
    saved = await store.save(target, [recipe], before.digest);
  assert.deepEqual((await store.read(target)).recipes, [recipe]);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, ".zcode", "config.json"), "utf8")).unrelated,
    { keep: true },
  );
  await assert.rejects(store.save(target, [], before.digest), /changed/);
  const results = await Promise.allSettled([
    store.save(target, [], saved.digest),
    store.save(target, [{ ...recipe, name: "Changed" }], saved.digest),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});
test("recipe schema rejects shell recipes, unsafe paths, duplicated IDs, zero test contracts and unknown placeholders", () => {
  for (const bad of [
    { ...recipe, executable: "powershell.exe" },
    { ...recipe, cwd: "../elsewhere" },
    { ...recipe, expectedOutputs: ["C:/file"] },
    { ...recipe, args: ["{modelExecutable}"] },
    { ...recipe, id: "a".repeat(129) },
    { ...recipe, timeoutMs: 600001 },
    { ...recipe, expectedOutputs: ["command"] },
    { ...recipe, expectedOutputs: ["test"] },
    {
      ...recipe,
      verifier: {
        kind: "test",
        format: "zcode-json-v1",
        reportPath: "report.json",
        minimumTests: 0,
        requiredTests: [],
        buildNodeId: "build",
      },
    },
  ])
    assert.throws(() => validateGraphRecipes([bad]));
  assert.throws(() => validateGraphRecipes([recipe, recipe]));
  const testRecipe = {
    ...recipe,
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      reportPath: "results.json",
      minimumTests: 1,
      expectedTests: 1,
      requiredTests: ["known"],
      buildNodeId: "build",
    },
  };
  for (const bad of [
    { ...testRecipe, expectedOutputs: ["results.json"] },
    { ...testRecipe, verifier: { ...testRecipe.verifier, reportPath: "command" } },
    { ...testRecipe, verifier: { ...testRecipe.verifier, reportPath: "test" } },
    {
      ...testRecipe,
      verifier: { ...testRecipe.verifier, minimumTests: 1001, expectedTests: 1001 },
    },
  ])
    assert.throws(() => validateGraphRecipes([bad]));
  assert.deepEqual(
    validateGraphRecipes([
      {
        ...recipe,
        args: ["--operation", "{operationId}"],
        redactEnvironmentVariables: ["Z4_SYNTHETIC_SECRET"],
      },
    ])[0]?.redactEnvironmentVariables,
    ["Z4_SYNTHETIC_SECRET"],
  );
});
test("missing output preflight checks existing ancestors and project config links", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "z4-recipe-path-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace"),
    outside = join(root, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  const target = { workspacePath: workspace };
  assert.equal(
    (await assertWorkspaceFilePath(target, "new/build/report.json", true)).exists,
    false,
  );
  await symlink(
    outside,
    join(workspace, ".zcode"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(createGraphRecipeStore().read(target), /link|reparse/);
  await assert.rejects(
    assertWorkspaceFilePath(target, ".zcode/new/report.json", true),
    /link|reparse/,
  );
});
