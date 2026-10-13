import assert from "node:assert/strict";
import test from "node:test";
import {
  appendGraphRecipes,
  graphRecipeDraft,
  graphRecipeGuidedIssue,
  updateGraphRecipeField,
} from "../src/graph-engineering/graphRecipeDraftForm.js";

const recipe = {
  id: "build",
  name: "Build",
  executable: "dotnet",
  args: ["build", "", "a b", "line\nvalue"],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: ["a.cs"],
  expectedOutputs: ["a.dll"],
  redactEnvironmentVariables: ["SAFE_TOKEN"],
  verifier: {
    kind: "build",
    dotnet: { project: "a.csproj", configuration: "Debug", restore: "disabled" },
  },
};
test("guided edits preserve complete recipes and lossless argv while view projection never rewrites text", () => {
  const text = JSON.stringify([recipe], null, 4);
  const parsed = graphRecipeDraft(text);
  assert.equal(parsed.kind, "ready");
  assert.equal(graphRecipeGuidedIssue(recipe), undefined);
  const changed = updateGraphRecipeField(text, 0, ["name"], "Renamed");
  assert.deepEqual(JSON.parse(changed), [{ ...recipe, name: "Renamed" }]);
  assert.equal(updateGraphRecipeField(text, 0, ["name"], "Build"), text);
  const emptyNumber = updateGraphRecipeField(text, 0, ["timeoutMs"], "");
  assert.equal(JSON.parse(emptyNumber)[0].timeoutMs, "");
  assert.deepEqual(JSON.parse(emptyNumber)[0].args, recipe.args);
});
test("invalid or advanced-only text cannot be silently rewritten by Guided", () => {
  assert.equal(graphRecipeDraft("{unfinished").kind, "invalid");
  assert.throws(() => updateGraphRecipeField("{unfinished", 0, ["name"], "new"));
  const future = { ...recipe, verifier: { kind: "future", retain: true } };
  assert.equal(graphRecipeGuidedIssue(future), "unsupportedVerifier");
  assert.equal(
    graphRecipeGuidedIssue({ ...recipe, privateExtension: { keep: true } }),
    "unknownFields",
  );
  const text = JSON.stringify([future]);
  assert.throws(() => updateGraphRecipeField(text, 0, ["name"], "new"));
  assert.equal(text, JSON.stringify([future]));
});

test("invalid scalar declarations remain Advanced-only instead of becoming display strings", () => {
  for (const value of [
    { ...recipe, executable: { nested: true } },
    { ...recipe, timeoutMs: "bad" },
    {
      ...recipe,
      verifier: {
        kind: "build",
        dotnet: { project: 123, configuration: "Debug", restore: "disabled" },
      },
    },
  ]) {
    const text = JSON.stringify([value]);
    assert.equal(graphRecipeGuidedIssue(value), "invalidShape");
    assert.throws(() => updateGraphRecipeField(text, 0, ["name"], "Changed"));
  }
});
test("adding generated checks preserves unrelated recipes and refuses identity collisions", () => {
  const text = JSON.stringify([recipe]);
  assert.deepEqual(JSON.parse(appendGraphRecipes(text, [{ ...recipe, id: "other" }])), [
    recipe,
    { ...recipe, id: "other" },
  ]);
  assert.throws(() => appendGraphRecipes(text, [recipe]), /duplicate/i);
  assert.throws(() => updateGraphRecipeField(text, 0, ["__proto__", "bad"], true));
});

test("v2 scopes remain editable without changing manual filter, timeout, outputs or required tests", () => {
  const custom = {
    ...recipe,
    sourceScope: {
      version: 2,
      configuration: "Release",
      project: "a.csproj",
      sourceCount: 5003,
      membershipDigest: "a".repeat(64),
    },
    verifier: {
      kind: "test",
      format: "dotnet-vstest-trx-v1",
      reportPath: "results.trx",
      minimumTests: 2,
      requiredTests: ["A", "B"],
      target: {
        project: "a.csproj",
        configuration: "Release",
        framework: "net8.0",
        assembly: "bin/a.dll",
        filter: "Category=Unit",
      },
    },
  };
  const text = JSON.stringify([custom]);
  assert.equal(graphRecipeGuidedIssue(custom), undefined);
  assert.equal(updateGraphRecipeField(text, 0, ["name"], "Build"), text);
  assert.deepEqual(JSON.parse(updateGraphRecipeField(text, 0, ["name"], "Reviewed")), [
    { ...custom, name: "Reviewed" },
  ]);
  assert.equal(
    graphRecipeGuidedIssue({ ...custom, sourceScope: { ...custom.sourceScope, version: 3 } }),
    "invalidShape",
  );
});
