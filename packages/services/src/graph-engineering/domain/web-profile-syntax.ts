import { declarativeProject, type DeclarativeProject } from "./project-declarative.js";
import { metadataReference } from "./project-metadata.js";
import { parseProjectXml } from "./project-xml.js";

export const WEB_PROFILE_POLICY = "web-static-net8-win-x64-v1" as const;
const testPackages = new Map([
  ["Microsoft.NET.Test.Sdk", "17.8.0"],
  ["xunit", "2.5.3"],
  ["xunit.runner.visualstudio", "2.5.3"],
]);
/** Syntax eligibility only. Never yields a complete scope, output default or executable recipe. */
export function webProfileSyntax(input: {
  project: string;
  documents: ReadonlyMap<string, string>;
  configuration: "Debug" | "Release";
  role: "web" | "test";
  webProject: string;
  before?: string[];
  after?: string[];
  declaration?: DeclarativeProject;
}): DeclarativeProject {
  const text = input.documents.get(input.project.toLowerCase());
  if (!text) throw Error("Profile project metadata is missing.");
  const root = parseProjectXml(new TextEncoder().encode(text));
  if (input.role === "web" && root.attributes.Sdk !== "Microsoft.NET.Sdk.Web")
    throw Error("This profile requires the literal Microsoft.NET.Sdk.Web root.");
  const declaration =
    input.declaration ??
    declarativeProject(
      input.project,
      input.documents,
      input.configuration,
      input.before ?? [],
      input.after ?? [],
      input.role === "web",
    );
  if (
    declaration.candidate.frameworks.length !== 1 ||
    declaration.candidate.frameworks[0] !== "net8.0"
  )
    throw Error("This profile supports only the observed net8.0 configuration.");
  if (input.role === "web") {
    if (declaration.packageReferences.length || declaration.candidate.projects.length)
      throw Error("Web package effects or referenced service projects are outside this profile.");
    if (declaration.candidate.quick)
      throw Error("Web syntax must never invent an output assembly.");
  } else {
    if (
      declaration.sdk !== "Microsoft.NET.Sdk" ||
      declaration.candidate.runner !== "vstest" ||
      declaration.candidate.projects.length !== 1 ||
      declaration.candidate.projects[0] !== input.webProject
    )
      throw Error("The selected VSTest project must reference exactly this Web project.");
    const observed = new Map(declaration.packageReferences.map((p) => [p.name, p.version]));
    if (
      declaration.packageReferences.length !== testPackages.size ||
      observed.size !== testPackages.size ||
      [...testPackages].some(([name, version]) => observed.get(name) !== version)
    )
      throw Error("Unmodeled test package, generator or package version in Web profile.");
    // Even a pure-SDK test candidate needs its actual engine-observed output in this profile.
    delete declaration.candidate.quick;
  }
  if (
    declaration.operations.some((operation) =>
      Object.keys(operation.metadata).some((key) =>
        ["CopyToOutputDirectory", "Link", "TargetPath"].includes(key),
      ),
    )
  )
    throw Error(
      "Explicit copied-output mappings are outside this plain Web profile; implicit JSON/static Content is supported.",
    );
  declaration.candidate.evidence = [
    "Named Web profile syntax is eligible; effective engine identity, output, toolchain provenance and complete input preparation are still required.",
  ];
  return declaration;
}

export function assertWebProfileFiles(paths: readonly string[]) {
  for (const file of paths)
    if (
      /\.(?:razor|cshtml|proto|tt|xaml|ts|scss|less)(?:\.(?:css|js))?$/i.test(file) ||
      /\.lib\.module\.js$/i.test(file)
    )
      throw Error(`${file}: Razor/Blazor or unmodeled generator inputs are outside this profile.`);
}

/** Only an actual query observation can supply an assembly; there is no bin/Debug default. */
export function observedProfileAssembly(project: string, targetPath: string): string {
  const resolved = metadataReference(project, targetPath);
  if (!resolved || !/\.dll$/i.test(resolved) || /[$@%*?]/.test(resolved))
    throw Error("Observed output must be one literal assembly inside the workspace.");
  return resolved;
}
