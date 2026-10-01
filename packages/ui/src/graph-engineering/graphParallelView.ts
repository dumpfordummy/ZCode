import type { GraphParallelPlan, GraphParallelRun, GraphParallelView } from "@zcode/services";
/** 受支持安装包默认关闭并行：只有存在历史并行数据或策略允许实验时才显示高级入口。 */
export function parallelAdvancedVisible(view: GraphParallelView | null): boolean {
  if (!view) return false;
  if (view.policy.mode === "experimental") return true;
  return view.runs.length > 0 || Boolean(view.plan);
}
/** 策略关闭时，新的并行准入（保存启用、预览、准备、批准）在界面中被禁用；检查/取消/清理不受影响。 */
export function parallelAdmissionsBlocked(view: GraphParallelView | null | undefined): boolean {
  return view?.policy.mode === "disabled";
}
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
