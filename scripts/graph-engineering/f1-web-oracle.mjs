import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { configureDotnetEnvironment, runDotnet } from "./z4-fixture.mjs";
import {
  webProfileEnvironment,
  captureWebProfileRuntime,
} from "../../packages/shared/src/node/webProfileProvenance.ts";
import { WEB_PROFILE_CONTROLS } from "../../packages/shared/src/web-profile.ts";

const configuration = process.argv.includes("--release") ? "Release" : "Debug";
const root = process.cwd();
const home = path.join(root, ".tmp", `f1-web-oracle-${Date.now()}-${randomUUID().slice(0, 6)}`);
const workspace = path.join(home, "workspace");
const isolation = {
  home,
  workspace,
  env: Object.fromEntries(
    [
      "SystemRoot",
      "WINDIR",
      "ComSpec",
      "PATHEXT",
      "PATH",
      "NUMBER_OF_PROCESSORS",
      "PROCESSOR_ARCHITECTURE",
    ].flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : [])),
  ),
};
const cache = process.env.F1_PUBLIC_PACKAGE_CACHE;
assert.ok(cache, "Explicit retained public package cache required");
await mkdir(workspace, { recursive: true });
await configureDotnetEnvironment(isolation);
Object.assign(isolation.env, {
  NUGET_PACKAGES: cache,
  TEMP: path.join(home, "temp"),
  TMP: path.join(home, "temp"),
  HOME: path.join(home, "user"),
  USERPROFILE: path.join(home, "user"),
  APPDATA: path.join(home, "user/AppData/Roaming"),
  LOCALAPPDATA: path.join(home, "user/AppData/Local"),
  DOTNET_CLI_UI_LANGUAGE: "en-US",
  VSTEST_TELEMETRY_OPTEDIN: "1",
});
const fixedProfile = process.argv.includes("--fixed-profile-environment");
if (fixedProfile) {
  isolation.env = webProfileEnvironment(workspace, {
    executable: "C:\\Program Files\\dotnet\\dotnet.exe",
    packageRoot: cache,
    systemRoot: process.env.SystemRoot,
  });
  for (const key of [
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "DOTNET_CLI_HOME",
    "MSBuildUserExtensionsPath",
    "PROGRAMFILES",
    "PROGRAMDATA",
  ])
    await mkdir(isolation.env[key], { recursive: true });
}
const files = {
  "global.json": JSON.stringify({ sdk: { version: "8.0.426", rollForward: "disable" } }),
  "NuGet.Config": "<configuration><packageSources><clear /></packageSources></configuration>",
  "Directory.Build.props": "<Project />",
  "Directory.Build.targets": "<Project />",
  "Directory.Packages.props": "<Project />",
  "Web/Web.csproj":
    '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>',
  "Web/Program.cs":
    'var builder = WebApplication.CreateBuilder(args); var app = builder.Build(); app.MapGet("/", () => WebValue.Answer); app.Run(); public static class WebValue { public static int Answer => 42; }',
  "Web/appsettings.json": '{"Expected":"web-config"}',
  "Web/wwwroot/site.txt": "static-web-content",
  "Tests/Tests.csproj":
    '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><IsTestProject>true</IsTestProject><IsPackable>false</IsPackable></PropertyGroup><ItemGroup><ProjectReference Include="../Web/Web.csproj"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0"/><PackageReference Include="xunit" Version="2.5.3"/><PackageReference Include="xunit.runner.visualstudio" Version="2.5.3"/></ItemGroup></Project>',
  "Tests/WebTests.cs": `using Xunit; using System.Text.Json;
public class WebTests {
 [Fact] public void ApplicationResult() => Assert.Equal(42,WebValue.Answer);
 [Fact] public void ImplicitConfiguration() { using var doc=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"appsettings.json"))); Assert.Equal("web-config",doc.RootElement.GetProperty("Expected").GetString()); }
 [Fact] public void StaticContentManifest() { using var doc=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Web.staticwebassets.runtime.json"))); var roots=doc.RootElement.GetProperty("ContentRoots"); Assert.Equal("static-web-content",File.ReadAllText(Path.Combine(roots[0].GetString()!,"site.txt"))); }
}`,
};
for (const dir of ["temp", "user/AppData/Roaming", "user/AppData/Local"])
  await mkdir(path.join(home, dir), { recursive: true });
