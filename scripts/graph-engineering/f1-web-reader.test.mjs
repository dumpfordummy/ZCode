import assert from "node:assert/strict";
import test from "node:test";
import {
  graphRecipeGuidedIssue,
  updateGraphRecipeField,
} from "../../packages/ui/src/graph-engineering/graphRecipeDraftForm.ts";
const hash = "a".repeat(64),
  policy = "web-static-net8-win-x64-v1";
const recipe = {
  id: "web-build",
  name: "Build",
  executable: "C:/synthetic/dotnet.exe",
  args: [],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: ["Tests/Tests.csproj"],
  expectedOutputs: ["Tests/output.dll"],
  verifier: { kind: "build" },
};
const base = { project: "Tests/Tests.csproj", membershipDigest: hash, sourceCount: 53 };
const scope = {
  ...base,
  version: 3,
  policy,
  configuration: "Debug",
  webProject: "Web/Web.csproj",
  preparationId: "synthetic",
  inspectionIds: ["web", "test"],
  assemblies: { web: "Web/observed.dll", test: "Tests/observed.dll" },
  copiedContent: [],
  runtimeProfile: {
    policy,
    executable: recipe.executable,
    packageRoot: "C:/public-cache",
    systemRoot: "C:/Windows",
    toolchainDigest: hash,
    resolverDigest: hash,
    environmentDigest: hash,
    observedFiles: 1,
    observedBytes: 1,
  },
};
test("v3 guided reader recognizes immutable inspected profiles; existing literal/v1/v2 readers remain editable", () => {
  for (const sourceScope of [
    undefined,
    { ...base, version: 1 },
    { ...base, version: 2, configuration: "Debug" },
  ]) {
    const old = { ...recipe, ...(sourceScope ? { sourceScope } : {}) };
    assert.equal(graphRecipeGuidedIssue(old), undefined);
    assert.match(updateGraphRecipeField(JSON.stringify([old]), 0, ["name"], "Changed"), /Changed/);
  }
  assert.equal(graphRecipeGuidedIssue({ ...recipe, sourceScope: scope }), "inspectedProfile");
  assert.throws(
    () =>
      updateGraphRecipeField(
        JSON.stringify([{ ...recipe, sourceScope: scope }]),
        0,
        ["name"],
        "Changed",
      ),
    /Advanced/,
  );
  for (const changed of [
    { ...scope, version: 4 },
    { ...scope, version: "3" },
    { ...scope, policy: "arbitrary" },
    { ...scope, runtimeProfile: {} },
    { ...scope, inspectionIds: [] },
  ])
    assert.equal(graphRecipeGuidedIssue({ ...recipe, sourceScope: changed }), "invalidShape");
});
