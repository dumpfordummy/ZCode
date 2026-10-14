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
    .filter((item) => item.runner === "vstest")
    .flatMap((item) =>
      item.frameworks.map((framework) => ({
        id: `${item.path}|${framework}`,
        project: item.path,
        framework,
        assembly: item.quick?.assemblies[framework] ?? "",
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
  const selected = discovery.candidates.find((item) => item.path === buildPath);
  const selectedIssue = selected?.quickIssues?.[0] ?? selected?.issues[0];
  if (selectedIssue)
    throw Error(
      selectedIssue.startsWith(`${buildPath}:`) ? selectedIssue : `${buildPath}: ${selectedIssue}`,
    );
  if (
    discovery.status !== "complete" ||
    !discovery.prepared ||
    discovery.prepared.scope.project !== buildPath
  )
    throw Error(
      discovery.issues[0] ??
        (discovery.status === "cancelled"
          ? "Preparation was cancelled. Prepare the selected target again."
          : "Prepare the selected Build target to establish its complete input scope."),
    );
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
  const configuration =
    discovery.prepared.scope.version === 2 ? discovery.prepared.scope.configuration : "Debug";
  if (!scopeIds.length || scopeIds.length > 7 || new Set(scopeIds).size !== scopeIds.length)
    throw Error("Choose one to seven ordered Test scopes.");
  const tests = scopeIds.map((id) => {
    const scope = scopes.find((item) => item.id === id);
    if (!scope || !reachable.has(scope.project))
      throw Error(
        "This test project is not built by the selected target. Select its project or a solution that includes it.",
      );
    const { id: _id, ...target } = scope;
    return { ...target, configuration, minimumTests: 1, requiredTests: [] };
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
    configuration,
    sourcePaths: [],
    sourceScope: discovery.prepared.scope,
    expectedOutputs: [...new Set(tests.map((test) => test.assembly))],
    reviewedManifest: true,
    tests,
  };
}

/** Display is a projection of prepared closure; inventory hints are not selectable evidence. */
export function quickDotnetSelection(
  inventory: GraphProjectDiscovery,
  prepared: GraphProjectDiscovery | undefined,
  build: string,
  groupCopies = false,
) {
  const byPath = new Map(prepared?.candidates.map((item) => [item.path, item]));
  const reachable = new Set<string>();
  const pending = [build];
  while (pending.length) {
    const path = pending.pop()!;
    if (reachable.has(path)) continue;
    const candidate = byPath.get(path);
    if (!candidate) continue;
    reachable.add(path);
    pending.push(...candidate.projects);
  }
  const scopes =
    prepared?.status === "complete" && prepared.prepared?.scope.project === build
      ? quickDotnetChoices(prepared).scopes.filter((scope) => reachable.has(scope.project))
      : [];
  const metadata = new Map(inventory.metadata.map((item) => [item.path, item.digest]));
  const groups = new Map<string, string[]>();
  for (const candidate of inventory.candidates) {
    const digest = metadata.get(candidate.path);
    if (candidate.kind !== "project" || !digest) continue;
    const paths = groups.get(digest) ?? [];
    paths.push(candidate.path);
    groups.set(digest, paths);
  }
  const copies = [...groups.values()].filter((paths) => paths.length > 1);
  const hidden = new Set(
    groupCopies ? copies.flatMap((paths) => paths.slice(1).filter((p) => p !== build)) : [],
  );
  return {
    builds: inventory.candidates.filter((item) => !hidden.has(item.path)),
    scopes,
    copies,
    hidden: hidden.size,
    // This suggests the actual test project, never an inferred app/test relationship.
    alternatives: quickDotnetChoices(inventory).scopes.filter(
      (scope) => !reachable.has(scope.project),
    ),
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
