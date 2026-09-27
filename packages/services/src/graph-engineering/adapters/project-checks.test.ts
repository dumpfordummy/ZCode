import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unknownExecutionEnvironment } from "@zcode/shared";
import type { IGraphEngineeringService } from "../contract.js";
import { createProjectSetupPort } from "./project-checks.js";
import { createGraphRecipeStore } from "./recipes.js";
import { workflowDigest } from "./workflow-preflight.js";
import { projectSetup } from "../app/project-setup.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { defaultDefinition } from "../domain/definition.js";

test("project setup reads/validates/prepares only, preserves config, and binds source/environment changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "graph-checks-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: root };
  await mkdir(join(root, ".zcode"));
  await writeFile(
    join(root, "Tests.csproj"),
    "<Project><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></Project>",
  );
  await writeFile(join(root, "Cases.cs"), "// independent test source");
  const recipes = compileDotnetRecipes({
    idPrefix: "fixture",
    executable: "dotnet",
    cwd: ".",
    timeoutMs: 60000,
    buildProject: "Tests.csproj",
    configuration: "Release",
    framework: "net8.0",
    reviewedManifest: true,
    sourcePaths: ["Tests.csproj", "Cases.cs"],
    expectedOutputs: ["bin/Release/net8.0/Tests.dll"],
    tests: [
      {
        project: "Tests.csproj",
        configuration: "Release",
        framework: "net8.0",
        assembly: "bin/Release/net8.0/Tests.dll",
        minimumTests: 1,
        requiredTests: [],
      },
    ],
  });
  const config = JSON.stringify({ unrelated: { preserve: true }, graphRecipes: recipes });
  await writeFile(join(root, ".zcode", "config.json"), config);
  let lookups = 0,
    environmentVersion = 1;
  const agentService: Parameters<typeof createProjectSetupPort>[0]["agentService"] = {
    previewExecutionEnvironment: async ({ executables }) => {
      lookups++;
      return {
        ...unknownExecutionEnvironment("fixture environment facts remain Unknown"),
        status: "available" as const,
        configDigest: workflowDigest(String(environmentVersion)),
        executables: (executables ?? []).map((executable) => ({
          executable,
          status: "available" as const,
        })),
      };
    },
  };
  const port = createProjectSetupPort({ agentService }),
    store = createGraphRecipeStore();
  const graph = {
    getWorkspace: async () => ({
      definition: { ...defaultDefinition(), revision: 4 },
      runs: [],
      availability: { available: true },
    }),
    recipes: async () => store.read(target),
  } as unknown as IGraphEngineeringService;
  const options = { project: port, graph, digest: workflowDigest };
  const snapshot = await store.read(target);
  const scanned = await projectSetup({ action: "scan", target, requestId: "scan" }, options);
  assert.equal(scanned.kind, "discovery");
  const validated = await projectSetup(
    { action: "validate", target, json: JSON.stringify(recipes) },
    options,
  );
  assert.equal(validated.kind === "validation" && validated.diagnostics.length, 0);
  const invalid = await projectSetup(
    { action: "validate", target, json: '[{"timeoutMs":"incomplete"}]' },
    options,
  );
  assert.ok(invalid.kind === "validation" && invalid.diagnostics.length);
  assert.equal(lookups, 0);
  const selection = {
    kind: "recipes" as const,
    recipeIds: recipes.map((recipe) => recipe.id),
    buildMappings: { [recipes[1]!.id]: recipes[0]!.id },
  };
  const preview = await port.capture(target, 4, selection, snapshot.digest);
  const preserved = JSON.stringify(preview);
  assert.equal(
    preview.recipes[1]!.verifier.kind === "test" && preview.recipes[1]!.verifier.buildNodeId,
    "check-1",
  );
  assert.ok(preview.unknowns.some((line) => line.includes("private-home")));
  assert.equal(await readFile(join(root, ".zcode", "config.json"), "utf8"), config);
  await writeFile(join(root, "Cases.cs"), "// changed source");
  assert.notEqual(
    (await port.capture(target, 4, selection, snapshot.digest)).digest,
    preview.digest,
  );
  await writeFile(join(root, "Cases.cs"), "// independent test source");
  environmentVersion++;
  assert.notEqual(
    (await port.capture(target, 4, selection, snapshot.digest)).digest,
    preview.digest,
  );
  assert.equal(JSON.stringify(preview), preserved);
  await writeFile(
    join(root, ".zcode", "config.json"),
    JSON.stringify({ unrelated: { preserve: true }, graphRecipes: "invalid unrelated recipes" }),
  );
  const probe = await port.capture(
    target,
    4,
    { kind: "dotnet-probe", executable: "dotnet", cwd: "." },
    "",
  );
  assert.deepEqual(probe.recipes[0]!.args, ["--version"]);
  assert.equal(probe.recipeDigest.length, 64);
  await assert.rejects(port.capture(target, 4, selection, snapshot.digest));
});
