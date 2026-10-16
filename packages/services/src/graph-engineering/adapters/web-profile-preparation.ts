import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { revalidateWebProfileRuntime } from "@zcode/shared/node";
import { WEB_PROFILE_POLICY } from "@zcode/shared";
import type { GraphInspection } from "../inspection-types.js";
import type { GraphWorkspaceTarget } from "../approval-types.js";
import type { GraphWebProfileProposal } from "../web-profile-types.js";
import { webProfileScopeSchema, validateGraphRelativePath } from "../domain/artifact-schemas.js";
import { compileDotnetRecipes } from "../domain/dotnet-recipes.js";
import { prepareWebProfileInputs } from "./web-profile-inputs.js";
import { readWebProfileRestore } from "./web-profile-restore.js";
import { fingerprintDeclaredFilesWithin } from "./artifact-files.js";
import { writeWebProfileProof } from "./web-profile-proof.js";
export async function prepareWebProfile(
  directory: string,
  target: GraphWorkspaceTarget,
  rows: [GraphInspection, GraphInspection],
): Promise<GraphWebProfileProposal> {
  const [web, test] = rows,
    binding = web.request?.inspection,
    other = test.request?.inspection;
  if (
    !binding?.webProfile ||
    !binding.runtimeProfile ||
    !other?.webProfile ||
    !other.runtimeProfile ||
    binding.project !== binding.webProfile.webProject ||
    other.project !== binding.webProfile.testProject ||
    JSON.stringify(binding.webProfile) !== JSON.stringify(other.webProfile) ||
    binding.configuration !== other.configuration ||
    JSON.stringify(binding.runtimeProfile) !== JSON.stringify(other.runtimeProfile) ||
    web.runtimeIdentity !== test.runtimeIdentity ||
    rows.some((row) => row.status !== "succeeded" || row.reserved || !row.projection)
  )
    throw Error("Two matching successful owned Web/Test profile inspections are required.");
  const selection = { ...binding.webProfile, configuration: binding.configuration };
  const deadline = Date.now() + 120000;
  const membership = await prepareWebProfileInputs(target, selection, deadline);
  const restored = await readWebProfileRestore(
    target,
    selection,
    binding.runtimeProfile.executable,
  );
  if (restored.packageRoot !== binding.runtimeProfile.packageRoot)
    throw Error("Inspected package root changed.");
  await revalidateWebProfileRuntime(
    target.workspacePath,
    binding.runtimeProfile,
    undefined,
    deadline,
  );
  const assemblies = rows.map((row, index) => {
    const props = row.projection!.properties,
      project = index === 0 ? selection.webProject : selection.testProject;
    if (
      props.NETCoreSdkVersion !== "8.0.426" ||
      props.MSBuildVersion !== "17.11.69" ||
      props.TargetFramework !== "net8.0" ||
      props.Configuration !== selection.configuration ||
      props.AssemblyName !== basename(project, ".csproj") ||
      props.BaseOutputPath !== "bin\\" ||
      resolve(
        target.workspacePath,
        dirname(project),
        props.BaseIntermediateOutputPath ?? "",
      ).toLowerCase() !== resolve(target.workspacePath, dirname(project), "obj").toLowerCase() ||
      (index === 0 && props.UsingMicrosoftNETSdkWeb !== "true")
    )
      throw Error("Observed effective output/profile identity is unsupported.");
    if (!isAbsolute(props.TargetPath!))
      throw Error("Engine did not return an absolute target assembly.");
    const path = validateGraphRelativePath(
      relative(target.workspacePath, props.TargetPath!).replaceAll("\\", "/"),
    );
    if (
      !path.startsWith(dirname(project).replaceAll("\\", "/") + "/bin/") ||
      !path.endsWith(".dll")
    )
      throw Error("Observed output is outside the modeled project output root.");
    return path;
  });
  const scope = webProfileScopeSchema.parse({
    version: 3,
    policy: WEB_PROFILE_POLICY,
    project: selection.testProject,
    webProject: selection.webProject,
    configuration: selection.configuration,
    runtimeProfile: binding.runtimeProfile,
    assemblies: { web: assemblies[0], test: assemblies[1] },
    copiedContent: [],
    membershipDigest: membership.membershipDigest,
    sourceCount: membership.sourcePaths.length,
    preparationId: randomUUID(),
    inspectionIds: rows.map((row) => row.id),
  });
  const outputs = [...assemblies];
  for (const assembly of assemblies)
    for (const suffix of [".deps.json", ".runtimeconfig.json"])
      outputs.push(assembly.slice(0, -4) + suffix);
  outputs.push(assemblies[0]!.slice(0, -4) + ".staticwebassets.runtime.json");
  const testFolder = dirname(assemblies[1]!).replaceAll("\\", "/");
  for (const suffix of [
    ".dll",
    ".deps.json",
    ".runtimeconfig.json",
    ".staticwebassets.runtime.json",
  ])
    outputs.push(`${testFolder}/${basename(assemblies[0]!, ".dll")}${suffix}`);
  // Known SDK transitive content copy, using actual evaluated Content metadata and observed output folders.
  for (const [index, row] of rows.entries())
    for (const item of row.projection!.items) {
      if (item.kind !== "Content" || !item.copyToOutput || item.copyToOutput === "Never") continue;
      if (!["Always", "PreserveNewest", "IfDifferent"].includes(item.copyToOutput))
        throw Error("Unknown observed Content copy policy.");
      const identity = validateGraphRelativePath(item.identity.replaceAll("\\", "/"));
      const project = index === 0 ? selection.webProject : selection.testProject;
      const source = validateGraphRelativePath(
        `${dirname(project).replaceAll("\\", "/")}/${identity}`,
      );
      if (!membership.sourcePaths.includes(source))
        throw Error("Observed copied Content is outside the complete prepared source membership.");
      scope.copiedContent.push({
        source,
        output: `${dirname(assemblies[index]!).replaceAll("\\", "/")}/${identity}`,
      });
      if (index === 0) scope.copiedContent.push({ source, output: `${testFolder}/${identity}` });
    }
  webProfileScopeSchema.parse(scope);
  if (outputs.length + scope.copiedContent.length > 32)
    throw Error("Web associated outputs exceed the existing 32-output budget.");
  const recipes = compileDotnetRecipes({
    idPrefix: "web-profile",
    executable: binding.runtimeProfile.executable,
    cwd: ".",
    timeoutMs: 120000,
    buildProject: selection.testProject,
    configuration: selection.configuration,
    framework: "net8.0",
    sourcePaths: membership.sourcePaths,
    sourceScope: scope,
    expectedOutputs: [...new Set(outputs)],
    reviewedManifest: true,
    tests: [
      {
        project: selection.testProject,
        configuration: selection.configuration,
        framework: "net8.0",
        assembly: assemblies[1]!,
        minimumTests: 1,
        requiredTests: [],
      },
    ],
  });
  const observed = await fingerprintDeclaredFilesWithin(target, membership.sourcePaths, deadline);
  const after = await prepareWebProfileInputs(target, selection, deadline);
  if (after.membershipDigest !== membership.membershipDigest)
    throw Error("Web inputs changed during preparation.");
  if (rows.some((row) => Date.now() >= (row.request?.inspection?.expiresAt ?? 0)))
    throw Error("Inspection expired before preparation completed.");
  await writeWebProfileProof(directory, target, scope, recipes, observed.digest);
  return {
    kind: "web-profile-proposal",
    scope,
    recipes,
    sourcePaths: membership.sourcePaths,
    excludedOutputRoots: membership.excludedOutputRoots,
    facts: [
      "Complete input policy: plain net8.0 Web static content + one referencing VSTest project.",
      "Build targets the referencing Test project and includes the observed Web dependency.",
      "Inspection and preparation are observations. Configuration is not saved and no Build or Test has run.",
      "Razor, Blazor, Protobuf and unknown packages/generators remain unsupported.",
    ],
  };
}
