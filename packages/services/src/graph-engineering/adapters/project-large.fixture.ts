import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const literalProject = (references = "", test = false) =>
  `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework>${test ? "<IsTestProject>true</IsTestProject>" : ""}</PropertyGroup><ItemGroup>${references}${test ? '<PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />' : ""}</ItemGroup></Project>`;

export const literalSolution = (
  project = "Tests.csproj",
) => `Microsoft Visual Studio Solution File, Format Version 12.00
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Tests", "${project}", "{11111111-1111-4111-8111-111111111111}"
EndProject
Global
 GlobalSection(SolutionConfigurationPlatforms) = preSolution
  Debug|Any CPU = Debug|Any CPU
 EndGlobalSection
 GlobalSection(ProjectConfigurationPlatforms) = postSolution
  {11111111-1111-4111-8111-111111111111}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
  {11111111-1111-4111-8111-111111111111}.Debug|Any CPU.Build.0 = Debug|Any CPU
 EndGlobalSection
EndGlobal
`;

/** Disposable real configuration mappings, not a committed tree or comment-padded solution. */
export async function largeProjectFixture(root: string, projects = 100, sources = 50) {
  const configurations = [
    "Debug",
    "Release",
    ...Array.from({ length: 34 }, (_, index) => `Synthetic${index}`),
  ];
  const names = Array.from(
    { length: projects },
    (_, index) => `P${String(index).padStart(3, "0")}`,
  );
  const guid = (index: number) => `{00000000-0000-4000-8000-${String(index).padStart(12, "0")}}`;
  let solution =
    "Microsoft Visual Studio Solution File, Format Version 12.00\n# Visual Studio Version 17\n";
  for (const [index, name] of names.entries()) {
    solution += `Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "${name}", "${name}\\${name}.csproj", "${guid(index)}"\nEndProject\n`;
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, name, `${name}.csproj`), literalProject("", index === 0));
    for (let source = 0; source < sources; source++) {
      const folder =
        source === sources - 1
          ? join(root, name, ...Array.from({ length: 9 }, () => "d"))
          : join(root, name);
      if (source === sources - 1) await mkdir(folder, { recursive: true });
      await writeFile(
        join(folder, `C${source}.cs`),
        `namespace ${name}; public class C${source} { public int Value => ${source}; }\n`,
      );
    }
  }
  solution += `Global\n GlobalSection(SolutionConfigurationPlatforms) = preSolution\n${configurations.map((configuration) => `  ${configuration}|Any CPU = ${configuration}|Any CPU`).join("\n")}\n EndGlobalSection\n GlobalSection(ProjectConfigurationPlatforms) = postSolution\n`;
  for (const [index] of names.entries())
    for (const configuration of configurations)
      for (const mapping of ["ActiveCfg", "Build.0"])
        solution += `  ${guid(index)}.${configuration}|Any CPU.${mapping} = ${configuration}|Any CPU\n`;
  solution += " EndGlobalSection\nEndGlobal\n";
  await writeFile(join(root, "Large.sln"), solution);
  return { projects, sources: projects * sources, solutionBytes: Buffer.byteLength(solution) };
}
