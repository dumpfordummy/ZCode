import { dirname, isAbsolute, join, resolve } from "node:path";
import type { GraphWorkspaceTarget } from "../contract.js";
import type { WebProfileInputSelection } from "./web-profile-inputs.js";
import { readDeclaredFile } from "./artifact-files.js";
import { parseBoundedGraphJson } from "../domain/artifacts.js";
import { validateWebRestoreShape, webRestoreXml } from "../domain/web-profile-restore.js";

/** Reads only the two selected projects' prior restore artifacts, never invokes Restore. */
export async function readWebProfileRestore(
  target: GraphWorkspaceTarget,
  selection: WebProfileInputSelection,
  executable: string,
) {
  const rows = [];
  let packageRoot: string | undefined;
  for (const [role, project] of [
    ["web", selection.webProject],
    ["test", selection.testProject],
  ] as const) {
    const folder = project.slice(0, project.lastIndexOf("/")),
      name = project.slice(project.lastIndexOf("/") + 1);
    const read = async (file: string) =>
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readDeclaredFile(target, `${folder}/obj/${file}`, 4 * 1024 * 1024),
      );
    const assets = parseBoundedGraphJson(await read("project.assets.json"), {
      bytes: 4 * 1024 * 1024,
      members: 100000,
    });
    if (
      !assets ||
      typeof assets !== "object" ||
      Array.isArray(assets) ||
      !assets.packageFolders ||
      typeof assets.packageFolders !== "object" ||
      Array.isArray(assets.packageFolders)
    )
      throw Error("Prior restore package roots are missing.");
    const roots = Object.keys(assets.packageFolders);
    if (roots.length !== 1 || !isAbsolute(roots[0]!))
      throw Error("One exact reviewed package root is required.");
    const resolved = resolve(roots[0]!);
    if (packageRoot && packageRoot.toLowerCase() !== resolved.toLowerCase())
      throw Error("Web and Test package roots differ.");
    packageRoot = resolved;
    rows.push({
      role,
      value: {
        assets,
        props: webRestoreXml(await read(`${name}.nuget.g.props`)),
        targets: webRestoreXml(await read(`${name}.nuget.g.targets`)),
      },
    });
  }
  if (!packageRoot) throw Error("Package root unavailable.");
  const identities = {
    workspace: resolve(target.workspacePath),
    packageRoot,
    sdkDirectory: join(dirname(executable), "sdk", "8.0.426"),
    webProject: selection.webProject,
    testProject: selection.testProject,
  };
  for (const row of rows) validateWebRestoreShape(row.role, row.value, identities);
  return { packageRoot };
}
