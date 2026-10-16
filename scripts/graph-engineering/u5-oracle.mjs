// Explicit disposable oracle only; never imported by the product or Detect.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProjectDiscovery } from "../../packages/services/src/graph-engineering/adapters/project-discovery.ts";

const root = await mkdtemp(path.join(tmpdir(), "u5-oracle-"));
const logs = path.resolve(".tmp/u5-logs");
await mkdir(logs, { recursive: true });
const receipt = { kind: "synthetic-msbuild-root-oracle", restoreExecuted: false, cases: [] };
const run = async (args) => {
  const result = await promisify(execFile)("dotnet", args, {
    cwd: root,
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      DOTNET_CLI_HOME: root,
      DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
      DOTNET_CLI_TELEMETRY_OPTOUT: "1",
      DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
      DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: "false",
      DOTNET_NOLOGO: "1",
      MSBuildEnableWorkloadResolver: "false",
    },
  });
  return result.stdout;
};
try {
  for (const [sdk, framework] of [
    ["8.0.425", "net8.0"],
    ["10.0.401", "net10.0"],
  ]) {
    await writeFile(
      path.join(root, "global.json"),
      JSON.stringify({ sdk: { version: sdk, rollForward: "disable" } }),
    );
    const version = (await run(["msbuild", "-version", "-nologo"])).trim().split(/\r?\n/).at(-1);
    for (const configuration of ["Debug", "Release"]) {
      const body = `<PropertyGroup><TargetFramework>${framework}</TargetFramework></PropertyGroup>`;
      const shapes = {
        pure: `<Project Sdk="Microsoft.NET.Sdk">${body}</Project>`,
        namespace: `<Project Sdk="Microsoft.NET.Sdk" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">${body}</Project>`,
        explicit: `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk"/>${body}<Import Project="Sdk.targets" Sdk="Microsoft.NET.Sdk"/></Project>`,
      };
      let baseline;
      for (const [shape, xml] of Object.entries(shapes)) {
        await writeFile(path.join(root, "Fixture.csproj"), xml);
        await writeFile(path.join(root, "Source.cs"), "public class Source {}");
        const args = [
          "msbuild",
          "Fixture.csproj",
          "-nologo",
          `-p:Configuration=${configuration}`,
          "-getProperty:TargetFramework,TargetPath",
          "-getItem:Compile,Content,None,EmbeddedResource",
        ];
        const start = performance.now();
        const value = JSON.parse(await run(args));
        const projection = {
          properties: {
            ...value.Properties,
            TargetPath: path.relative(root, value.Properties.TargetPath).replaceAll("\\", "/"),
          },
          items: Object.fromEntries(
            Object.entries(value.Items).map(([kind, entries]) => [
              kind,
              entries.map((item) => item.Identity).sort(),
            ]),
          ),
        };
        if (!baseline) baseline = projection;
        else assert.deepEqual(projection, baseline);
        const prepared = await createProjectDiscovery().scan({ workspacePath: root }, "oracle", {
          selectedProject: "Fixture.csproj",
          configuration,
        });
        assert.ok(prepared.prepared, prepared.issues.join(" "));
        assert.equal(
          prepared.candidates[0].quick.assemblies[framework],
          projection.properties.TargetPath,
        );
        receipt.cases.push({
          sdk,
          msbuild: version,
          configuration,
          shape,
          args,
          projection,
          elapsedMs: performance.now() - start,
        });
      }
    }
  }
  await mkdir(path.join(root, "wwwroot"), { recursive: true });
  await writeFile(path.join(root, "wwwroot/site.css"), "body {}");
  await writeFile(path.join(root, "appsettings.json"), "{}");
  await writeFile(
    path.join(root, "Fixture.csproj"),
    '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>',
  );
  const web = JSON.parse(
    await run([
      "msbuild",
      "Fixture.csproj",
      "-nologo",
      "-getItem:Content",
      "-getProperty:UsingMicrosoftNETSdkWeb,UsingMicrosoftNETSdkRazor,StaticWebAssetsEnabled",
    ]),
  );
  receipt.web = {
    properties: web.Properties,
    content: web.Items.Content.map((item) => item.Identity.replaceAll("\\", "/")),
    supported: false,
  };
  assert.ok(receipt.web.content.includes("wwwroot/site.css"));
  assert.ok(receipt.web.content.includes("appsettings.json"));
  receipt.status = "PASS";
} catch (error) {
  receipt.status = "FAIL";
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(path.join(logs, "oracle.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
  console.log(`Retained synthetic fixture: ${root}`);
}
