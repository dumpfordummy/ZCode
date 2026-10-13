import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareU4Fixture } from "./u4-native-fixture.mjs";
import { runDotnet } from "./z4-fixture.mjs";
import { createProjectDiscovery } from "../../packages/services/src/graph-engineering/adapters/project-discovery.ts";
import { declarativeProject } from "../../packages/services/src/graph-engineering/domain/project-declarative.ts";
import { evaluateFileItems } from "../../packages/services/src/graph-engineering/domain/project-items.ts";

// Explicit synthetic test oracle only. This is never imported by application code.
const isolation = await createIsolation();
const summary = { kind: "synthetic-msbuild-oracle", restoreExecuted: false, configurations: [] };
try {
  await prepareU4Fixture(isolation);
  const version = await runDotnet(isolation, ["msbuild", "-version", "-nologo"]);
  assert.equal(version.exitCode, 0);
  summary.msbuild = version.stdout.trim();
  for (const configuration of ["Debug", "Release"]) {
    const args = [
      "msbuild",
      "Tests/B1.Tests.csproj",
      "-nologo",
      `-p:Configuration=${configuration}`,
      "-getProperty:Configuration,TargetFramework,TargetPath",
      "-getItem:Content,None,EmbeddedResource",
    ];
    const start = performance.now();
    const result = await runDotnet(isolation, args);
    const evaluationMs = performance.now() - start;
    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(Buffer.byteLength(result.stdout) < 512 * 1024, "bounded allowlisted oracle output");
    const value = JSON.parse(result.stdout);
    const item = (kind, file) =>
      value.Items[kind].find((entry) => entry.Identity.replaceAll("\\", "/") === file);
    assert.equal(item("Content", "data/content.txt").CopyToOutputDirectory, "Always");
    assert.equal(item("Content", "data/content.txt").TargetPath, "content.txt");
    assert.equal(item("None", "settings.txt").CopyToOutputDirectory, "PreserveNewest");
    assert.equal(item("EmbeddedResource", "data/resource.dat").LogicalName, "U4.Resource");
    const prepared = await createProjectDiscovery().scan(
      { workspacePath: isolation.workspace },
      "oracle",
      { selectedProject: "Tests/B1.Tests.csproj", configuration },
    );
    assert.equal(prepared.status, "complete", prepared.issues.join(" "));
    const assembly = prepared.candidates.find((entry) => entry.path === "Tests/B1.Tests.csproj")
      .quick.assemblies["net8.0"];
    assert.equal(
      path.relative(isolation.workspace, value.Properties.TargetPath).replaceAll("\\", "/"),
      assembly,
    );
    summary.configurations.push({
      configuration,
      args,
      assembly,
      elapsedMs: performance.now() - start,
      evaluationMs,
      prepareMs: performance.now() - start - evaluationMs,
      content: true,
      none: true,
      resource: true,
    });
  }
  const ordering = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><EnableDefaultItems>false</EnableDefaultItems></PropertyGroup><ItemGroup><Content Include="data/a.txt;data/b.txt"/><Content Include="data/?.txt" Exclude="data/a.txt;data/b.txt"/><Content Update="data/a.txt" CopyToOutputDirectory="Always"/><Content Remove="data/b.txt"/><None Update="absent.txt" CopyToOutputDirectory="Always"/><Content Include="empty/**/*.txt"/></ItemGroup></Project>`;
  for (const name of ["a", "b", "c"])
    await writeFile(path.join(isolation.workspace, `Tests/data/${name}.txt`), name);
  await writeFile(path.join(isolation.workspace, "Tests/Ordering.csproj"), ordering);
  const ordered = await runDotnet(isolation, [
    "msbuild",
    "Tests/Ordering.csproj",
    "-nologo",
    "-getItem:Content,None",
  ]);
  assert.equal(ordered.exitCode, 0, ordered.stderr);
  const actual = JSON.parse(ordered.stdout).Items;
  const declaration = declarativeProject(
    "Tests/Ordering.csproj",
    new Map([["tests/ordering.csproj", ordering]]),
  );
  const expected = evaluateFileItems(
    "Tests/Ordering.csproj",
    ["Tests/data/a.txt", "Tests/data/b.txt", "Tests/data/c.txt"],
    declaration.operations,
    declaration.defaults,
  );
  assert.deepEqual(
    actual.Content.map((item) => ({
      path: `Tests/${item.Identity.replaceAll("\\", "/")}`,
      copy: item.CopyToOutputDirectory ?? "",
    })),
    expected.map((item) => ({ path: item.path, copy: item.metadata.CopyToOutputDirectory ?? "" })),
  );
  assert.equal(actual.None.length, 0);
  summary.orderedItems = {
    lists: true,
    questionWildcard: true,
    excludeLocal: true,
    updateExistingOnly: true,
    remove: true,
    emptyGlob: true,
    count: expected.length,
  };
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error.message;
  process.exitCode = 1;
} finally {
  await mkdir("docs/graph-engineering/z8/evidence/u4", { recursive: true });
  await writeFile(
    "docs/graph-engineering/z8/evidence/u4/oracle.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
  await isolation.close();
}
