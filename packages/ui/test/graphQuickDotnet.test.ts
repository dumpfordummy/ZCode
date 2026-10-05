import assert from "node:assert/strict";
import test from "node:test";
import type { GraphProjectDiscovery } from "@zcode/services";
import {
  quickDotnetChoices,
  quickDotnetPreset,
  associatedQuickChecks,
} from "../src/graph-engineering/graphQuickDotnetModel.js";
import { compileDotnetRecipes } from "../../services/src/graph-engineering/domain/dotnet-recipes.js";

const discovery: GraphProjectDiscovery = {
  kind: "discovery",
  requestId: "one",
  status: "complete",
  digest: "a",
  metadata: [],
  issues: [],
  excluded: [],
  limits: { files: 2048, depth: 8, metadataBytes: 524288, sourceFiles: 32 },
  candidates: [
    {
      path: "Demo.sln",
      kind: "solution",
      frameworks: [],
      projects: ["Tests.csproj"],
      runner: "unknown",
      evidence: [],
      sourcePaths: ["Demo.sln", "Tests.csproj"],
      coverage: "review-required",
      issues: [],
    },
    {
      path: "Tests.csproj",
      kind: "project",
      frameworks: ["net8.0", "net9.0"],
      projects: [],
      runner: "vstest",
      evidence: [],
      sourcePaths: ["Demo.sln", "Tests.csproj"],
      coverage: "review-required",
      issues: [],
      quick: {
        configuration: "Debug",
        assemblies: {
          "net8.0": "bin/Debug/net8.0/Tests.dll",
          "net9.0": "bin/Debug/net9.0/Tests.dll",
        },
      },
    },
  ],
};
test("unique aggregate Build and ordered test scopes compile through the existing strict preset", () => {
  assert.deepEqual(
    quickDotnetChoices(discovery).builds.map((item) => item.path),
    ["Demo.sln"],
  );
  const preset = quickDotnetPreset(
    discovery,
    "Demo.sln",
    ["Tests.csproj|net9.0", "Tests.csproj|net8.0"],
    "[]",
  );
  assert.deepEqual(
    preset.tests.map((item) => item.framework),
    ["net9.0", "net8.0"],
  );
  const recipes = compileDotnetRecipes(preset);
  assert.ok(recipes.every((recipe) => recipe.args.includes("--no-restore")));
  assert.deepEqual(associatedQuickChecks(recipes)?.buildMappings, {
    "dotnet-test-1": "dotnet-build",
    "dotnet-test-2": "dotnet-build",
  });
  assert.equal(associatedQuickChecks(recipes.slice(1)), undefined);
  assert.equal(
    quickDotnetPreset(discovery, "Demo.sln", ["Tests.csproj|net8.0"], JSON.stringify(recipes))
      .idPrefix,
    "dotnet2",
  );
});
test("ambiguity, incomplete scan, unknown metadata and unsupported runner cannot fabricate defaults", () => {
  const multiple = structuredClone(discovery);
  multiple.candidates.push({ ...multiple.candidates[0]!, path: "Other.sln" });
  assert.equal(quickDotnetChoices(multiple).builds.length, 3);
  assert.throws(
    () =>
      quickDotnetPreset(
        { ...discovery, status: "limited" },
        "Demo.sln",
        ["Tests.csproj|net8.0"],
        "[]",
      ),
    /complete/,
  );
  const unsupported = structuredClone(discovery);
  delete unsupported.candidates[1]!.quick;
  unsupported.candidates[1]!.quickIssues = ["Custom runtime"];
  assert.throws(
    () => quickDotnetPreset(unsupported, "Demo.sln", ["Tests.csproj|net8.0"], "[]"),
    /Custom runtime/,
  );
  unsupported.candidates[1]!.runner = "mtp";
  assert.deepEqual(quickDotnetChoices(unsupported).scopes, []);
});
