import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { unknownExecutionEnvironment } from "@zcode/shared";
import type { IModelSelectionService, IZCodeAgentService } from "../../index.js";
import type { GraphRecipe } from "../artifact-types.js";
import { instantiateTemplate } from "../domain/workflow.js";
import { builtinTemplates } from "../domain/workflow-samples.js";
import { createGraphRecipeStore } from "./recipes.js";
import { createWorkflowPreflight } from "./workflow-preflight.js";
import { workflowToolQueries } from "./workflow-tools.js";

const settings = {
  modelSelection: { providerId: "fixture-provider", modelId: "fixture-model" },
  mode: "edit" as const,
  planEnabled: false,
};
const recipes: GraphRecipe[] = [
  {
    id: "build-recipe",
    name: "Fixture build",
    executable: process.execPath,
    args: ["compile"],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["fixture.csproj"],
    expectedOutputs: ["bin/fixture.dll"],
    verifier: { kind: "build" },
  },
  {
    id: "test-recipe",
    name: "Fixture independent test",
    executable: process.execPath,
    args: ["verify"],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["fixture.csproj"],
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      reportPath: "fixture-results.json",
      minimumTests: 1,
      requiredTests: ["edge"],
      buildNodeId: "build",
    },
  },
];

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "z6-preflight-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: root, workspaceIdentity: `fixture:${root}` };
  await mkdir(join(root, ".zcode"));
  await writeFile(join(root, "fixture.csproj"), "<Project />");
  await writeFile(join(root, "instructions.md"), "PROJECT_CONTENT_SECRET: preserve fixture");
  await writeFile(join(root, ".zcode", "config.json"), JSON.stringify({ graphRecipes: recipes }));
  const definition = instantiateTemplate(
    "generic",
    { version: 1, digest: "a".repeat(64), createdAt: 1, template: builtinTemplates[0]!.template },
    { request: "Implement the synthetic edge behavior" },
    {
      references: { instructions: "instructions.md", skill: "fixture-skill" },
      recipes: { build: "build-recipe", test: "test-recipe" },
      sourcePaths: [],
    },
  );
  const environment = {
    ...unknownExecutionEnvironment("Subagent runtime destinations remain Unknown."),
    status: "available" as "available" | "unknown",
    configDigest: "b".repeat(64),
    executables: [
      {
        executable: process.execPath,
        status: "available" as "available" | "missing" | "unknown",
        path: process.execPath,
      },
    ],
    skills: [
      {
        id: "fixture-skill",
        name: "Fixture skill",
        path: join(root, ".agents", "skills", "fixture", "SKILL.md"),
        scope: "workspace" as const,
        enabled: true,
        digest: "c".repeat(64),
      },
    ],
  };
  const provider = {
    providerId: settings.modelSelection.providerId,
    config: {
      api: {
        type: "openai" as const,
        baseUrl:
          "http://user:URL_AUTH_SECRET@127.0.0.1:9123/PRIVATE_ROUTE_SECRET?api_key=QUERY_SECRET",
      },
      access: { apiKey: "API_KEY_SECRET", headers: { Authorization: "Bearer HEADER_SECRET" } },
    },
    models: [{ modelId: settings.modelSelection.modelId, config: { temperature: 0.1 } }],
  };
  let calls = 0;
  let selectionIssue = false;
  const preflight = createWorkflowPreflight({
    agentService: {
      async previewExecutionEnvironment(received: unknown) {
        assert.deepEqual(received, { ...target, executables: [process.execPath] });
        calls++;
        return structuredClone(environment);
      },
    } as unknown as IZCodeAgentService,
    modelSelectionService: {
      async getView(input: { selection: unknown }) {
        assert.deepEqual(input.selection, settings.modelSelection);
        return {
          selectionIssue: selectionIssue ? { kind: "unavailable" } : undefined,
          effectiveSelection: settings.modelSelection,
          providers: [structuredClone(provider)],
        };
      },
    } as unknown as IModelSelectionService,
  });
  return {
    root,
    target,
    definition,
    environment,
    provider,
    capture: () => preflight.capture(target, definition, settings),
    calls: () => calls,
    invalidateSelection: () => {
      selectionIssue = true;
    },
  };
}

test("Z6 preflight inventories an explicit native setup without execution or raw credentials/content", async (t) => {
  const f = await fixture(t);
  const configBefore = await readFile(join(f.root, ".zcode", "config.json"), "utf8");
  const captured = await f.capture();
  assert.equal(f.calls(), 1);
  assert.equal(captured.models.length, 3);
  assert.ok(captured.models.every((model) => model.destination === "http://127.0.0.1:9123"));
  assert.deepEqual(
    captured.references.map((ref) => ref.id),
    ["instructions", "skill"],
  );
  assert.equal(
    captured.references.find((ref) => ref.kind === "skill")?.nativeName,
    "Fixture skill",
  );
  assert.equal(captured.environment.configDigest, "b".repeat(64));
  assert.deepEqual(
    captured.recipes.map((recipe) => recipe.command),
    [JSON.stringify([process.execPath, "compile"]), JSON.stringify([process.execPath, "verify"])],
  );
  assert.equal(await readFile(join(f.root, ".zcode", "config.json"), "utf8"), configBefore);
  assert.ok(captured.unknowns.some((reason) => reason.includes("Subagent")));
  assert.doesNotMatch(JSON.stringify(captured), /SECRET/);
  assert.equal((await f.capture()).digest, captured.digest);
});

