import assert from "node:assert/strict";
import { test } from "node:test";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { compileChecksDefinition } from "../domain/project-checks.js";
import { effectiveGraphRecipe } from "../domain/effective-recipe.js";
import { graphRecipeSchema } from "../domain/artifact-schemas.js";
import type { GraphDotnetPreset } from "../project-setup-types.js";

const preset: GraphDotnetPreset = {
  idPrefix: "sample",
  executable: "dotnet",
  cwd: ".",
  timeoutMs: 60000,
  buildProject: "Tests.csproj",
  configuration: "Release",
  framework: "net8.0",
  sourcePaths: ["Tests.csproj", "Cases.cs"],
  expectedOutputs: ["bin/Release/net8.0/Tests.dll"],
  reviewedManifest: true,
  tests: [
    {
      project: "Tests.csproj",
      configuration: "Release",
      framework: "net8.0",
      assembly: "bin/Release/net8.0/Tests.dll",
      minimumTests: 3,
      requiredTests: [],
    },
  ],
};
test(".NET proposal binds explicit scope, no restore, unique operation report and reviewed manifest", () => {
  const recipes = compileDotnetRecipes(preset);
  assert.equal(recipes.length, 2);
  assert.ok(recipes[0]!.args.includes("--no-restore"));
  assert.ok(recipes[0]!.args.includes("-t:Rebuild"));
  assert.ok(recipes[1]!.args.includes("--no-build"));
  assert.equal(recipes[1]!.verifier.kind, "test");
  assert.match(JSON.stringify(recipes[1]), /\{operationId\}/);
  assert.throws(() => compileDotnetRecipes({ ...preset, reviewedManifest: false }), /manifest/i);
  assert.throws(
    () => compileDotnetRecipes({ ...preset, expectedOutputs: ["other.dll"] }),
    /assembly/i,
  );
  assert.throws(() => compileDotnetRecipes({ ...preset, sourcePaths: ["Cases.cs"] }), /project/i);
  const custom = structuredClone(recipes[1]!);
  custom.args.push("--framework", "net6.0");
  assert.equal(graphRecipeSchema.safeParse(custom).success, false);
  const stale = structuredClone(recipes[1]!);
  if (stale.verifier.kind === "test") stale.verifier.reportPath = "results.trx";
  assert.equal(graphRecipeSchema.safeParse(stale).success, false);
});
test("calibration compiles ordered saved checks with graph-local Build association and preserves inputs", () => {
  const recipes = compileDotnetRecipes(preset);
  const original = JSON.stringify(recipes);
  const selection = {
    kind: "recipes" as const,
    recipeIds: recipes.map((r) => r.id),
    buildMappings: { [recipes[1]!.id]: recipes[0]!.id },
  };
  const compiled = compileChecksDefinition(selection, recipes, 17);
  assert.equal(compiled.definition.version, 4);
  assert.equal(compiled.definition.revision, 17);
  assert.equal(compiled.definition.nodes.filter((n) => n.type === "task").length, 0);
  const testNode = compiled.definition.nodes.find(
    (n) => n.type === "tool" && n.recipeId === recipes[1]!.id,
  )!;
  const effective = effectiveGraphRecipe(compiled.definition, testNode.id, recipes[1]!);
  assert.equal(effective.verifier.kind === "test" && effective.verifier.buildNodeId, "check-1");
  assert.equal(JSON.stringify(recipes), original);
  assert.throws(
    () =>
      compileChecksDefinition(
        { ...selection, recipeIds: [...selection.recipeIds].reverse() },
        recipes,
        17,
      ),
    /earlier/i,
  );
  assert.throws(
    () => compileChecksDefinition({ ...selection, buildMappings: {} }, recipes, 17),
    /Build/i,
  );
  assert.throws(
    () =>
      compileChecksDefinition(
        { ...selection, recipeIds: [recipes[0]!.id, recipes[0]!.id] },
        recipes,
        17,
      ),
    /unique/i,
  );
});
test("probe is a bounded exact native Tool plan and never evaluates user text as a shell", () => {
  const compiled = compileChecksDefinition(
    { kind: "dotnet-probe", executable: "dotnet", cwd: "." },
    [],
    2,
  );
  assert.deepEqual(compiled.recipes[0]!.args, ["--version"]);
  assert.equal(compiled.recipes[0]!.verifier.kind, "command");
  assert.throws(
    () => compileChecksDefinition({ kind: "dotnet-probe", executable: "pwsh", cwd: "." }, [], 2),
    /dotnet/i,
  );
});
