import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createProjectDiscovery } from "./project-discovery.js";
import { createGraphRecipeStore } from "./recipes.js";
import { ProjectScanJob } from "./project-scan-job.js";
import { prepareProjectScope, revalidateProjectScope } from "./project-scope.js";
import { declarativeProject } from "../domain/project-declarative.js";
import { evaluateFileItems } from "../domain/project-items.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";

const xml = (items = "", props = "") =>
  `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework>${props}</PropertyGroup>${items}</Project>`;
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), "u4-declarative-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const target = { workspacePath: root };
  const prepare = (configuration = "Debug") =>
    createProjectDiscovery().scan(target, "prepare", {
      selectedProject: "Tests/Tests.csproj",
      configuration,
    });
  return { root, write, target, prepare };
}
test("Content/None, shared inputs, import-relative items, chosen configuration and freshness", async (t) => {
  const { root, write, target, prepare } = await fixture(t);
  await write(
    "Tests/Tests.csproj",
    xml(
      `<Import Project="../meta/items.props"/><ItemGroup><None Update="settings.txt" CopyToOutputDirectory="PreserveNewest"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup>`,
    ),
  );
  await write(
    "Directory.Build.props",
    `<Project><PropertyGroup Condition="'$(Configuration)' == 'Release'"><AssemblyName>ReleaseTests</AssemblyName></PropertyGroup></Project>`,
  );
  await write(
    "meta/items.props",
    `<Project><ItemGroup><Content Include="data/*.txt" CopyToOutputDirectory="Always"/><Compile Include="../shared/Shared.cs" Link="Shared.cs"/><EmbeddedResource Include="data/blob.dat" LogicalName="Fixture.Data"/></ItemGroup></Project>`,
  );
  await write("Tests/data/value.txt", "expected");
  await write("Tests/data/blob.dat", "resource");
  await write("Tests/settings.txt", "settings");
  await write("shared/Shared.cs", "// shared");
  const debug = await prepare();
  assert.equal(debug.status, "complete", debug.issues.join("\n"));
  const release = await prepare("Release");
  assert.equal(release.status, "complete", release.issues.join("\n"));
  assert.notEqual(debug.prepared!.scope.membershipDigest, release.prepared!.scope.membershipDigest);
  assert.equal(
    release.candidates[0]!.quick!.assemblies["net8.0"],
    "Tests/bin/Release/net8.0/ReleaseTests.dll",
  );
  for (const path of [
    "shared/Shared.cs",
    "meta/items.props",
    "Directory.Build.props",
    "Tests/data/value.txt",
    "Tests/settings.txt",
  ])
    assert.ok(release.prepared!.sourcePaths.includes(path), path);
  const store = createGraphRecipeStore();
  const fingerprint = () =>
    store.fingerprint(target, ["Tests/Tests.csproj"], [release.prepared!.scope]);
  const initial = await fingerprint();
  await write("Tests/data/value.txt", "changed");
  assert.notEqual((await fingerprint()).digest, initial.digest);
  const beforeShared = await fingerprint();
  await write("shared/Shared.cs", "// changed shared input");
  assert.notEqual((await fingerprint()).digest, beforeShared.digest);
  const importBytes = await readFile(join(root, "meta/items.props"), "utf8");
  await write("meta/items.props", importBytes + "\n");
  await assert.rejects(fingerprint, /membership or metadata changed/);
  await write("meta/items.props", importBytes);
  await write("Tests/data/new.txt", "new member");
  await assert.rejects(fingerprint, /membership or metadata changed/);
});
test("ordered Include/Exclude is local, Update never invents, Remove works, empty globs remain valid", () => {
  const content = xml(
    `<ItemGroup><Content Include="data/a.txt"/><Content Include="data/*.txt" Exclude="data/a.txt"/><Content Update="missing.txt" CopyToOutputDirectory="Always"/><Content Remove="data/b.txt"/><Content Include="empty/**/*.txt"/></ItemGroup>`,
    "<EnableDefaultItems>false</EnableDefaultItems>",
  );
  const d = declarativeProject("Tests/Tests.csproj", new Map([["tests/tests.csproj", content]]));
  const items = evaluateFileItems(
    "Tests/Tests.csproj",
    ["Tests/data/a.txt", "Tests/data/b.txt"],
    d.operations,
    d.defaults,
  );
  assert.deepEqual(
    items.map((item) => item.path),
    ["Tests/data/a.txt"],
  );
});
test("unsafe or unresolved declarations never prepare a verified scope", async (t) => {
  const { write, prepare } = await fixture(t);
  for (const item of [
    `<ItemGroup><Content Include="../../outside.txt"/></ItemGroup>`,
    `<ItemGroup><Content Include="bin/input.txt"/></ItemGroup>`,
    `<ItemGroup><Content Include="data.txt" Generator="Custom"/></ItemGroup>`,
    `<ItemGroup><None Update="x" TargetPath="../escape.txt"/></ItemGroup>`,
    `<Import Project="../meta.props" Condition="'$(Configuration)' == 'Debug'"/>`,
    `<Import Project="../../escape.props"/>`,
    `<Target Name="Generate"><Exec Command="never"/></Target>`,
    `<PropertyGroup><Unknown>anything</Unknown></PropertyGroup>`,
    `<ItemGroup><Content Include="$(Unresolved)/x"/></ItemGroup>`,
    `<ItemGroup><Content Include="x%3By"/></ItemGroup>`,
  ]) {
    await write("Tests/Tests.csproj", xml(item));
    const result = await prepare();
    assert.equal(result.prepared, undefined, item);
    assert.ok(result.issues.length, item);
  }
  await write("Tests/Tests.csproj", xml(`<Import Project="../a.props"/>`));
  await write("a.props", `<Project><Import Project="b.props"/></Project>`);
  await write("b.props", `<Project><Import Project="a.props"/></Project>`);
  assert.match((await prepare()).issues.join(" "), /Cyclic import/);
});
test("legacy v1 reconstructs its original digest and refuses new declarative shapes", async (t) => {
  const { target, write, prepare } = await fixture(t);
  await write("Tests/Tests.csproj", xml());
  const legacy = new ProjectScanJob(target, "legacy", undefined, 1);
  await prepareProjectScope(legacy, "Tests/Tests.csproj");
  const scope = legacy.finish().prepared!.scope;
  assert.equal(scope.version, 1);
  assert.deepEqual(await revalidateProjectScope(target, scope), ["Tests/Tests.csproj"]);
  assert.equal((await prepare()).prepared!.scope.version, 2);
  await write("Tests/Tests.csproj", xml(`<ItemGroup><Content Include="value.txt"/></ItemGroup>`));
  await write("Tests/value.txt", "value");
  await assert.rejects(() => revalidateProjectScope(target, scope), /Content/);
  assert.equal((await prepare()).status, "complete");
});

