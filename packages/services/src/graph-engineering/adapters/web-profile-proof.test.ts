import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WEB_PROFILE_POLICY } from "@zcode/shared";
import { writeWebProfileProof, readWebProfileProof } from "./web-profile-proof.js";
import { createGraphRecipeStore } from "./recipes.js";
import { requireWebExecution } from "./web-profile-capability.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { webProfileScopeSchema, validateGraphRecipes } from "../domain/artifact-schemas.js";
import { graphToolRequest } from "../domain/tool-request.js";
const hash = "a".repeat(64);
test("v3 private proof is immutable, workspace-bound and exact; forged saved recipes fail at read", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "f1-web-proof-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: join(root, "workspace") },
    directory = join(root, "private");
  await mkdir(join(target.workspacePath, ".zcode"), { recursive: true });
  const scope = webProfileScopeSchema.parse({
    version: 3,
    policy: WEB_PROFILE_POLICY,
    project: "Tests/Tests.csproj",
    webProject: "Web/Web.csproj",
    configuration: "Debug",
    sourceCount: 53,
    membershipDigest: hash,
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
  await writeWebProfileProof(directory, target, scope, recipes, hash);
  const proof = await readWebProfileProof(directory, target, scope);
  assert.deepEqual(proof.recipes, recipes);
  assert.ok(proof.expiresAt > Date.now());
  await assert.rejects(writeWebProfileProof(directory, target, scope, recipes, hash), /EEXIST/);
  await assert.rejects(
    readWebProfileProof(directory, target, { ...scope, sourceCount: 54 }),
    /identity/,
  );
  await assert.rejects(readWebProfileProof(directory, { workspacePath: root }, scope), /ENOENT/);
  await writeFile(
    join(target.workspacePath, ".zcode/config.json"),
    JSON.stringify({ graphRecipes: recipes }),
  );
  assert.deepEqual((await createGraphRecipeStore(directory).read(target)).recipes, recipes);
  await assert.rejects(createGraphRecipeStore().read(target), /owner is unavailable/);
  const changed = structuredClone(recipes);
  changed[0]!.expectedOutputs = [...changed[0]!.expectedOutputs, "Other.dll"];
  await writeFile(
    join(target.workspacePath, ".zcode/config.json"),
    JSON.stringify({ graphRecipes: changed }),
  );
  await assert.rejects(createGraphRecipeStore(directory).read(target), /private preparation/);
  const command = { ...recipes[0]!, verifier: { kind: "command" as const } };
  assert.throws(() => validateGraphRecipes([command]), /Web profile/);
  const request = graphToolRequest({
    operationId: randomUUID(),
    recipe: recipes[0]!,
    resolvedArgs: recipes[0]!.args,
  } as Parameters<typeof graphToolRequest>[0]);
  assert.equal(request.webProfile?.kind, "build");
  assert.equal(request.webProfile?.testProject, scope.project);
});
test("absent or old Web runtime capabilities fail clearly without a fallback", async () => {
  await assert.rejects(
    requireWebExecution({}, { workspacePath: "C:/synthetic" }),
    /does not support/,
  );
  await assert.rejects(
    requireWebExecution(
      { readRuntimeCapabilities: async () => ({ supported: false }) } as Parameters<
        typeof requireWebExecution
      >[0],
      { workspacePath: "C:/synthetic" },
    ),
    /does not support/,
  );
});
