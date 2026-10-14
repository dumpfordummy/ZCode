import type { ProjectXmlElement } from "./project-xml.js";

const namespace = "http://schemas.microsoft.com/developer/msbuild/2003";
const fallback =
  "Use Advanced with reviewed complete inputs, actual outputs and runner, or select a supported project.";

/** Structural equivalence only: never resolves an SDK or evaluates project code. */
export function projectRootChildren(root: ProjectXmlElement, file: string, project: boolean) {
  const fail = (message: string): never => {
    throw Error(`${file}: ${message}`);
  };
  if (root.name !== "Project" || root.text.trim())
    fail(`Expected a Project root with element content; found ${root.name}. ${fallback}`);
  for (const [name, value] of Object.entries(root.attributes)) {
    if (name === "xmlns" && value === namespace) continue;
    if (name === "Sdk" && project) continue;
    fail(
      `Unsupported root attribute ${name}="${value.slice(0, 160)}"; ${name === "ToolsVersion" ? "toolchain selection" : "root semantics"} is not modeled. ${fallback}`,
    );
  }
  const sdk = root.attributes.Sdk;
  if (project && sdk !== undefined && sdk !== "Microsoft.NET.Sdk") {
    if (/[$@%]/.test(sdk)) fail(`Unresolved dynamic SDK "${sdk.slice(0, 160)}". ${fallback}`);
    if (sdk === "Microsoft.NET.Sdk.Web")
      fail(
        `SDK Microsoft.NET.Sdk.Web introduces implicit Razor/static-web-asset inputs and targets outside this static contract. ${fallback}`,
      );
    fail(
      `Unsupported SDK "${sdk.slice(0, 160)}"; its inputs, outputs and resolver are unverified. ${fallback}`,
    );
  }
  const imports = root.children.filter(
    (child) => child.name === "Import" && child.attributes.Sdk !== undefined,
  );
  if (!project) {
    if (imports.length)
      fail(`SDK imports inside declarative metadata are unsupported. ${fallback}`);
    return root.children;
  }
  if (sdk !== undefined) {
    if (imports.length) fail(`Unsupported mixed implicit and explicit SDK imports. ${fallback}`);
    return root.children;
  }
  if (!imports.length)
    fail(
      `No literal SDK declaration; legacy or dynamic project effects require a reviewed toolchain/input/output contract. ${fallback}`,
    );
  if (imports.length > 2)
    fail(`Expected exactly two SDK imports; repeated SDK imports change evaluation. ${fallback}`);
  const first = root.children[0],
    last = root.children.at(-1);
  if (
    imports.length !== 2 ||
    first !== imports[0] ||
    last !== imports[1] ||
    first?.attributes.Project !== "Sdk.props" ||
    last?.attributes.Project !== "Sdk.targets"
  )
    fail(`Explicit SDK imports must be first Sdk.props and last Sdk.targets. ${fallback}`);
  for (const entry of imports)
    if (
      entry.attributes.Sdk !== "Microsoft.NET.Sdk" ||
      Object.keys(entry.attributes).length !== 2 ||
      entry.children.length ||
      entry.text.trim()
    )
      fail(
        `Requires unconditional literal Microsoft.NET.Sdk imports with only Project and Sdk attributes; observed SDK "${entry.attributes.Sdk?.slice(0, 160)}". ${fallback}`,
      );
  // 显式首尾导入与隐式 SDK 边界等价；其余节点仍由 U4 完整检查，不能跳过动态项。
  return root.children.slice(1, -1);
}
