import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { WEB_PROFILE_POLICY } from "@zcode/shared";
import { createGraphRecipeStore } from "./recipes.js";
import { writeWebProfileProof, readWebProfileProof } from "./web-profile-proof.js";
import { prepareWebProfileInputs } from "./web-profile-inputs.js";
import { fingerprintDeclaredFiles } from "./artifact-files.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { webProfileScopeSchema } from "../domain/artifact-schemas.js";

const originalConfig = '{\n "unrelated": {"keep": true}, "label": "synthetic"\n}\n';
const content = "static content before preparation\n";
const selection = {
  webProject: "Web/Web.csproj",
  testProject: "Tests/Tests.csproj",
  configuration: "Debug" as const,
};

async function snapshot(root: string, prefix = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = join(prefix, item.name);
    if (item.isDirectory()) Object.assign(result, await snapshot(root, relative));
    else result[relative] = (await readFile(join(root, relative))).toString("base64");
  }
  return result;
}

async function fixture(t: TestContext, existingConfig = true) {
  const root = await mkdtemp(join(tmpdir(), "f1-r1-save-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: join(root, "workspace") },
    directory = join(root, "private");
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(target.workspacePath, path)), { recursive: true });
    await writeFile(join(target.workspacePath, path), text);
  };
  await write(
    selection.webProject,
    '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
  );
  await write(
    selection.testProject,
    '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><ProjectReference Include="../Web/Web.csproj"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0"/><PackageReference Include="xunit" Version="2.5.3"/><PackageReference Include="xunit.runner.visualstudio" Version="2.5.3"/></ItemGroup></Project>',
  );
  await write(
    "global.json",
    JSON.stringify({ sdk: { rollForward: "disable", version: "8.0.426" } }),
  );
  await write("Directory.Build.props", "<Project />");
  // Restore/toolchain provenance alone is controlled below; these are real membership inputs.
  for (const role of ["Web", "Tests"])
    for (const name of [
      "project.assets.json",
      `${role}.csproj.nuget.g.props`,
      `${role}.csproj.nuget.g.targets`,
    ])
      await write(`${role}/obj/${name}`, name.endsWith("json") ? "{}" : "<Project />");
  await write("Web/wwwroot/site.txt", content);
  await write("Web/appsettings.json", '{"key":"value"}');
  if (existingConfig) await write(".zcode/config.json", originalConfig);
  const membership = await prepareWebProfileInputs(target, selection);
  const prepared = await fingerprintDeclaredFiles(target, membership.sourcePaths);
  const hash = "a".repeat(64);
  const scope = webProfileScopeSchema.parse({
    version: 3,
    policy: WEB_PROFILE_POLICY,
    project: selection.testProject,
    webProject: selection.webProject,
    configuration: selection.configuration,
    sourceCount: membership.sourcePaths.length,
    membershipDigest: membership.membershipDigest,
    preparationId: randomUUID(),
    inspectionIds: [randomUUID(), randomUUID()],
    assemblies: { web: "Web/bin/Debug/net8.0/Web.dll", test: "Tests/bin/Debug/net8.0/Tests.dll" },
    copiedContent: [],
    runtimeProfile: {
      policy: WEB_PROFILE_POLICY,
      executable: "C:/synthetic/dotnet.exe",
      packageRoot: "C:/synthetic/packages",
      systemRoot: "C:/Windows",
      toolchainDigest: hash,
      resolverDigest: hash,
      environmentDigest: hash,
      observedFiles: 1,
      observedBytes: 1,
    },
  });
  const recipes = compileDotnetRecipes({
    idPrefix: "web-profile",
    executable: scope.runtimeProfile.executable,
    cwd: ".",
    timeoutMs: 120000,
    buildProject: scope.project,
    configuration: "Debug",
    framework: "net8.0",
    sourcePaths: [],
    sourceScope: scope,
    expectedOutputs: [scope.assemblies.web, scope.assemblies.test],
    reviewedManifest: true,
    tests: [
      {
        project: scope.project,
        configuration: "Debug",
        framework: "net8.0",
        assembly: scope.assemblies.test,
        minimumTests: 1,
        requiredTests: [],
      },
    ],
  });
  await writeWebProfileProof(directory, target, scope, recipes, prepared.digest);
  const proof = await readWebProfileProof(directory, target, scope);
  let now = proof.expiresAt - 1;
  let observations = 0;
  let observe = async () => {};
  // Instance-local clock and external installed-provenance observer only. The store,
  // proof reads, workspace scan, actual content hash/comparison, lock and write are real.
  const newStore = () =>
    createGraphRecipeStore(directory, {
      now: () => now,
      webProvenance: async (observedTarget, observedScope) => {
        assert.deepEqual(observedTarget, target);
        assert.deepEqual(observedScope, scope);
        observations++;
        await observe();
      },
    });
  const store = newStore();
  const before = await store.read(target);
  const proofBefore = await snapshot(directory);
  const unchanged = async () => {
    const configPath = join(target.workspacePath, ".zcode/config.json");
    if (existingConfig) assert.deepEqual(await readFile(configPath), Buffer.from(originalConfig));
    else await assert.rejects(readFile(configPath), { code: "ENOENT" });
    assert.deepEqual(await snapshot(directory), proofBefore);
    assert.deepEqual(
      await readdir(join(target.workspacePath, ".zcode")),
      existingConfig ? ["config.json"] : [],
    );
  };
  const recover = async () => {
    now = proof.expiresAt - 1;
    observe = async () => {};
    await write("Web/wwwroot/site.txt", content);
    // A different store must acquire the same lock after rejection and successfully save.
    const saved = await newStore().save(target, recipes, before.digest);
    assert.deepEqual(saved.recipes, recipes);
    assert.deepEqual((await newStore().read(target)).recipes, recipes);
  };
  return {
    root,
    target,
    directory,
    recipes,
    scope,
    store,
    newStore,
    before,
    proof,
    write,
    unchanged,
    recover,
    observations: () => observations,
    expire: () => {
      now = proof.expiresAt;
    },
    onObservation: (callback: () => Promise<void>) => {
      observe = callback;
    },
  };
}

