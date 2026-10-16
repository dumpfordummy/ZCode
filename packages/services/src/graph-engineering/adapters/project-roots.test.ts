import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { declarativeProject } from "../domain/project-declarative.js";
import { createProjectDiscovery } from "./project-discovery.js";
import { revalidateProjectScope } from "./project-scope.js";
import { createGraphRecipeStore } from "./recipes.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";

const body = "<PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>";
const props = '<Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk"/>';
const targets = '<Import Project="Sdk.targets" Sdk="Microsoft.NET.Sdk"/>';
const ns = 'xmlns="http://schemas.microsoft.com/developer/msbuild/2003"';
const parse = (xml: string) => declarativeProject("Tests.csproj", new Map([["tests.csproj", xml]]));

test("root contract accepts pure SDK namespace and exact explicit SDK boundaries", () => {
  for (const xml of [
    `<Project Sdk="Microsoft.NET.Sdk">${body}</Project>`,
    `<Project Sdk="Microsoft.NET.Sdk" ${ns}>${body}</Project>`,
    `<Project ${ns}>${props}${body}${targets}</Project>`,
  ]) {
    const candidate = parse(xml).candidate;
    assert.equal(candidate.quick?.assemblies["net10.0"], "bin/Debug/net10.0/Tests.dll");
    assert.match(candidate.evidence.join(" "), /unverified/);
  }
});

test("root failures identify actual SDK, root semantics and supported action", () => {
  const cases = [
    [
      `<Project Sdk="Microsoft.NET.Sdk.Web">${body}</Project>`,
      /Microsoft.NET.Sdk.Web.*Razor.*Advanced/,
    ],
    [`<Project Sdk="Example.Custom">${body}</Project>`, /Example.Custom.*Advanced/],
    [`<Project Sdk="$(ChosenSdk)">${body}</Project>`, /dynamic SDK.*ChosenSdk/],
    [`<Project ToolsVersion="15.0" ${ns}>${body}</Project>`, /ToolsVersion.*15.0.*toolchain/],
    [
      `<Project Sdk="Microsoft.NET.Sdk" InitialTargets="Generate">${body}</Project>`,
      /InitialTargets.*Generate/,
    ],
    [
      `<Project Sdk="Microsoft.NET.Sdk" xmlns="urn:unknown">${body}</Project>`,
      /xmlns.*urn:unknown/,
    ],
    [`<Project>${body}${props}${targets}</Project>`, /first.*last/],
    [`<Project>${props}${body}</Project>`, /first.*last/],
    [`<Project Sdk="Microsoft.NET.Sdk">${props}${body}${targets}</Project>`, /mixed.*SDK/],
    [
      `<Project>${props.replace("/>", ' Condition="true"/>')}${body}${targets}</Project>`,
      /unconditional.*SDK/,
    ],
    [`<Project>${props}${props}${body}${targets}</Project>`, /exactly two.*SDK/],
    [`<Project>${props}${body}${targets}<Target Name="Generate"/></Project>`, /first.*last/],
  ] as const;
  for (const [xml, expected] of cases) assert.throws(() => parse(xml), expected);
});

test("duplicate-looking trees remain inventory and authoritative dependencies; narrow scans work", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u5-roots-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (file: string, content: string) => {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  };
  const xml = `<Project Sdk="Microsoft.NET.Sdk" ${ns}>${body}</Project>`;
  await write("Real/Library.csproj", xml);
  await write("builds/0/project-0/Library.csproj", xml);
  await write("builds/0/project-0/Source.cs", "public class Source {}");
  await write("Api/Api.csproj", `<Project Sdk="Microsoft.NET.Sdk.Web">${body}</Project>`);
  await write(
    "Tests/Tests.csproj",
    `<Project>${props}${body}<ItemGroup><ProjectReference Include="../builds/0/project-0/Library.csproj"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup>${targets}</Project>`,
  );
  const discovery = createProjectDiscovery();
  const target = { workspacePath: root };
  const inventory = await discovery.scan(target, "inventory");
  assert.equal(inventory.candidates.length, 4);
  assert.ok(inventory.candidates.some((c) => c.path.startsWith("builds/")));
  await write(
    "App.slnx",
    '<Solution><Project Path="Api/Api.csproj"/><Project Path="Tests/Tests.csproj"/></Solution>',
  );
  const solution = await discovery.scan(target, "solution", { selectedProject: "App.slnx" });
  assert.equal(solution.prepared, undefined);
  assert.match(solution.issues.join(" "), /Api\/Api.csproj.*Microsoft.NET.Sdk.Web/);
  const narrow = await discovery.scan(target, "narrow", { scanRoot: "Tests" });
  assert.deepEqual(
    narrow.candidates.map((c) => c.path),
    ["Tests/Tests.csproj"],
  );
  const prepared = await discovery.scan(target, "prepare", {
    selectedProject: "Tests/Tests.csproj",
  });
  assert.ok(prepared.prepared, prepared.issues.join(" "));
  assert.ok(prepared.prepared.sourcePaths.includes("builds/0/project-0/Source.cs"));
  await write("builds/0/project-0/New.cs", "public class New {}");
  await assert.rejects(
    () => revalidateProjectScope(target, prepared.prepared!.scope),
    /membership/,
  );
});

test("explicit SDK with 40 inputs persists v2 and detects content/removal changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "u5-persist-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "Tests.csproj"),
    `<Project>${props}${body}<ItemGroup><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.1"/></ItemGroup>${targets}</Project>`,
  );
  for (let i = 0; i < 40; i++)
    await writeFile(join(root, `Source${i}.cs`), `public class Source${i} {}`);
  const target = { workspacePath: root };
  const result = await createProjectDiscovery().scan(target, "prepare", {
    selectedProject: "Tests.csproj",
  });
  assert.ok(result.prepared, result.issues.join(" "));
  assert.equal(result.prepared.scope.sourceCount, 41);
  const recipes = compileDotnetRecipes({
    idPrefix: "u5",
    executable: "dotnet",
    cwd: ".",
    timeoutMs: 120000,
    buildProject: "Tests.csproj",
    configuration: "Debug",
    sourcePaths: [],
    sourceScope: result.prepared.scope,
    expectedOutputs: ["bin/Debug/net10.0/Tests.dll"],
    reviewedManifest: true,
    tests: [
      {
        project: "Tests.csproj",
        framework: "net10.0",
        configuration: "Debug",
        assembly: "bin/Debug/net10.0/Tests.dll",
        minimumTests: 1,
        requiredTests: [],
      },
    ],
  });
  const store = createGraphRecipeStore();
  const saved = await store.save(target, recipes, (await store.read(target)).digest);
  assert.deepEqual(await createGraphRecipeStore().read(target), saved);
  const fingerprint = () => store.fingerprint(target, [], [result.prepared!.scope]);
  const before = await fingerprint();
  await writeFile(join(root, "Source39.cs"), "public class Source39 { public int Value => 1; }");
  assert.notEqual((await fingerprint()).digest, before.digest);
  await rm(join(root, "Source38.cs"));
  await assert.rejects(fingerprint, /membership/);
});
