import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import assert from "node:assert/strict";
import { prepareCSharpFixture, SOURCE_PATHS, BUILD_ARGS, TEST_ARGS } from "./z4-fixture.mjs";
import { PROJECT, RUNNER, GOOD_SOURCE } from "./z4-csharp-source.mjs";
import { fixtureRecipes } from "./z4-recipes.mjs";

export const contribution = (name, value) =>
  `public static class ${name} { public const int Value = ${value}; }\n`;
export const Z7_SOURCE_PATHS = [...SOURCE_PATHS, "PartA.cs", "PartB.cs"];
export const z7Recipes = () =>
  fixtureRecipes("build").map((r) => ({ ...r, sourcePaths: Z7_SOURCE_PATHS }));
export const z7Runner = RUNNER;
export async function prepareZ7Fixture(isolation) {
  await prepareCSharpFixture(isolation);
  const files = {
    "Z4Fixture.csproj": PROJECT.replace(
      '<Compile Include="MathOps.cs" />',
      '<Compile Include="MathOps.cs" /><Compile Include="PartA.cs" /><Compile Include="PartB.cs" />',
    ),
    "MathOps.cs": GOOD_SOURCE.replace(
      "left + right;",
      "left + right + (PartA.Value == 1 && PartB.Value == 1 ? 1 : 0);",
    ),
    "PartA.cs": contribution("PartA", 0),
    "PartB.cs": contribution("PartB", 0),
    ".gitignore": "bin/\nobj/\nresults/*\n!results/.gitkeep\n.zcode/\n.env\n",
    "AGENTS.md":
      "Synthetic Z7 workspace. Read/write only the explicitly requested PartA.cs or PartB.cs. Preserve Runner.cs and all three assertions. The combined (1,1) state is invalid; isolated branch edits can each pass. Use local offline dotnet Build/Test. Never inspect parent folders, modify configuration, stage, commit, push or merge.\n",
    "results/.gitkeep": "",
    ".zcode/config.json": JSON.stringify({ graphRecipes: z7Recipes() }),
  };
  await mkdir(path.join(isolation.workspace, ".zcode"), { recursive: true });
  for (const [file, text] of Object.entries(files))
    await writeFile(path.join(isolation.workspace, file), text);
  const git = async (args) =>
    (
      await promisify(execFile)(
        "git",
        ["-c", "core.hooksPath=", "-c", "core.autocrlf=false", ...args],
        { cwd: isolation.workspace, env: isolation.env, windowsHide: true },
      )
    ).stdout;
  // 仅在本次生成的合成仓库创建种子提交，绝不操作开发 checkout 的索引或提交。
  assert.equal(path.dirname(isolation.workspace), isolation.home);
  await git(["add", "--", "."]);
  await git([
    "-c",
    "user.name=Z7 Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "Synthetic frozen Z7 base",
  ]);
  assert.equal(await git(["status", "--porcelain"]), "");
  return { base: (await git(["rev-parse", "HEAD"])).trim(), files };
}
export const branchTestCommand = () => {
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const build = ["dotnet", ...BUILD_ARGS.map(quote)].join(" ");
  const test = [
    "dotnet",
    ...TEST_ARGS.map((v) =>
      quote(
        v
          .replace("{operationId}", "z7-independent-branch")
          .replace("{sourceDigest}", "branch-experiment")
          .replace("{buildDigest}", "branch-experiment")
          .replace("{reportPath}", "results/branch.json"),
      ),
    ),
  ].join(" ");
  return `${build} && ${test}`;
};
