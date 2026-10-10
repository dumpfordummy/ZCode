import type { GraphRecipe } from "../artifact-types.js";
import type { GraphDotnetPreset } from "../project-setup-types.js";
import { validateGraphRecipes } from "./artifact-schemas.js";
import { dotnetBuildArgs, dotnetTestArgs, graphTrxReportPath } from "./dotnet-command.js";

/** A proposal only. Saving and native execution remain separate explicit commands. */
export function compileDotnetRecipes(input: GraphDotnetPreset): GraphRecipe[] {
  if (input.reviewedManifest !== true)
    throw new Error(
      "Review the complete source and Build output manifest before creating a verified preset.",
    );
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(input.idPrefix))
    throw new Error("Choose a bounded unique recipe ID prefix.");
  if (!input.tests.length || input.tests.length > 7)
    throw new Error(
      "Select one to seven explicit Test scopes plus Build within the existing eight-Tool calibration limit.",
    );
  const target = {
    project: input.buildProject,
    configuration: input.configuration,
    ...(input.framework ? { framework: input.framework } : {}),
    ...(input.runtime ? { runtime: input.runtime } : {}),
    restore: "disabled" as const,
  };
  const common = {
    executable: input.executable,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    sourcePaths: input.sourceScope
      ? [...new Set([input.buildProject, ...input.tests.map((test) => test.project)])].sort()
      : [...input.sourcePaths],
    ...(input.sourceScope ? { sourceScope: structuredClone(input.sourceScope) } : {}),
  };
  const recipes: GraphRecipe[] = [
    {
      ...common,
      id: `${input.idPrefix}-build`,
      name: "Build .NET checks",
      args: dotnetBuildArgs(target),
      expectedOutputs: [...input.expectedOutputs],
      verifier: { kind: "build", dotnet: target },
    },
  ];
  const scopes = new Set<string>();
  for (const [index, test] of input.tests.entries()) {
    const { minimumTests, expectedTests, requiredTests, ...scope } = test;
    if (!input.expectedOutputs.includes(scope.assembly))
      throw new Error(
        "Each selected test assembly must be included in the reviewed Build outputs.",
      );
    const key = JSON.stringify(scope);
    if (scopes.has(key)) throw new Error("Duplicate .NET test scope.");
    scopes.add(key);
    recipes.push({
      ...common,
      id: `${input.idPrefix}-test-${index + 1}`,
      name: `${scope.project} (${scope.framework})`,
      args: dotnetTestArgs(scope),
      expectedOutputs: [],
      verifier: {
        kind: "test",
        format: "dotnet-vstest-trx-v1",
        target: scope,
        reportPath: graphTrxReportPath,
        buildNodeId: "build",
        minimumTests,
        ...(expectedTests !== undefined ? { expectedTests } : {}),
        requiredTests: [...requiredTests],
      },
    });
  }
  return validateGraphRecipes(recipes);
}
