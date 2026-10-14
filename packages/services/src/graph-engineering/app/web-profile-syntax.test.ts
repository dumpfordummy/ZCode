import assert from "node:assert/strict";
import test from "node:test";
import { declarativeProject } from "../domain/project-declarative.js";
import {
  webProfileSyntax,
  assertWebProfileFiles,
  observedProfileAssembly,
} from "../domain/web-profile-syntax.js";
const web =
  '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>';
const tests =
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup><ItemGroup><ProjectReference Include="../Api/Api.csproj"/><PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0"/><PackageReference Include="xunit" Version="2.5.3"/><PackageReference Include="xunit.runner.visualstudio" Version="2.5.3"/></ItemGroup></Project>';
const documents = new Map([
  ["api/api.csproj", web],
  ["tests/tests.csproj", tests],
]);
const input = {
  project: "Api/Api.csproj",
  documents,
  configuration: "Debug" as const,
  role: "web" as const,
  webProject: "Api/Api.csproj",
};
test("Web syntax remains unsupported in v2; separate eligibility has no output authority", () => {
  assert.throws(() => declarativeProject(input.project, documents), /Microsoft.NET.Sdk.Web/);
  const parsed = webProfileSyntax(input);
  assert.equal(parsed.sdk, "Microsoft.NET.Sdk.Web");
  assert.equal(parsed.candidate.quick, undefined);
  assert.deepEqual(parsed.candidate.sourcePaths, []);
  assert.equal(
    webProfileSyntax({ ...input, project: "Tests/Tests.csproj", role: "test" }).candidate.quick,
    undefined,
  );
});
test("Web eligibility rejects unmodeled generators, effects and unrelated tests", () => {
  for (const extra of [
    '<Target Name="Custom"/>',
    '<ItemGroup><None Update="data.txt" CopyToOutputDirectory="Always"/></ItemGroup>',
    '<ItemGroup><Content Include="data.txt" Link="mapped.txt"/></ItemGroup>',
    '<ItemGroup><Protobuf Include="service.proto"/></ItemGroup>',
    '<ItemGroup><PackageReference Include="Grpc.Tools" Version="2.0.0"/></ItemGroup>',
    `<PropertyGroup><Custom>$([System.IO.File]::ReadAllText('outside'))</Custom></PropertyGroup>`,
    '<Import Project="../outside.targets"/>',
  ])
    assert.throws(() =>
      webProfileSyntax({
        ...input,
        documents: new Map([["api/api.csproj", web.replace("</Project>", extra + "</Project>")]]),
      }),
    );
  assert.throws(
    () =>
      webProfileSyntax({
        ...input,
        project: "Tests/Tests.csproj",
        role: "test",
        webProject: "Other/Other.csproj",
      }),
    /exactly/,
  );
  assert.throws(
    () =>
      webProfileSyntax({
        ...input,
        project: "Tests/Tests.csproj",
        role: "test",
        documents: new Map([...documents, ["tests/tests.csproj", tests.replace("2.5.3", "2.6.0")]]),
      }),
    /Unmodeled/,
  );
});
test("implicit JSON/static content is eligible; future unsupported generator membership rejects", () => {
  assert.doesNotThrow(() =>
    assertWebProfileFiles(["Api/appsettings.json", "Api/wwwroot/site.txt", "Api/wwwroot/site.css"]),
  );
  for (const file of [
    "Api/Page.razor",
    "Api/Page.cshtml",
    "Api/service.proto",
    "Api/Page.razor.css",
    "Api/Page.razor.js",
    "Api/Page.cshtml.js",
    "Api/App.lib.module.js",
  ])
    assert.throws(() => assertWebProfileFiles([file]), /outside this profile/);
});
test("profile outputs are observed relative identities, never invented paths", () => {
  assert.equal(
    observedProfileAssembly("Api/Api.csproj", "custom/actual.dll"),
    "Api/custom/actual.dll",
  );
  for (const target of ["", "../../outside.dll", "C:/outside.dll", "$(OutputPath)/Api.dll"])
    assert.throws(() => observedProfileAssembly("Api/Api.csproj", target));
});
