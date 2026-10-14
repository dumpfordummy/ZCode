import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareWebProfileInputs } from "./web-profile-inputs.js";
import { fingerprintDeclaredFiles } from "./artifact-files.js";

const web =
  '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>';
const tests =
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><ProjectReference Include="../Web/Web.csproj"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0"/><PackageReference Include="xunit" Version="2.5.3"/><PackageReference Include="xunit.runner.visualstudio" Version="2.5.3"/></ItemGroup></Project>';
const selection = {
  webProject: "Web/Web.csproj",
  testProject: "Tests/Tests.csproj",
  configuration: "Debug" as const,
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "f1-web-inputs-"));
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  await write("Web/Web.csproj", web);
  await write("Tests/Tests.csproj", tests);
  await write(
    "global.json",
    JSON.stringify({ sdk: { rollForward: "disable", version: "8.0.426" } }),
  );
  await write("Directory.Build.props", "<Project />");
  for (const role of ["Web", "Tests"])
    for (const name of [
      "project.assets.json",
      `${role}.csproj.nuget.g.props`,
      `${role}.csproj.nuget.g.targets`,
    ])
      await write(`${role}/obj/${name}`, name.endsWith("json") ? "{}" : "<Project />");
  await write("Web/appsettings.json", '{"key":"before"}');
  await write("Web/wwwroot/site.txt", "static");
  await write("Web/nested/bin/real.txt", "nested-bin-input");
  await write("Web/nested/obj/real.txt", "nested-obj-input");
  await write("Web/bin/Debug/output.dll", "generated");
  await write("Web/obj/Debug/generated.cs", "generated");
  await write(".zcode/config.json", "private-state");
  await write(".git/HEAD", "state");
  for (let i = 0; i < 40; i++)
    await write(`Web/Source${String(i).padStart(2, "0")}.cs`, "// source " + i);
  const target = { workspacePath: root };
  return { root, write, target, prepare: () => prepareWebProfileInputs(target, selection) };
}

test("Web membership includes implicit content, prior restore inputs and nested bin/obj; excludes exact generated roots only", async () => {
  const f = await fixture(),
    result = await f.prepare();
  assert.equal(result.scopeComplete, false);
  for (const name of [
    "Web/appsettings.json",
    "Web/wwwroot/site.txt",
    "Web/nested/bin/real.txt",
    "Web/nested/obj/real.txt",
    "Web/obj/project.assets.json",
    "Tests/obj/Tests.csproj.nuget.g.targets",
  ])
    assert.ok(result.sourcePaths.includes(name), name);
  for (const name of [
    "Web/bin/Debug/output.dll",
    "Web/obj/Debug/generated.cs",
    ".zcode/config.json",
    ".git/HEAD",
  ])
    assert.ok(!result.sourcePaths.includes(name), name);
  assert.equal(result.sourcePaths.length, 54);
});
test("beyond-32 source, copied JSON and static Content change full byte fingerprints", async () => {
  const f = await fixture(),
    initial = await f.prepare();
  let before = await fingerprintDeclaredFiles(f.target, initial.sourcePaths);
  for (const name of ["Web/Source39.cs", "Web/appsettings.json", "Web/wwwroot/site.txt"]) {
    await f.write(name, "mutated " + name);
    const after = await fingerprintDeclaredFiles(f.target, (await f.prepare()).sourcePaths);
    assert.notEqual(after.digest, before.digest, name);
    before = after;
  }
});
test("future additions and renames change membership; applicable import mutations change metadata commitment", async () => {
  const f = await fixture();
  let before = await f.prepare();
  await f.write("Web/wwwroot/new.txt", "future");
  let after = await f.prepare();
  assert.notEqual(after.membershipDigest, before.membershipDigest);
  before = after;
  await rename(join(f.root, "Web/wwwroot/new.txt"), join(f.root, "Web/wwwroot/renamed.txt"));
  after = await f.prepare();
  assert.notEqual(after.membershipDigest, before.membershipDigest);
  before = after;
  await f.write(
    "Directory.Build.props",
    "<Project><PropertyGroup><Nullable>enable</Nullable></PropertyGroup></Project>",
  );
  after = await f.prepare();
  assert.notEqual(after.membershipDigest, before.membershipDigest);
});
test("unknown generators, custom imports, unrelated test and SDK identity fail before completeness", async () => {
  const f = await fixture();
  await f.write("Web/Web.csproj", web.replace("</Project>", '<Target Name="Custom"/></Project>'));
  await assert.rejects(f.prepare, /unsupported Target/);
  await f.write("Web/Web.csproj", web);
  await f.write("Tests/Tests.csproj", tests.replace("../Web/Web.csproj", "../Other/Other.csproj"));
  await assert.rejects(f.prepare, /exactly/);
  await f.write("Tests/Tests.csproj", tests);
  await f.write(
    "global.json",
    JSON.stringify({ sdk: { version: "10.0.401", rollForward: "disable" } }),
  );
  await assert.rejects(f.prepare, /8.0.426/);
  await f.write(
    "global.json",
    JSON.stringify({ sdk: { version: "8.0.426", rollForward: "disable" } }),
  );
  await f.write("Web/service.proto", "unmodeled generator");
  await assert.rejects(f.prepare, /outside this profile/);
});
test("an applicable import cannot escape the workspace or enter a generated root", async () => {
  const f = await fixture();
  for (const input of ["../../outside.props", "obj/custom.props"]) {
    await f.write(
      "Web/Web.csproj",
      web.replace("</Project>", `<Import Project="${input}"/></Project>`),
    );
    await assert.rejects(f.prepare, /outside|excluded/);
  }
  const original = await readFile(join(f.root, "Directory.Build.props"), "utf8");
  assert.equal(original, "<Project />");
});

test("membership selection is canonical across inspected profile metadata and saved v3 revalidation", async () => {
  const f = await fixture();
  const plain = await prepareWebProfileInputs(f.target, selection);
  const inspected = await prepareWebProfileInputs(f.target, {
    ...selection,
    policy: "web-static-net8-win-x64-v1",
  } as typeof selection);
  assert.deepEqual(inspected.selection, selection);
  assert.equal(inspected.membershipDigest, plain.membershipDigest);
  assert.deepEqual(inspected.sourcePaths, plain.sourcePaths);
});
