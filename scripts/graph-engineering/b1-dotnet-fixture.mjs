import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { configureDotnetEnvironment, runDotnet } from "./z4-fixture.mjs";

export const TEST_SOURCE = `using Xunit;
namespace B1.Tests;
public class ArithmeticTests {
  [Fact] public void AddPositive() => Assert.Equal(5, B1.Library.Arithmetic.Add(2, 3));
  [Fact] public void AddNegative() => Assert.Equal(0, B1.Library.Arithmetic.Add(-2, 2));
  [Fact] public void AddZero() => Assert.Equal(0, B1.Library.Arithmetic.Add(0, 0));
}
`;
export const FAIL_SOURCE = TEST_SOURCE.replace("Assert.Equal(5,", "Assert.Equal(6,");
export async function prepareB1Fixture(isolation) {
  await configureDotnetEnvironment(isolation);
  const ws = isolation.workspace;
  const cache = process.env.B1_NUGET_CACHE;
  assert.ok(cache, "B1_NUGET_CACHE must name the existing public package cache");
  Object.assign(isolation.env, { VSTEST_TELEMETRY_OPTEDIN: "0", DOTNET_CLI_UI_LANGUAGE: "en-US" });
  for (const folder of ["Library", "Tests", "docs"])
    await mkdir(path.join(ws, folder), { recursive: true });
  const props =
    "<TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable>";
  const files = {
    "Library/B1.Library.csproj": `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${props}</PropertyGroup></Project>\n`,
    "Library/Arithmetic.cs":
      "namespace B1.Library; public static class Arithmetic { public static int Add(int a, int b) => a + b; }\n",
    "Tests/B1.Tests.csproj": `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>${props}<IsTestProject>true</IsTestProject><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><ProjectReference Include="../Library/B1.Library.csproj" /><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" /><PackageReference Include="xunit" Version="2.5.3" /><PackageReference Include="xunit.runner.visualstudio" Version="2.5.3" /></ItemGroup></Project>\n`,
    "Tests/ArithmeticTests.cs": TEST_SOURCE,
    "global.json": JSON.stringify({ sdk: { version: "8.0.425", rollForward: "disable" } }),
    "NuGet.Config": "<configuration><packageSources><clear /></packageSources></configuration>",
    "docs/Notes.md": "B1 synthetic context. Verify the three arithmetic assertions.\n",
    "AGENTS.md":
      "Owned synthetic B1 fixture. Only run the explicitly reviewed native checks. Do not inspect parent directories, install packages, commit, or publish.\n",
    ".gitignore": "**/bin/\n**/obj/\n.zcode/\n",
    "B1.sln": `Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "B1.Library", "Library\\B1.Library.csproj", "{11111111-1111-4111-8111-111111111111}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "B1.Tests", "Tests\\B1.Tests.csproj", "{22222222-2222-4222-8222-222222222222}"
EndProject
Global
  GlobalSection(SolutionConfigurationPlatforms) = preSolution
    Debug|Any CPU = Debug|Any CPU
  EndGlobalSection
  GlobalSection(ProjectConfigurationPlatforms) = postSolution
    {11111111-1111-4111-8111-111111111111}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
    {11111111-1111-4111-8111-111111111111}.Debug|Any CPU.Build.0 = Debug|Any CPU
    {22222222-2222-4222-8222-222222222222}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
    {22222222-2222-4222-8222-222222222222}.Debug|Any CPU.Build.0 = Debug|Any CPU
  EndGlobalSection
EndGlobal
`,
  };
  for (const [name, content] of Object.entries(files))
    await writeFile(path.join(ws, name), content);
  const sdk = await runDotnet(isolation, ["--version"]);
  assert.equal(sdk.exitCode, 0, sdk.stderr);
  assert.equal(sdk.stdout.trim(), "8.0.425");
  const git = await promisify(execFile)("git", ["--version"], {
    cwd: ws,
    env: isolation.env,
    windowsHide: true,
  });
  const restore = await runDotnet(isolation, [
    "restore",
    "B1.sln",
    "--configfile",
    "NuGet.Config",
    "--source",
    cache,
    "-p:NuGetAudit=false",
    "--disable-parallel",
  ]);
  await writeFile(
    path.join(isolation.home, "b1-bootstrap.json"),
    JSON.stringify({ sdk, git, restore }, null, 2),
  );
  assert.equal(restore.exitCode, 0, restore.stdout + restore.stderr);
  const assets = JSON.parse(await readFile(path.join(ws, "Tests/obj/project.assets.json"), "utf8"));
  return {
    sdk: sdk.stdout.trim(),
    git: git.stdout.trim(),
    restore: {
      exitCode: restore.exitCode,
      source: "existing local public NuGet package cache",
      network: false,
    },
    packages: Object.keys(assets.libraries),
  };
}
