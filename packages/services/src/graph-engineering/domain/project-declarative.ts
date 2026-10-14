import type { GraphProjectCandidate } from "../project-setup-types.js";
import { parseProjectXml, type ProjectXmlElement } from "./project-xml.js";
import { metadataReference } from "./project-metadata.js";
import { projectRootChildren } from "./project-root.js";
import { fileItemNames, readFileOperation, type ProjectFileOperation } from "./project-items.js";

export class ProjectImportRequired extends Error {
  constructor(readonly path: string) {
    super(`Read required declarative import: ${path}.`);
  }
}
const propertyNames = new Set([
  "TargetFramework",
  "TargetFrameworks",
  "AssemblyName",
  "Nullable",
  "ImplicitUsings",
  "IsPackable",
  "IsTestProject",
  "LangVersion",
  "RootNamespace",
  "TreatWarningsAsErrors",
  "EnableDefaultItems",
  "EnableDefaultCompileItems",
  "EnableDefaultEmbeddedResourceItems",
  "EnableDefaultNoneItems",
  "ManagePackageVersionsCentrally",
]);
function condition(value: string | undefined, properties: Map<string, string>): boolean {
  if (value === undefined) return true;
  // 只解释有完整命令身份的选择；其他条件不能因当前看似为 false 而绕过检查。
  const match =
    /^\s*'\$\((Configuration|Platform|TargetFramework)\)'\s*(==|!=)\s*'([A-Za-z0-9_.-]*)'\s*$/.exec(
      value,
    );
  if (!match || !properties.has(match[1]!.toLowerCase()))
    throw Error(
      `Unresolved Condition: ${value}. Select a supported configuration or continue guided setup.`,
    );
  const equal = properties.get(match[1]!.toLowerCase())!.toLowerCase() === match[3]!.toLowerCase();
  return match[2] === "==" ? equal : !equal;
}
function relativeDirectory(from: string, to: string) {
  const a = from.split("/").slice(0, -1),
    b = to.split("/").slice(0, -1);
  while (a.length && b.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => ".."), ...b].join("/");
}
export interface DeclarativeProject {
  candidate: GraphProjectCandidate;
  operations: ProjectFileOperation[];
  defaults: { all: boolean; compile: boolean; resource: boolean; none: boolean };
}
/** Pure bounded evaluation. Missing imports are requests to the existing filesystem job, never execution. */
export function declarativeProject(
  project: string,
  documents: ReadonlyMap<string, string>,
  configuration = "Debug",
  before: string[] = [],
  after: string[] = [],
): DeclarativeProject {
  if (!["Debug", "Release"].includes(configuration))
    throw Error("Supported configurations are Debug and Release.");
  const properties = new Map<string, string>([
    ["configuration", configuration],
    ["platform", "AnyCPU"],
  ]);
  const declared = new Set<string>();
  const active = new Set<string>(),
    visited = new Set<string>();
  let beforeDefaults = true;
  const entries: Array<{ entry: ProjectXmlElement; file: string; groupCondition?: string }> = [];
  const expand = (value: string, file: string, base: string) => {
    const expanded = value.replace(/\$\(([A-Za-z][A-Za-z0-9_]*)\)/g, (_, name: string) => {
      if (name.toLowerCase() === "msbuildthisfiledirectory") {
        const relative = relativeDirectory(base, file);
        return relative ? `${relative}/` : "./";
      }
      const known = properties.get(name.toLowerCase());
      if (known === undefined) throw Error(`Unresolved property: ${name} in ${file}.`);
      return known;
    });
    if (/[$@%]/.test(expanded)) throw Error(`Unsupported property/item expression in ${file}.`);
    return expanded;
  };
  const visit = (file: string, rootProject = false) => {
    const key = file.toLowerCase();
    if (active.has(key)) throw Error(`Cyclic import: ${file}.`);
    if (visited.has(key)) throw Error(`Repeated import requires explicit review: ${file}.`);
    if (active.size >= 16 || visited.size >= 64)
      throw Error("Declarative import depth/count budget exceeded.");
    const content = documents.get(key);
    if (content === undefined) throw new ProjectImportRequired(file);
    const root = parseProjectXml(new TextEncoder().encode(content));
    const children = projectRootChildren(root, file, rootProject);
    active.add(key);
    visited.add(key);
    for (const group of children) {
      if (group.name === "Import") {
        if (group.attributes.Condition !== undefined)
          throw Error(
            `${file}: conditional import requires MSBuild inspection; guided draft remains non-runnable.`,
          );
        if (
          Object.keys(group.attributes).length !== 1 ||
          !group.attributes.Project ||
          group.children.length ||
          group.text.trim()
        )
          throw Error(`${file}: unsupported Import.`);
        const value = expand(group.attributes.Project, file, file);
        const imported = metadataReference(file, value);
        if (!imported)
          throw Error(
            `${file}: import resolves outside the workspace or uses an unsupported path.`,
          );
        if (
          imported
            .split("/")
            .some((p) => ["bin", "obj", ".git", ".zcode"].includes(p.toLowerCase()))
        )
          throw Error(`${file}: import contradicts an excluded state/output directory.`);
        visit(imported);
        continue;
      }
      if (
        !["PropertyGroup", "ItemGroup"].includes(group.name) ||
        group.text.trim() ||
        Object.keys(group.attributes).some((key) => key !== "Condition")
      )
        throw Error(
          `${file}: unsupported ${group.name}; custom execution or generated inputs cannot be verified.`,
        );
      if (group.name === "ItemGroup") {
        if (beforeDefaults && group.children.some((entry) => fileItemNames.has(entry.name)))
          throw Error(
            `${file}: file items before SDK defaults require explicit ordering review; move declarative file items to the project or targets import.`,
          );
        for (const entry of group.children)
          entries.push({ entry, file, groupCondition: group.attributes.Condition });
        continue;
      }
      const enabled = condition(group.attributes.Condition, properties);
      for (const entry of group.children) {
        if (
          !propertyNames.has(entry.name) ||
          entry.children.length ||
          Object.keys(entry.attributes).some((key) => key !== "Condition")
        )
          throw Error(`${file}: unsupported property ${entry.name}.`);
        const selected = condition(entry.attributes.Condition, properties);
        const value = expand(entry.text.trim(), file, project);
        if (!enabled || !selected) continue;
        const name = entry.name.toLowerCase();
        if (
          declared.has(`${file}:${name}`) &&
          !entry.attributes.Condition &&
          !group.attributes.Condition
        )
          throw Error(`${file}: duplicate unconditional property ${entry.name}.`);
        declared.add(`${file}:${name}`);
        properties.set(name, value);
      }
    }
    active.delete(key);
  };
  before.forEach((file) => visit(file));
  beforeDefaults = false;
  visit(project, true);
  after.forEach((file) => visit(file));
  if (properties.has("targetframework") && properties.has("targetframeworks"))
    throw Error("Conflicting framework declarations.");
  const frameworks = (
    properties.get("targetframework") ??
    properties.get("targetframeworks") ??
    ""
  ).split(";");
  if (
    !frameworks.length ||
    frameworks.length > 32 ||
    frameworks.some((value) => !/^[A-Za-z0-9_.-]+$/.test(value))
  )
    throw Error("Target frameworks are absent or outside the supported literal .NET subset.");
  const projects: string[] = [],
    packages: string[] = [],
    operations: ProjectFileOperation[] = [];
  for (const { entry, file, groupCondition } of entries) {
    const groupEnabled = condition(groupCondition, properties);
    const entryEnabled = condition(entry.attributes.Condition, properties);
    const enabled = groupEnabled && entryEnabled;
    const attributes = Object.fromEntries(
      Object.entries(entry.attributes)
        .filter(([key]) => key !== "Condition")
        .map(([key, value]) => [key, expand(value, file, project)]),
    );
    const expanded = {
      ...entry,
      attributes,
      children: entry.children.map((child) => ({
        ...child,
        text: expand(child.text, file, project),
      })),
    };
    if (fileItemNames.has(entry.name)) {
      const operation = readFileOperation(project, expanded);
      if (enabled) operations.push(operation);
      continue;
    }
    const allowed =
      entry.name === "PackageReference"
        ? ["Include", "Version", "PrivateAssets", "IncludeAssets"]
        : entry.name === "PackageVersion"
          ? ["Include", "Version"]
          : entry.name === "ProjectReference"
            ? ["Include"]
            : [];
    if (
      !allowed.length ||
      !attributes.Include ||
      entry.text.trim() ||
      Object.keys(attributes).some((key) => !allowed.includes(key)) ||
      entry.children.some(
        (child) =>
          !["PrivateAssets", "IncludeAssets"].includes(child.name) ||
          child.children.length ||
          Object.keys(child.attributes).length,
      )
    )
      throw Error(`${file}: unsupported ${entry.name} declaration.`);
    if (!enabled) continue;
    if (entry.name === "ProjectReference") {
      const reference = metadataReference(project, attributes.Include);
      if (!reference || entry.children.length || !/\.csproj$/i.test(reference))
        throw Error(`${file}: unsupported ProjectReference.`);
      projects.push(reference);
    } else if (entry.name === "PackageReference") packages.push(attributes.Include);
  }
  if (packages.some((name) => /Microsoft\.Testing\.Platform/i.test(name)))
    throw Error("Microsoft.Testing.Platform requires a separate runner contract.");
  const name = properties.get("assemblyname") ?? project.split("/").at(-1)!.slice(0, -7);
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || [".", ".."].includes(name))
    throw Error("Unsupported AssemblyName.");
  const boolean = (name: string) => {
    const value = properties.get(name);
    if (value !== undefined && !/^(true|false)$/i.test(value))
      throw Error(`Unsupported boolean property ${name}.`);
    return value?.toLowerCase() !== "false";
  };
  const folder = project.slice(0, project.lastIndexOf("/") + 1);
  return {
    candidate: {
      path: project,
      kind: "project",
      frameworks,
      projects: [...new Set(projects)],
      runner: packages.includes("Microsoft.NET.Test.Sdk")
        ? "vstest"
        : properties.get("istestproject") === "false"
          ? "not-test"
          : "unknown",
      sourcePaths: [],
      coverage: "review-required",
      issues: [],
      quickIssues: [],
      evidence: [
        "Declarative proposal; installed toolchain and runner readiness remain unverified. Conservative source coverage includes project/shared subtrees.",
      ],
      quick: {
        configuration,
        assemblies: Object.fromEntries(
          frameworks.map((framework) => [
            framework,
            `${folder}bin/${configuration}/${framework}/${name}.dll`,
          ]),
        ),
      },
    },
    operations,
    defaults: {
      all: boolean("enabledefaultitems"),
      compile: boolean("enabledefaultcompileitems"),
      resource: boolean("enabledefaultembeddedresourceitems"),
      none: boolean("enabledefaultnoneitems"),
    },
  };
}
