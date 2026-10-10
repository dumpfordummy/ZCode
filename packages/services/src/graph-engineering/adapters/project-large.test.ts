import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectDiscovery } from "./project-discovery.js";
import { createGraphRecipeStore } from "./recipes.js";
import { fingerprintDeclaredFiles } from "./artifact-files.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { largeProjectFixture, literalProject } from "./project-large.fixture.js";
import { PROJECT_INVENTORY_BUDGET, PROJECT_SCOPE_BUDGET } from "../domain/project-budgets.js";

test(
  "100-project large solution: complete 5,000-source scope, compact save/reload, content and membership freshness",
  { timeout: 240000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "u3-large-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const workload = await largeProjectFixture(root);
    assert.ok(workload.solutionBytes >= 256 * 1024);
    const target = { workspacePath: root },
      scanner = createProjectDiscovery();
    const start = performance.now();
    const inventory = await scanner.scan(target, "inventory");
    assert.equal(inventory.status, "complete", inventory.issues.join("\n"));
    assert.equal(inventory.metadata.length, 101);
    assert.ok(inventory.metadata.reduce((sum, file) => sum + file.bytes, 0) > 512 * 1024);
    assert.ok(inventory.candidates.every((candidate) => candidate.sourcePaths.length === 0));
    const prepared = await scanner.scan(target, "selected", { selectedProject: "Large.sln" });
    assert.equal(prepared.status, "complete", prepared.issues.join("\n"));
    assert.equal(prepared.prepared?.scope.sourceCount, 5101);
    assert.equal(prepared.prepared?.sourcePaths.length, 5101);
    const recipes = compileDotnetRecipes({
      idPrefix: "large",
      executable: "dotnet",
      cwd: ".",
      timeoutMs: 120000,
      buildProject: "Large.sln",
      configuration: "Debug",
      sourcePaths: [],
      sourceScope: prepared.prepared!.scope,
      expectedOutputs: ["P000/bin/Debug/net8.0/P000.dll"],
      reviewedManifest: true,
      tests: [
        {
          project: "P000/P000.csproj",
          configuration: "Debug",
          framework: "net8.0",
          assembly: "P000/bin/Debug/net8.0/P000.dll",
          minimumTests: 1,
          requiredTests: [],
        },
      ],
    });
    assert.ok(Buffer.byteLength(JSON.stringify(recipes)) < 4000);
    const store = createGraphRecipeStore(),
      original = await store.read(target);
    const saved = await store.save(target, recipes, original.digest);
    assert.deepEqual(await createGraphRecipeStore().read(target), saved);
    const fingerprint = () =>
      store.fingerprint(target, recipes[0]!.sourcePaths, [prepared.prepared!.scope]);
    const first = await fingerprint();
    assert.equal(first.files.length, 5101);
    await writeFile(join(root, "P099/C40.cs"), "// changed outside former first 32 inputs");
    assert.notEqual((await fingerprint()).digest, first.digest);
    await writeFile(join(root, "P099/Added.cs"), "// new build input");
    await assert.rejects(fingerprint, /membership/);
    await rename(join(root, "P099/Added.cs"), join(root, "P099/Renamed.cs"));
    await assert.rejects(fingerprint, /membership/);
    await rm(join(root, "P099/Renamed.cs"));
    await rm(join(root, "P099/C40.cs"));
    await assert.rejects(fingerprint, /membership/);
    t.diagnostic(
      JSON.stringify({
        ...workload,
        elapsedMs: performance.now() - start,
        rssBytes: process.memoryUsage().rss,
        recipeBytes: Buffer.byteLength(JSON.stringify(recipes)),
      }),
    );
  },
);

test("local unreadable/oversized metadata does not stop independent inventory or direct preparation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u3-independent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "good"));
  await mkdir(join(root, "bad"));
  await writeFile(join(root, "good/App.csproj"), literalProject());
  await writeFile(join(root, "good/Input.cs"), "class Input {}");
  await writeFile(join(root, "bad/Huge.sln"), "x".repeat(PROJECT_INVENTORY_BUDGET.fileBytes + 1));
  await writeFile(join(root, "bad/Directory.Build.props"), "<Project />");
  const target = { workspacePath: root },
    scanner = createProjectDiscovery();
  const inventory = await scanner.scan(target, "inventory");
  assert.equal(inventory.status, "limited");
  assert.ok(inventory.candidates.some((candidate) => candidate.path === "good/App.csproj"));
  const prepared = await scanner.scan(target, "selected", { selectedProject: "good/App.csproj" });
  assert.equal(prepared.status, "complete", prepared.issues.join(" "));
  assert.equal(prepared.prepared!.sourcePaths.length, 2);
  await writeFile(join(root, "Directory.Build.props"), "<Project />");
  const imported = await scanner.scan(target, "ancestor", { selectedProject: "good/App.csproj" });
  assert.equal(imported.status, "limited");
  assert.equal(imported.prepared, undefined);
  assert.match(imported.issues.join(" "), /applicable imported/);
});

test("source and output limits are independent; aliases and oversized files fail closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u3-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: root };
  await assert.rejects(() => fingerprintDeclaredFiles(target, ["A.cs", "a.cs"]), /aliased/);
  await assert.rejects(
    () =>
      fingerprintDeclaredFiles(
        target,
        Array.from({ length: PROJECT_SCOPE_BUDGET.sourceFiles + 1 }, (_, i) => `s${i}.cs`),
      ),
    /20000/,
  );
  const scanner = createProjectDiscovery();
  await writeFile(join(root, "Exact.sln"), "x".repeat(PROJECT_INVENTORY_BUDGET.fileBytes));
  assert.equal(
    (await scanner.scan(target, "exact")).metadata[0]?.bytes,
    PROJECT_INVENTORY_BUDGET.fileBytes,
  );
  await writeFile(join(root, "Exact.sln"), "x".repeat(PROJECT_INVENTORY_BUDGET.fileBytes + 1));
  assert.equal((await scanner.scan(target, "over")).metadata.length, 0);
  const pending = scanner.scan(target, "cancel");
  scanner.cancelScan(target, "cancel");
  assert.equal((await pending).status, "cancelled");
});
