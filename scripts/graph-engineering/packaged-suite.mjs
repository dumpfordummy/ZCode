/**
 * 打包验收套件的纯判定逻辑（Z8.1 后续）：什么算「完整套件通过」、什么只是子集。
 * 与 packaged-smoke.mjs 分开，是为了不启动 Electron 就能测试这些规则。
 */

export function caseOutcome(exitCode, result) {
  return exitCode === 0 && result?.status === "PASS" ? "PASS" : "FAIL";
}

/**
 * @param {{ allCaseNames: string[], selectedNames: string[], results: Array<{name: string, exitCode: number | null, status?: string}> }} input
 * results 里没有出现的已选用例视为「未运行」（例如非 keep-going 模式在首个失败处停止）。
 */
export function summarizeSuite({ allCaseNames, selectedNames, results }) {
  const scope =
    allCaseNames.length === selectedNames.length &&
    allCaseNames.every((name) => selectedNames.includes(name))
      ? "full"
      : "subset";
  const outcome = new Map(results.map((r) => [r.name, caseOutcome(r.exitCode, r)]));
  const failed = selectedNames.filter((name) => outcome.get(name) === "FAIL");
  const notRun = selectedNames.filter((name) => !outcome.has(name));
  const notSelected = allCaseNames.filter((name) => !selectedNames.includes(name));
  const everythingSelectedPassed = failed.length === 0 && notRun.length === 0;
  return {
    scope,
    status: !everythingSelectedPassed ? "FAIL" : scope === "full" ? "PASS" : "SUBSET-PASS",
    // 只有完整套件全部通过才满足发布门；子集永远不满足。
    satisfiesFullReleaseGate: scope === "full" && everythingSelectedPassed,
    // 进程退出码：任何失败或未运行的已选用例都必须非零；全部通过（含子集）为零，
    // 但子集的状态词是 SUBSET-PASS，不会被当作完整套件。
    exitCode: everythingSelectedPassed ? 0 : 1,
    failed,
    notRun,
    notSelected,
    passed: selectedNames.filter((name) => outcome.get(name) === "PASS"),
  };
}

export function parseCaseFilter(value, allCaseNames) {
  const requested = value?.split(",").filter(Boolean);
  if (!requested?.length) return { selectedNames: [...allCaseNames], filtered: false };
  const unknown = requested.filter((name) => !allCaseNames.includes(name));
  if (unknown.length) throw new Error(`Unknown packaged case(s): ${unknown.join(", ")}`);
  if (new Set(requested).size !== requested.length)
    throw new Error("Duplicate packaged case name.");
  // 保持套件内的原始顺序。
  return { selectedNames: allCaseNames.filter((name) => requested.includes(name)), filtered: true };
}
