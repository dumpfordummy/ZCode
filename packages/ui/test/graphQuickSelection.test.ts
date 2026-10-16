import assert from "node:assert/strict";
import test from "node:test";
import type { GraphProjectDiscovery } from "@zcode/services";
import {
  quickDotnetPreset,
  quickDotnetSelection,
} from "../src/graph-engineering/graphQuickDotnetModel.js";

const inventory: GraphProjectDiscovery = {
  kind: "discovery",
  requestId: "inventory",
  status: "complete",
  digest: "a",
  issues: [],
  excluded: [],
  limits: { files: 100, depth: 32, metadataBytes: 1000, sourceFiles: 20000 },
  metadata: ["Tests.csproj", "builds/0/project-0/Tests.csproj"].map((path) => ({
    path,
    digest: "same",
    bytes: 40,
  })),
  candidates: ["Api.csproj", "Tests.csproj", "builds/0/project-0/Tests.csproj"].map((path) => ({
    path,
    kind: "project",
    frameworks: ["net10.0"],
    projects: [],
    runner: path === "Api.csproj" ? "not-test" : "vstest",
    evidence: [],
    sourcePaths: [],
    coverage: "review-required",
    issues: [],
    quick: { configuration: "Debug", assemblies: { "net10.0": "bin/Debug/net10.0/Tests.dll" } },
  })),
};
const prepare = (project: string): GraphProjectDiscovery => ({
  ...inventory,
  prepared: {
    scope: {
      version: 2,
      configuration: "Debug",
      project,
      sourceCount: 1,
      membershipDigest: "a".repeat(64),
    },
    sourcePaths: [project],
  },
});

test("only prepared reachable tests are selectable; unrelated saved choices fail before Save", () => {
  assert.equal(quickDotnetSelection(inventory, undefined, "Api.csproj").scopes.length, 0);
  assert.equal(
    quickDotnetSelection(inventory, prepare("Api.csproj"), "Api.csproj").scopes.length,
    0,
  );
  assert.throws(
    () => quickDotnetPreset(prepare("Api.csproj"), "Api.csproj", ["Tests.csproj|net10.0"], "[]"),
    /not built/,
  );
  assert.deepEqual(
    quickDotnetSelection(inventory, prepare("Tests.csproj"), "Tests.csproj").scopes.map(
      (s) => s.id,
    ),
    ["Tests.csproj|net10.0"],
  );
  assert.equal(
    quickDotnetSelection(inventory, prepare("Tests.csproj"), "Api.csproj").scopes.length,
    0,
  );
});
test("selected root cause survives missing preparation and test selection", () => {
  const broken = structuredClone(inventory);
  broken.candidates[0]!.quickIssues = ["SDK Microsoft.NET.Sdk.Web requires reviewed inputs"];
  assert.throws(() => quickDotnetPreset(broken, "Api.csproj", [], "[]"), /Microsoft.NET.Sdk.Web/);
});
test("copy grouping is opt-in and selected duplicate stays reachable", () => {
  assert.equal(quickDotnetSelection(inventory, undefined, "").builds.length, 3);
  const grouped = quickDotnetSelection(inventory, undefined, "", true);
  assert.equal(grouped.builds.length, 2);
  assert.equal(grouped.hidden, 1);
  assert.equal(grouped.copies.length, 1);
  assert.equal(
    quickDotnetSelection(inventory, undefined, "builds/0/project-0/Tests.csproj", true).builds
      .length,
    3,
  );
  assert.equal(inventory.candidates.length, 3);
});
