import type {
  GraphDotnetPreset,
  GraphProjectDiscovery,
  GraphRecipe,
  GraphChecksSelection,
} from "@zcode/services";

export function quickDotnetChoices(discovery: GraphProjectDiscovery) {
  const candidates = discovery.candidates;
  const projects = candidates.filter((item) => item.kind === "project");
  const solutions = candidates.filter((item) => item.kind === "solution");
  const builds =
    solutions.length === 1 && projects.every((item) => solutions[0]!.projects.includes(item.path))
      ? solutions
      : candidates;
  const scopes = projects
    .filter((item) => item.runner === "vstest" && item.quick)
    .flatMap((item) =>
      item.frameworks.map((framework) => ({
        id: `${item.path}|${framework}`,
        project: item.path,
        framework,
        assembly: item.quick!.assemblies[framework]!,
      })),
    );
  return { builds, scopes };
}

export function quickDotnetPreset(
  discovery: GraphProjectDiscovery,
  buildPath: string,
  scopeIds: string[],
  text: string,
): GraphDotnetPreset {
  if (
    discovery.status !== "complete" ||
    !discovery.prepared ||
    discovery.prepared.scope.project !== buildPath
  )
    throw Error("Prepare the selected Build target to establish its complete input scope.");
  const { scopes } = quickDotnetChoices(discovery);
  const build = discovery.candidates.find((item) => item.path === buildPath);
  if (!build || build.coverage === "unsupported") throw Error("Choose a supported Build target.");
  const reachable = new Set<string>();
  const visit = (path: string) => {
    if (reachable.has(path)) return;
    const item = discovery.candidates.find((candidate) => candidate.path === path);
    if (
      !item ||
      item.coverage === "unsupported" ||
      item.quickIssues?.length ||
      (item.kind === "project" && !item.quick)
    )
      throw Error(
        `${path}: ${item?.quickIssues?.join(" ") || item?.issues.join(" ") || "Quick metadata unavailable; use Advanced."}`,
      );
    reachable.add(path);
    item.projects.forEach(visit);
  };
  visit(buildPath);
  if (!scopeIds.length || scopeIds.length > 7 || new Set(scopeIds).size !== scopeIds.length)
    throw Error("Choose one to seven ordered Test scopes.");
  const tests = scopeIds.map((id) => {
    const scope = scopes.find((item) => item.id === id);
    if (!scope || !reachable.has(scope.project))
      throw Error("Every selected Test must be built by the selected Build target.");
    const { id: _id, ...target } = scope;
    return { ...target, configuration: "Debug", minimumTests: 1, requiredTests: [] };
  });
  const existing: unknown = JSON.parse(text);
  if (!Array.isArray(existing))
    throw Error("Use Advanced to repair the existing check configuration.");
  const ids = new Set(existing.map((item) => item?.id));
  let idPrefix = "dotnet";
  for (
    let index = 2;
    [...ids].some((id) => typeof id === "string" && id.startsWith(`${idPrefix}-`));
    index++
  )
    idPrefix = `dotnet${index}`;
  return {
    idPrefix,
    executable: "dotnet",
    cwd: ".",
    timeoutMs: 120000,
    buildProject: buildPath,
    configuration: "Debug",
    sourcePaths: [],
    sourceScope: discovery.prepared.scope,
    expectedOutputs: [...new Set(tests.map((test) => test.assembly))],
    reviewedManifest: true,
    tests,
  };
}

/** Saved assembly declarations establish the unique association; recipe names/IDs never do. */
export function associatedQuickChecks(
  recipes: GraphRecipe[],
): Extract<GraphChecksSelection, { kind: "recipes" }> | undefined {
  const builds = recipes.filter((recipe) => recipe.verifier.kind === "build");
  const tests = recipes.filter((recipe) => recipe.verifier.kind === "test");
  if (
    builds.length !== 1 ||
    !tests.length ||
    recipes.length !== tests.length + 1 ||
    recipes.length > 8
  )
    return;
  const build = builds[0]!;
  if (
    !tests.every(
      (test) =>
        test.verifier.kind === "test" &&
        test.verifier.format === "dotnet-vstest-trx-v1" &&
        build.expectedOutputs.includes(test.verifier.target.assembly) &&
        test.cwd === build.cwd &&
        JSON.stringify(test.sourceScope) === JSON.stringify(build.sourceScope) &&
        JSON.stringify(test.sourcePaths) === JSON.stringify(build.sourcePaths),
    )
  )
    return;
  return {
    kind: "recipes",
    recipeIds: [build.id, ...tests.map((test) => test.id)],
    buildMappings: Object.fromEntries(tests.map((test) => [test.id, build.id])),
  };
}