test("v3 Save fresh positive control persists exact recipes and unrelated configuration", async (t) => {
  const f = await fixture(t);
  const saved = await f.store.save(f.target, f.recipes, f.before.digest);
  assert.equal(f.observations(), 2, "real before/after membership verification ran");
  assert.deepEqual(saved.recipes, f.recipes);
  assert.notEqual(saved.digest, f.before.digest);
  assert.deepEqual(await createGraphRecipeStore(f.directory).read(f.target), saved);
  const raw = JSON.parse(
    await readFile(join(f.target.workspacePath, ".zcode/config.json"), "utf8"),
  );
  assert.deepEqual(raw.unrelated, { keep: true });
  assert.equal(raw.label, "synthetic");
});

for (const existing of [true, false])
  test(`v3 Save expired before verification preserves ${existing ? "existing" : "absent"} config and releases lock`, async (t) => {
    const f = await fixture(t, existing);
    f.expire();
    await assert.rejects(f.store.save(f.target, f.recipes, f.before.digest), {
      message: "Web proposal review expired; prepare again before Save.",
    });
    assert.equal(f.observations(), 0, "expired review never entered expensive provenance");
    await f.unchanged();
    await f.recover();
  });

test(
  "v3 Save expires during real verification before replacement and releases lock",
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    const entered = Promise.withResolvers<void>(),
      resume = Promise.withResolvers<void>();
    f.onObservation(async () => {
      entered.resolve();
      await resume.promise;
    });
    const saving = f.store.save(f.target, f.recipes, f.before.digest);
    const rejected = assert.rejects(saving, {
      message: "Web proposal expired during Save verification.",
    });
    try {
      await entered.promise;
      assert.equal(f.observations(), 1, "Save passed its pre-expiry check and reached provenance");
      f.expire();
    } finally {
      resume.resolve();
    }
    await rejected;
    assert.equal(f.observations(), 2, "matching bytes and both membership observations completed");
    await f.unchanged();
    await f.recover();
  },
);

test("v3 Save rejects actual prepared Content byte drift and releases lock", async (t) => {
  const f = await fixture(t);
  await f.write("Web/wwwroot/site.txt", "changed Content after preparation\n");
  const membership = await prepareWebProfileInputs(f.target, selection);
  assert.equal(
    membership.membershipDigest,
    f.scope.membershipDigest,
    "byte drift does not trip metadata/membership guard",
  );
  await assert.rejects(f.store.save(f.target, f.recipes, f.before.digest), {
    message: "Web source bytes changed after preparation; prepare again before Save.",
  });
  assert.equal(f.observations(), 2);
  await f.unchanged();
  await f.recover();
});

test("v3 Save cold reopen after review expiry reads without verification or retained-file rewrites", async (t) => {
  const f = await fixture(t);
  const saved = await f.store.save(f.target, f.recipes, f.before.digest);
  f.expire();
  const before = await snapshot(f.root),
    observations = f.observations();
  f.onObservation(async () => {
    assert.fail("cold read must not observe installed provenance");
  });
  assert.deepEqual(await f.newStore().read(f.target), saved);
  assert.equal(f.observations(), observations);
  assert.deepEqual(await snapshot(f.root), before, "no proof/config/new execution artifact writes");
  // Reading did not renew Save authority. Later execution freshness stays separately owned.
  await assert.rejects(f.newStore().save(f.target, f.recipes, saved.digest), {
    message: "Web proposal review expired; prepare again before Save.",
  });
  assert.deepEqual(await snapshot(f.root), before);
});
