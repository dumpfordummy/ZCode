import type { GraphProjectCandidate } from "../project-setup-types.js";
import { parseProjectXml } from "./project-xml.js";
import { metadataReference } from "./project-metadata.js";

/** 静态白名单只生成设置建议；复用无解析器/IO 的 XML 读取器，不执行 MSBuild。 */
export function addQuickProjectMetadata(item: GraphProjectCandidate, content: string): void {
  item.quickIssues = [...item.issues];
  if (item.kind === "solution") {
    try {
      validateQuickSolution(item, content);
    } catch (error) {
      item.coverage = "unsupported";
      item.quickIssues.push(
        error instanceof Error ? error.message : "Unsupported solution metadata.",
      );
    }
    return;
  }
  if (item.kind !== "project" || item.coverage === "unsupported") return;
  try {
    const root = parseProjectXml(new TextEncoder().encode(content));
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
    const projects: string[] = [];
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
          if (entry.name === "ProjectReference") {
            const reference = metadataReference(item.path, entry.attributes.Include!);
            if (!reference || entry.children.length) fail("Unsupported literal ProjectReference.");
            projects.push(reference!);
          }
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
    // 以解析后的 XML 属性建立闭包，避免单引号引用被提示扫描漏掉。
    item.projects = [...new Set(projects)];
  } catch (error) {
    item.quickIssues.push(error instanceof Error ? error.message : "Unsupported project metadata.");
  }
}

/** 解决方案映射也影响实际构建配置，不能据项目文件猜测 Debug 测试程序集。 */
function validateQuickSolution(item: GraphProjectCandidate, content: string) {
  if (/\.slnx$/i.test(item.path)) {
    const root = parseProjectXml(new TextEncoder().encode(content));
    const projects: string[] = [];
    const visit = (node: typeof root, depth = 0): void => {
      if (depth > 16 || node.text.trim()) throw Error("Unsupported solution XML structure.");
      const allowed =
        node === root
          ? []
          : node.name === "Folder"
            ? ["Name"]
            : node.name === "Project"
              ? ["Path"]
              : undefined;
      if (
        !allowed ||
        Object.keys(node.attributes).some((key) => !allowed.includes(key)) ||
        (node.name === "Project" && node.children.length)
      )
        throw Error("Solution configuration/custom project metadata requires review.");
      if (node.name === "Project") {
        const reference = metadataReference(item.path, node.attributes.Path ?? "");
        if (!reference || !/\.csproj$/i.test(reference))
          throw Error("Unsupported solution project reference.");
        projects.push(reference);
      }
      node.children.forEach((child) => visit(child, depth + 1));
    };
    if (root.name !== "Solution") throw Error("Malformed solution XML.");
    visit(root);
    item.projects = [...new Set(projects)];
  } else {
    if (!/^\uFEFF?Microsoft Visual Studio Solution File, Format Version 12\.00\r?$/m.test(content))
      throw Error("Unsupported or malformed solution header.");
    const lines = new Set<string>();
    let lineCount = 0;
    for (const match of content.matchAll(/[^\r\n]+/g)) {
      if (++lineCount > 65536) throw Error("Solution line structure budget exceeded (65536).");
      lines.add(match[0].trim());
    }
    let count = 0;
    for (const match of content.matchAll(
      /^Project\("([^"]+)"\)\s*=\s*"[^"]*",\s*"([^"]+)",\s*"([^"]+)"/gm,
    )) {
      // 解决方案文件夹只组织项目；不能把标准文件夹误报为不支持的可构建项目。
      if (match[1]!.toLowerCase() === "{2150e333-8fdc-42a3-9474-1a3956d46de8}") continue;
      if (!/\.csproj$/i.test(match[2]!))
        throw Error("Solution contains a project shape outside the C# contract.");
      count++;
      const guid = match[3]!;
      for (const mapping of ["ActiveCfg", "Build.0"]) {
        const expected = `${guid}.Debug|Any CPU.${mapping} = Debug|Any CPU`;
        if (!lines.has(expected))
          throw Error(`Solution Debug build mapping is unresolved for ${match[2]}.`);
      }
    }
    if (!count) throw Error("Solution has no supported projects.");
  }
}