test("duplicate lists, excluded glob intersections, resource indirection and expansion bounds fail closed", async (t) => {
  const { write, prepare } = await fixture(t);
  await write("Tests/data/value.txt", "value");
  await write("Tests/data/obj/cache.txt", "excluded");
  for (const declaration of [
    '<Content Include="data/value.txt;data/value.txt"/>',
    '<Content Include="dat*/**/*.txt"/>',
    '<Content Include="data/**"/>',
    '<Content Include="data/**/*.txt" Exclude="data/obj/input.txt;data/obj/nested/input.cs"/>',
    '<Content Include="data/value.txt" UnknownMetadata="value"/>',
  ]) {
    await write("Tests/Tests.csproj", xml(`<ItemGroup>${declaration}</ItemGroup>`));
    assert.equal((await prepare()).prepared, undefined, declaration);
  }
  await write(
    "Tests/Tests.csproj",
    xml('<ItemGroup><Content Include="dat*/**/*.txt" Exclude="data/obj/**"/></ItemGroup>'),
  );
  assert.equal((await prepare()).status, "complete");
  await write(
    "Tests/resource.resx",
    '<root><data type="System.Resources.ResXFileRef"><value>../../outside.txt</value></data></root>',
  );
  assert.match((await prepare()).issues.join(" "), /resource|ResX/i);
  await write(
    "Tests/resource.resx",
    '<root><data name="outside" type="System.Resources.ResXFile&#82;ef"><value>../../outside.txt</value></data></root>',
  );
  assert.equal((await prepare()).prepared, undefined);
  await write(
    "Tests/resource.resx",
    '<root><data name="literal"><value>safe string</value></data></root>',
  );
  assert.equal((await prepare()).status, "complete");
  const d = declarativeProject(
    "Tests/Tests.csproj",
    new Map([
      ["tests/tests.csproj", xml('<ItemGroup><Content Include="data/*.txt"/></ItemGroup>')],
    ]),
  );
  assert.throws(
    () =>
      evaluateFileItems(
        "Tests/Tests.csproj",
        ["Tests/data/value.txt"],
        Array(2049).fill(d.operations[0]),
        d.defaults,
      ),
    /budget/,
  );
});
test(
  "5,000+ inputs with shared/content/import: save/reload, late content and membership freshness",
  { timeout: 240000 },
  async (t) => {
    const { write, target, prepare } = await fixture(t);
    await write(
      "Tests/Tests.csproj",
      xml(
        `<Import Project="../inputs.props"/><ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup>`,
      ),
    );
    await write(
      "inputs.props",
      `<Project><ItemGroup><Content Include="data/*.txt" CopyToOutputDirectory="Always"/><Compile Include="../shared/Shared.cs" Link="Shared.cs"/></ItemGroup></Project>`,
    );
    await write("shared/Shared.cs", "// shared");
    for (let i = 0; i < 5000; i++)
      await write(`Tests/data/${String(i).padStart(4, "0")}.txt`, `${i}`);
    const started = performance.now();
    const result = await prepare();
    const prepareMs = performance.now() - started;
    assert.equal(result.status, "complete", result.issues.join("\n"));
    assert.equal(result.prepared!.scope.sourceCount, 5003);
    const recipes = compileDotnetRecipes({
      idPrefix: "u4",
      executable: "dotnet",
      cwd: ".",
      timeoutMs: 120000,
      buildProject: "Tests/Tests.csproj",
      configuration: "Debug",
      sourcePaths: [],
      sourceScope: result.prepared!.scope,
      expectedOutputs: ["Tests/bin/Debug/net8.0/Tests.dll"],
      reviewedManifest: true,
      tests: [
        {
          project: "Tests/Tests.csproj",
          configuration: "Debug",
          framework: "net8.0",
          assembly: "Tests/bin/Debug/net8.0/Tests.dll",
          minimumTests: 1,
          requiredTests: [],
        },
      ],
    });
    const store = createGraphRecipeStore(),
      initial = await store.read(target);
    const saved = await store.save(target, recipes, initial.digest);
    assert.deepEqual(await createGraphRecipeStore().read(target), saved);
    const fingerprint = () =>
      store.fingerprint(target, recipes[0]!.sourcePaths, [result.prepared!.scope]);
    const capture = performance.now(),
      first = await fingerprint();
    t.diagnostic(
      JSON.stringify({
        sourceCount: first.files.length,
        prepareMs,
        fingerprintMs: performance.now() - capture,
      }),
    );
    await write("Tests/data/4999.txt", "changed after file 32");
    assert.notEqual((await fingerprint()).digest, first.digest);
    await write("Tests/data/added.txt", "new match");
    await assert.rejects(fingerprint, /membership or metadata changed/);
  },
);