for (const [name, text] of Object.entries(files)) {
  await mkdir(path.dirname(path.join(workspace, name)), { recursive: true });
  await writeFile(path.join(workspace, name), text);
}
const summary = {
  home,
  configuration,
  commands: [],
  status: "RUNNING",
  productSetupRestore: false,
  cachedFixtureBootstrap: true,
  fixedProfileEnvironment: fixedProfile,
  cases: [],
};
const controls = WEB_PROFILE_CONTROLS;
async function run(args) {
  const result = await runDotnet(isolation, args);
  summary.commands.push(result);
  await writeFile(path.join(home, "oracle.json"), JSON.stringify(summary, null, 2));
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  return result.stdout;
}
try {
  assert.equal((await run(["--version"])).trim(), "8.0.426");
  await run([
    "restore",
    "Tests/Tests.csproj",
    "--configfile",
    "NuGet.Config",
    "--packages",
    cache,
    "-p:NuGetAudit=false",
    "--disable-parallel",
    ...controls,
  ]);
  for (const project of ["Web/Web.csproj", "Tests/Tests.csproj"]) {
    const query = await run([
      "msbuild",
      project,
      "-nologo",
      "-noAutoResponse",
      "-maxCpuCount:1",
      "-nodeReuse:false",
      `-p:Configuration=${configuration}`,
      "-p:TargetFramework=net8.0",
      ...controls,
      "-getProperty:NETCoreSdkVersion,MSBuildVersion,TargetPath,TargetFramework,Configuration,UsingMicrosoftNETSdkWeb,ProjectAssetsFile,BaseOutputPath,BaseIntermediateOutputPath,TargetingPackRoot,NetCoreRoot,RuntimeFrameworkVersion,MSBuildAllProjects,EnableRequestDelegateGenerator,EnableConfigurationBindingGenerator,StaticWebAssetsEnabled",
      "-getItem:Content,Compile,Analyzer,FrameworkReference,PackageReference,ProjectReference,StaticWebAsset",
    ]);
    await writeFile(path.join(home, path.basename(project) + ".query.json"), query);
  }
  await run([
    "build",
    "Tests/Tests.csproj",
    "--configuration",
    configuration,
    "--no-restore",
    "--no-incremental",
    "--disable-build-servers",
    "-p:UseSharedCompilation=false",
    ...controls,
  ]);
  await run([
    "test",
    "Tests/Tests.csproj",
    "--configuration",
    configuration,
    "--no-restore",
    "--no-build",
    "--logger",
    "trx;LogFileName=oracle.trx",
    "--results-directory",
    path.join(home, "results"),
    ...controls,
  ]);
  summary.cases.push({ name: "plain-web-content-application", status: "PASS", tests: 3 });
  const manifest = JSON.parse(
    await readFile(
      path.join(workspace, `Web/obj/${configuration}/net8.0/staticwebassets.build.json`),
      "utf8",
    ),
  );
  assert.equal(manifest.Assets.length, 1);
  assert.equal(manifest.Assets[0].RelativePath, "site.txt");
  summary.staticAssets = manifest.Assets.map((a) => ({
    relativePath: a.RelativePath,
    sourceType: a.SourceType,
    assetKind: a.AssetKind,
    assetMode: a.AssetMode,
  }));
  const runtime = JSON.parse(
    await readFile(
      path.join(workspace, `Tests/bin/${configuration}/net8.0/Web.staticwebassets.runtime.json`),
      "utf8",
    ),
  );
  summary.runtimeContentRoots = runtime.ContentRoots;
  summary.sourceSha256 = Object.fromEntries(
    await Promise.all(
      Object.keys(files).map(async (name) => [
        name,
        createHash("sha256")
          .update(await readFile(path.join(workspace, name)))
          .digest("hex"),
      ]),
    ),
  );
  if (fixedProfile) {
    const runtime = await captureWebProfileRuntime({
      workspace,
      executable: "C:\\Program Files\\dotnet\\dotnet.exe",
      packageRoot: cache,
      systemRoot: process.env.SystemRoot,
    });
    summary.profileProvenance = {
      toolchainDigest: runtime.toolchainDigest,
      resolverDigest: runtime.resolverDigest,
      environmentDigest: runtime.environmentDigest,
      files: runtime.observedFiles,
      bytes: runtime.observedBytes,
    };
  }
  summary.status = "PASS";
} catch (e) {
  summary.status = "FAIL";
  summary.error = String(e.stack ?? e);
  process.exitCode = 1;
}
await writeFile(path.join(home, "oracle.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ home, status: summary.status, error: summary.error }));
