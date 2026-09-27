import type { GraphDotnetBuildTarget, GraphDotnetTestTarget } from "../dotnet-types.js";
import type { GraphRecipe } from "../artifact-types.js";

export const graphTrxReportPath = ".zcode/graph-results/{operationId}/results.trx";
export const isDotnetExecutable = (value: string) =>
  /^dotnet(?:\.exe)?$/i.test(value.split(/[\\/]/).at(-1) ?? "");
export function dotnetBuildArgs(target: GraphDotnetBuildTarget): string[] {
  return [
    "build",
    target.project,
    "--configuration",
    target.configuration,
    ...(target.framework ? ["--framework", target.framework] : []),
    ...(target.runtime ? ["--runtime", target.runtime] : []),
    ...(target.restore === "disabled" ? ["--no-restore"] : []),
    "--no-incremental",
    "-t:Rebuild",
    "--disable-build-servers",
    "-p:UseSharedCompilation=false",
  ];
}
export function dotnetTestArgs(target: GraphDotnetTestTarget): string[] {
  return [
    "test",
    target.project,
    "--configuration",
    target.configuration,
    "--framework",
    target.framework,
    ...(target.runtime ? ["--runtime", target.runtime] : []),
    ...(target.filter ? ["--filter", target.filter] : []),
    "--no-build",
    "--no-restore",
    "--logger",
    "trx;LogFileName=results.trx",
    "--results-directory",
    ".zcode/graph-results/{operationId}",
  ];
}
export function dotnetRecipeIssues(recipe: GraphRecipe): string[] {
  const verifier = recipe.verifier;
  const build = verifier.kind === "build" ? verifier.dotnet : undefined;
  const test =
    verifier.kind === "test" && verifier.format === "dotnet-vstest-trx-v1" ? verifier : undefined;
  if (!build && !test) return [];
  const issues: string[] = [];
  if (!isDotnetExecutable(recipe.executable))
    issues.push("The .NET profile requires an explicit dotnet executable.");
  // 声明与实际命令必须同源；附加框架、属性或 logger 会使目标证据失真，因此不能默许。
  const expected = build ? dotnetBuildArgs(build) : dotnetTestArgs(test!.target);
  if (JSON.stringify(recipe.args) !== JSON.stringify(expected))
    issues.push(
      "The .NET command arguments must exactly match its explicit target profile; use the supported preset or retain a custom non-TRX recipe.",
    );
  if (recipe.cwd !== ".")
    issues.push(
      "The supported .NET profile uses workspace-root cwd; project, source and output paths are workspace relative.",
    );
  const project = build?.project ?? test!.target.project;
  if (!recipe.sourcePaths.includes(project))
    issues.push("The reviewed source manifest must include the selected project or solution file.");
  if (test && test.reportPath !== graphTrxReportPath)
    issues.push("TRX requires the unique operation-owned report path.");
  return issues;
}
