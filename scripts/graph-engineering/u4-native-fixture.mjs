import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, cp, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { prepareU3Fixture } from "./u3-native-fixture.mjs";

export const TEST_SOURCE = `using Xunit;
using System;
using System.IO;
namespace B1.Tests;
public class ArithmeticTests {
  [Fact] public void AddPositive() {
    Assert.Equal("expected", File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "content.txt")).Trim());
    Assert.Equal(42, U4.Shared.Value);
  }
  [Fact] public void AddNegative() => Assert.Equal("settings", File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "settings.txt")).Trim());
  [Fact] public void AddZero() {
    using var stream = typeof(ArithmeticTests).Assembly.GetManifestResourceStream("U4.Resource");
    Assert.NotNull(stream);
    using var reader = new StreamReader(stream!);
    Assert.Equal("resource", reader.ReadToEnd().Trim());
  }
}
`;
export const FAIL_SOURCE = TEST_SOURCE.replace('Assert.Equal("expected",', 'Assert.Equal("wrong",');
export async function prepareU4Fixture(isolation) {
  const base = await prepareU3Fixture(isolation);
  const ws = isolation.workspace;
  // Rebase retained synthetic restore artifacts onto complete cached packages. No restore/network.
  const cache = path.join(isolation.home, "nuget-packages");
  const oldCache = isolation.env.NUGET_PACKAGES;
  const assets = JSON.parse(await readFile(path.join(ws, "Tests/obj/project.assets.json"), "utf8"));
  for (const library of Object.values(assets.libraries).filter(
    (entry) => entry.type === "package",
  )) {
    const source = path.join(homedir(), ".nuget/packages", library.path);
    assert.ok(
      (await stat(path.join(source, ".nupkg.metadata"))).isFile(),
      `Cached package incomplete: ${library.path}`,
    );
    await cp(source, path.join(cache, library.path), { recursive: true });
  }
  for (const project of ["Tests", "Library"]) {
    const obj = path.join(ws, project, "obj");
    for (const name of await readdir(obj)) {
      if (!/\.(json|props|targets)$/.test(name)) continue;
      const file = path.join(obj, name);
      const original = await readFile(file, "utf8");
      const replacements = [
        [oldCache, cache],
        [oldCache.replaceAll("\\", "\\\\"), cache.replaceAll("\\", "\\\\")],
      ];
      await writeFile(
        file,
        replacements.reduce((text, [from, to]) => text.replaceAll(from, to), original),
      );
    }
  }
  isolation.env.NUGET_PACKAGES = cache;
  for (const name of ["shared", "metadata", "Tests/data"])
    await mkdir(path.join(ws, name), { recursive: true });
  const files = {
    "Tests/ArithmeticTests.cs": TEST_SOURCE,
    "Tests/data/content.txt": "expected\n",
    "Tests/settings.txt": "settings\n",
    "Tests/data/resource.dat": "resource\n",
    "shared/Shared.cs":
      "namespace U4; public static class Shared { public static int Value => 42; }\n",
    "Directory.Build.props": `<Project><PropertyGroup Condition="'$(Configuration)' == 'Release'"><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>`,
    "metadata/inputs.props": `<Project><ItemGroup><Content Include="data/content.txt" CopyToOutputDirectory="Always" TargetPath="content.txt"/><None Update="settings.txt" CopyToOutputDirectory="PreserveNewest"/><EmbeddedResource Include="data/resource.dat" LogicalName="U4.Resource"/><Compile Include="../shared/Shared.cs" Link="Shared.cs"/></ItemGroup></Project>`,
  };
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(ws, name), value);
  const project = path.join(ws, "Tests/B1.Tests.csproj");
  await writeFile(
    project,
    (await readFile(project, "utf8")).replace(
      "</Project>",
      '<Import Project="../metadata/inputs.props"/></Project>',
    ),
  );
  return { ...base, contentConsumedByRealTests: true, sourceCount: 5013 };
}
