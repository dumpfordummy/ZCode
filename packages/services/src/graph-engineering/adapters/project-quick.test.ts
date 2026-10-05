import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectDiscovery } from "./project-discovery.js";

const project = (extra = "") =>
  `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework>${extra}</PropertyGroup><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1" /><PackageReference Include="xunit" Version="2.9.0" /></ItemGroup></Project>`;
test("Quick discovery derives literal SDK outputs without executing, restoring or contacting feeds", async () => {
  const root = await mkdtemp(join(tmpdir(), "quick-dotnet-"));
  try {
    await writeFile(join(root, "Demo.Tests.csproj"), project());
    const result = await createProjectDiscovery().scan({ workspacePath: root }, "quick");
    assert.deepEqual(result.candidates[0]?.quick, {
      configuration: "Debug",
      assemblies: { "net8.0": "bin/Debug/net8.0/Demo.Tests.dll" },
    });
    assert.deepEqual(result.candidates[0]?.quickIssues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Quick refuses custom outputs, runtime, unknown properties, misleading runner hints and imported defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "quick-dotnet-"));
  try {
    for (const extra of [
      "<OutputPath>custom</OutputPath>",
      "<RuntimeIdentifier>win-x64</RuntimeIdentifier>",
      "<Unknown>true</Unknown>",
      "<TargetFramework>net9.0</TargetFramework>",
    ]) {
      await writeFile(join(root, "Tests.csproj"), project(extra));
      const candidate = (await createProjectDiscovery().scan({ workspacePath: root }, "custom"))
        .candidates[0]!;
      assert.equal(candidate.quick, undefined);
      assert.ok(candidate.quickIssues?.length);
    }
    await writeFile(
      join(root, "Tests.csproj"),
      project().replace('Include="Microsoft.NET.Test.Sdk"', 'Include="NotMicrosoft.NET.Test.Sdk"'),
    );
    assert.equal(
      (await createProjectDiscovery().scan({ workspacePath: root }, "runner")).candidates[0]?.quick,
      undefined,
    );
    await writeFile(join(root, "Tests.csproj"), project());
    await writeFile(join(root, "Directory.Build.props"), "<Project />");
    const candidate = (await createProjectDiscovery().scan({ workspacePath: root }, "props"))
      .candidates[0]!;
    assert.equal(candidate.quick, undefined);
    assert.match(candidate.quickIssues!.join(" "), /Directory.Build.props/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