test("Z6 preflight binds full endpoint/model semantics and native configuration drift while displaying only origin", async (t) => {
  const f = await fixture(t);
  const initial = await f.capture();
  f.provider.config.api.baseUrl = "http://127.0.0.1:9123/other/PRIVATE_ROUTE_SECRET";
  const endpointChanged = await f.capture();
  assert.equal(endpointChanged.models[0]!.destination, initial.models[0]!.destination);
  assert.notEqual(
    endpointChanged.models[0]!.configurationDigest,
    initial.models[0]!.configurationDigest,
  );
  assert.notEqual(endpointChanged.digest, initial.digest);
  f.provider.models[0]!.config.temperature = 0.2;
  const modelChanged = await f.capture();
  assert.notEqual(modelChanged.digest, endpointChanged.digest);
  f.environment.configDigest = "d".repeat(64);
  const nativeChanged = await f.capture();
  assert.notEqual(nativeChanged.digest, modelChanged.digest);
  f.environment.skills[0]!.digest = "e".repeat(64);
  const skillChanged = await f.capture();
  assert.notEqual(skillChanged.digest, nativeChanged.digest);
  await writeFile(join(f.root, "instructions.md"), "Changed independent project instructions");
  const instructionChanged = await f.capture();
  assert.notEqual(instructionChanged.digest, skillChanged.digest);
  assert.doesNotMatch(JSON.stringify(instructionChanged), /SECRET/);
});

test("Z6 preflight rejects cold native inventory, missing references/recipes and disabled skills before execution", async (t) => {
  const f = await fixture(t);
  f.environment.status = "unknown";
  await assert.rejects(f.capture(), /Native configuration is Unknown/);
  f.environment.status = "available";
  f.environment.skills[0]!.enabled = false;
  await assert.rejects(f.capture(), /Native skill .* unavailable/);
  f.environment.skills[0]!.enabled = true;
  await rm(join(f.root, "instructions.md"));
  await assert.rejects(f.capture(), /missing|exist|ENOENT/);
  await writeFile(join(f.root, "instructions.md"), "Fixture instructions");
  const store = createGraphRecipeStore();
  await store.save(f.target, [recipes[0]!], (await store.read(f.target)).digest);
  await assert.rejects(f.capture(), /existing project recipe \(test-recipe\)/);
});

test("Z6 preflight reports missing native tooling before any agent or recipe execution", async (t) => {
  const f = await fixture(t);
  f.environment.executables[0]!.status = "missing";
  await assert.rejects(f.capture(), /missing|unavailable|not found/i);
  f.environment.executables[0]!.status = "unknown";
  const unknown = await f.capture();
  assert.ok(unknown.unknowns.some((reason) => /executable|tooling/i.test(reason)));
});

test("Z6 preflight rejects a changed native selection and mismatched Build/Test recipe authority", async (t) => {
  const f = await fixture(t);
  const store = createGraphRecipeStore();
  await store.save(
    f.target,
    [{ ...recipes[0]!, verifier: { kind: "command" } }, recipes[1]!],
    (await store.read(f.target)).digest,
  );
  await assert.rejects(f.capture(), /Build slot requires a Build verifier/);
  const testRecipe = structuredClone(recipes[1]!);
  assert.equal(testRecipe.verifier.kind, "test");
  if (testRecipe.verifier.kind === "test") testRecipe.verifier.buildNodeId = "unrelated-build";
  await store.save(f.target, [recipes[0]!, testRecipe], (await store.read(f.target)).digest);
  await assert.rejects(f.capture(), /independent Test verifier tied to Build/);
  await store.save(f.target, recipes, (await store.read(f.target)).digest);
  f.invalidateSelection();
  await assert.rejects(f.capture(), /selected native model changed or is unavailable/);
});

test("Z6 tool preparation defers only outputs from a distinct dominating Build node", async (t) => {
  const f = await fixture(t);
  const pendingRecipes = structuredClone(recipes);
  pendingRecipes[1]!.executable = "./bin/fixture.dll";
  const expectedOutput = join(f.root, "bin", "fixture.dll");
  const pending = workflowToolQueries(f.target, f.definition, pendingRecipes);
  assert.deepEqual(pending.queries, [process.execPath]);
  assert.equal(pending.pending.length, 1);

  pendingRecipes[0]!.executable = "./bin/fixture.dll";
  const selfOutput = workflowToolQueries(f.target, f.definition, pendingRecipes);
  assert.ok(
    selfOutput.queries.includes(expectedOutput),
    "Build cannot satisfy its own prerequisite",
  );
  pendingRecipes[0]!.executable = process.execPath;
  pendingRecipes[0]!.verifier = { kind: "command" };
  assert.ok(
    workflowToolQueries(f.target, f.definition, pendingRecipes).queries.includes(expectedOutput),
  );

  pendingRecipes[0]!.verifier = { kind: "build" };
  f.definition.edges.push({ source: "implement", target: "test" });
  assert.ok(
    workflowToolQueries(f.target, f.definition, pendingRecipes).queries.includes(expectedOutput),
  );
});
