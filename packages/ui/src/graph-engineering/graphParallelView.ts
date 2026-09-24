import type { GraphParallelPlan, GraphParallelRun } from "@zcode/services";
export function emptyParallelPlan(): GraphParallelPlan {
  return {
    version: 1,
    revision: 0,
    enabled: false,
    name: "Fork / Join",
    request: "",
    sharedContract: "",
    resultRequirements: "",
    concurrency: 2,
    deadlineMs: 600000,
    admissionBudget: 5,
    buildRecipeId: "",
    testRecipeId: "",
    branches: ["worker-a", "worker-b"].map((id) => ({
      id,
      name: id,
      selected: true,
      instructions: "",
      files: [],
      additions: [],
    })),
  };
}
export function parallelConflicts(run: GraphParallelRun) {
  const paths = new Map<string, string[]>();
  for (const branch of run.children)
    for (const file of branch.proposal?.files ?? [])
      paths.set(file.path, [...(paths.get(file.path) ?? []), branch.id]);
  return [...paths].filter(([, branches]) => branches.length > 1);
}
