import type { GraphProjectCandidate } from "../project-setup-types.js";
import { parseTrxXml } from "./trx-xml.js";

/** 静态白名单只生成设置建议；复用无解析器/IO 的 XML 读取器，不执行 MSBuild。 */
export function addQuickProjectMetadata(item: GraphProjectCandidate, content: string): void {
  item.quickIssues = [...item.issues];
  if (item.kind !== "project" || item.coverage === "unsupported") return;
  try {
    const root = parseTrxXml(new TextEncoder().encode(content));
    const fail = (reason: string): never => {
      throw new Error(reason);
    };
    if (
      root.name !== "Project" ||
      root.attributes.Sdk !== "Microsoft.NET.Sdk" ||
      Object.keys(root.attributes).length !== 1 ||
      root.text.trim()
    )
      fail("Quick requires a literal Microsoft.NET.Sdk project with default imports.");
    const properties = new Map<string, string>();
    const packages: string[] = [];
    const allowedProperties = new Set([
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
    ]);
    for (const group of root.children) {
      if (
        Object.keys(group.attributes).length ||
        group.text.trim() ||
        !["PropertyGroup", "ItemGroup"].includes(group.name)
      )
        fail(`Quick cannot establish defaults for ${group.name} or conditional metadata.`);
      for (const entry of group.children) {
        if (group.name === "PropertyGroup") {
          if (
            !allowedProperties.has(entry.name) ||
            Object.keys(entry.attributes).length ||
            entry.children.length ||
            properties.has(entry.name) ||
            /[$@%]&?|[<>]/.test(entry.text)
          )
            fail(`Quick cannot derive outputs/source scope with property ${entry.name}.`);
          properties.set(entry.name, entry.text.trim());
        } else {
          const allowed =
            entry.name === "PackageReference"
              ? ["Include", "Version", "PrivateAssets", "IncludeAssets"]
              : entry.name === "ProjectReference"
                ? ["Include"]
                : [];
          if (
            !allowed.length ||
            !entry.attributes.Include ||
            entry.text.trim() ||
            Object.keys(entry.attributes).some((key) => !allowed.includes(key)) ||
            entry.children.some(
              (child) =>
                !["PrivateAssets", "IncludeAssets"].includes(child.name) ||
                Object.keys(child.attributes).length ||
                child.children.length,
            )
          )
            fail(`Quick cannot derive source scope for ${entry.name}.`);
          if (entry.name === "PackageReference") packages.push(entry.attributes.Include!);
        }
      }
    }
    if (properties.has("TargetFramework") && properties.has("TargetFrameworks"))
      fail("Multiple framework declarations require Advanced review.");
    if (!item.frameworks.length) fail("No literal target framework was established.");
    // 旧提示识别可包含注释/子串；Quick 必须核对真实 XML 包标识，不能用文件名或标志推断运行器。
    if (item.runner === "vstest" && !packages.includes("Microsoft.NET.Test.Sdk"))
      fail("An exact Microsoft.NET.Test.Sdk package reference was not established.");
    const name = properties.get("AssemblyName") ?? item.path.split("/").at(-1)!.slice(0, -7);
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === "..")
      fail("AssemblyName is not a supported literal file name.");
    const folder = item.path.includes("/")
      ? item.path.slice(0, item.path.lastIndexOf("/") + 1)
      : "";
    item.quick = {
      configuration: "Debug",
      assemblies: Object.fromEntries(
        item.frameworks.map((framework) => [
          framework,
          `${folder}bin/Debug/${framework}/${name}.dll`,
        ]),
      ),
    };
  } catch (error) {
    item.quickIssues.push(error instanceof Error ? error.message : "Unsupported project metadata.");
  }
}
