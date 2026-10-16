import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRecipe } from "../artifact-types.js";
import { associatedBuildPaths, assertCopiedContent } from "./web-content-evidence.js";
const recipe = {
  expectedOutputs: ["Tests/bin/Tests.dll"],
  sourceScope: {
    version: 3,
    copiedContent: [{ source: "Web/appsettings.json", output: "Tests/bin/appsettings.json" }],
  },
} as GraphRecipe;
test("v3 copied content joins Build-to-Test association but not generated output freshness", async () => {
  assert.deepEqual(associatedBuildPaths(recipe), [
    "Tests/bin/Tests.dll",
    "Tests/bin/appsettings.json",
  ]);
  assert.deepEqual(recipe.expectedOutputs, ["Tests/bin/Tests.dll"]);
  await assertCopiedContent(
    {
      fingerprint: async (_target, paths) => ({
        digest: "aggregate",
        files: paths.map((path) => ({ path, bytes: 3, digest: "same-bytes", modifiedAt: 1 })),
      }),
    },
    { workspacePath: "synthetic" },
    recipe,
  );
});
test("stale or missing copied bytes fail regardless of timestamp and source/output association", async () => {
  for (const missing of [false, true])
    await assert.rejects(
      () =>
        assertCopiedContent(
          {
            fingerprint: async (_target, paths) => ({
              digest: "aggregate",
              files: paths
                .filter((path) => !missing || path.startsWith("Web/"))
                .map((path) => ({ path, bytes: 3, digest: path, modifiedAt: Date.now() })),
            }),
          },
          { workspacePath: "synthetic" },
          recipe,
        ),
      /differs/,
    );
});
test("historical literal and v1/v2 output associations remain unchanged", async () => {
  for (const scope of [undefined, { version: 1 }, { version: 2 }]) {
    const historical = { expectedOutputs: ["out.dll"], sourceScope: scope } as GraphRecipe;
    assert.deepEqual(associatedBuildPaths(historical), ["out.dll"]);
    await assertCopiedContent(
      {
        fingerprint: async () => {
          throw Error("Historical path must not invoke new reader");
        },
      },
      { workspacePath: "synthetic" },
      historical,
    );
  }
});
