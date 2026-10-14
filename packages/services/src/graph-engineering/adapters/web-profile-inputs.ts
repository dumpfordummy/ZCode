import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { GraphWorkspaceTarget } from "../contract.js";
import { PROJECT_SCOPE_BUDGET } from "../domain/project-budgets.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";
import {
  webProfileSyntax,
  assertWebProfileFiles,
  WEB_PROFILE_POLICY,
} from "../domain/web-profile-syntax.js";
import {
  projectPatternMayEnter,
  projectPatternExcludesTree,
  assertLiteralResource,
} from "../domain/project-items.js";
import { ProjectScanJob, pathKey, projectDigest } from "./project-scan-job.js";
import { loadDeclarativeProject } from "./project-declarative-load.js";
import { assertWorkspaceFilePath, readDeclaredFile } from "./artifact-files.js";

export interface WebProfileInputSelection {
  webProject: string;
  testProject: string;
  configuration: "Debug" | "Release";
}
export interface WebProfileInputMembership {
  policy: typeof WEB_PROFILE_POLICY;
  selection: WebProfileInputSelection;
  sourcePaths: string[];
  metadata: Array<{ path: string; digest: string; bytes: number }>;
  excludedOutputRoots: string[];
  membershipDigest: string;
  /** Workspace membership alone never establishes toolchain/effective configuration completeness. */
  scopeComplete: false;
}
const ancestors = [
  "Directory.Build.props",
  "Directory.Build.targets",
  "Directory.Build.rsp",
  "Directory.Packages.props",
  "global.json",
  "NuGet.Config",
  ".editorconfig",
];
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

/** Reuses the bounded scan/file owners; exact output exclusions apply only to this named syntax. */
export async function prepareWebProfileInputs(
  target: GraphWorkspaceTarget,
  selection: WebProfileInputSelection,
  deadline = Date.now() + PROJECT_SCOPE_BUDGET.elapsedMs,
): Promise<WebProfileInputMembership> {
  const { webProject, testProject, configuration } = selection;
  const normalizedSelection = { webProject, testProject, configuration };
  for (const project of [webProject, testProject]) {
    validateGraphRelativePath(project);
    if (!/\.csproj$/i.test(project) || !project.includes("/"))
      throw Error("This Web profile requires separate project directories inside the workspace.");
  }
  const folders = [webProject, testProject].map((p) => p.slice(0, p.lastIndexOf("/")));
  if (
    folders[0]!.toLowerCase() === folders[1]!.toLowerCase() ||
    folders.some((p, i) => p.toLowerCase().startsWith(folders[1 - i]!.toLowerCase() + "/"))
  )
    throw Error("Web and Test project directories must be disjoint.");
  const job = new ProjectScanJob(target, "web-input-preparation", undefined, 2, configuration);
  job.limits.elapsedMs = Math.max(0, deadline - Date.now());
  let parent = dirname(resolve(target.workspacePath));
  for (let depth = 0; ; depth++) {
    job.check();
    if (depth > PROJECT_SCOPE_BUDGET.depth) throw Error("External ancestor depth exceeded.");
    for (const name of ancestors)
      if (await exists(join(parent, name)))
        throw Error(`Applicable metadata outside workspace requires review: ancestor ${name}.`);
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  const declarations = [];
  for (const [index, project] of [webProject, testProject].entries()) {
    await job.metadata(project);
    const declaration = await loadDeclarativeProject(job, project, index === 0);
    declarations.push(
      webProfileSyntax({
        project,
        documents: job.contents,
        configuration,
        role: index === 0 ? "web" : "test",
        webProject,
        declaration,
      }),
    );
  }
  const outputRoots = folders.flatMap((folder) => [`${folder}/bin`, `${folder}/obj`]);
  const exclusions = new Set([".git", ".zcode", ...outputRoots.map(pathKey)]);
  for (const declaration of declarations)
    for (const operation of declaration.operations) {
      if (operation.action === "Remove") continue;
      for (const excluded of exclusions)
        if (
          operation.patterns.some((pattern) => projectPatternMayEnter(pattern, excluded)) &&
          !operation.excludes.some((pattern) => projectPatternExcludesTree(pattern, excluded))
        )
          throw Error(
            `Declared ${operation.kind} input may enter excluded output/state: ${excluded}.`,
          );
    }
  const paths = new Map<string, string>();
  let sourceBytes = 0;
  const add = async (path: string) => {
    job.check();
    const key = pathKey(path),
      old = paths.get(key);
    if (old && old !== path) throw Error(`Ambiguous source alias: ${path}.`);
    if (old) return;
    if (paths.size >= PROJECT_SCOPE_BUDGET.sourceFiles)
      throw Error("Web source count budget exceeded.");
    const checked = await assertWorkspaceFilePath(target, path);
    const info = await lstat(checked.absolutePath);
    if (
      info.size > PROJECT_SCOPE_BUDGET.sourceFileBytes ||
      (sourceBytes += info.size) > PROJECT_SCOPE_BUDGET.sourceBytes
    )
      throw Error("Web source byte budget exceeded.");
    assertWebProfileFiles([path]);
    if (/(?:^|\/)Directory\.Build\.rsp$/i.test(path))
      throw Error("Automatic response files are outside this profile.");
    if (/\.resx$/i.test(path))
      assertLiteralResource(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readDeclaredFile(target, path, PROJECT_SCOPE_BUDGET.sourceFileBytes),
        ),
      );
    paths.set(key, path);
  };
  // Conservative membership is justified only after the strict known project/import/package syntax.
  // Unknown SDKs, targets, generators or property functions never reach this traversal.
  await job.walk("", add, true, exclusions);
  for (const project of [webProject, testProject]) {
    const folder = project.slice(0, project.lastIndexOf("/"));
    const name = project.slice(project.lastIndexOf("/") + 1);
    // These are prior restore inputs, not SDK-generated compilation outputs.
    for (const nameInObj of [
      "project.assets.json",
      `${name}.nuget.g.props`,
      `${name}.nuget.g.targets`,
    ])
      await add(`${folder}/obj/${nameInObj}`);
  }
  const global = await readDeclaredFile(target, "global.json", 4096);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(global));
  if (
    !parsed ||
    Object.keys(parsed).join() !== "sdk" ||
    !parsed.sdk ||
    Object.keys(parsed.sdk).sort().join() !== "rollForward,version" ||
    parsed.sdk.version !== "8.0.426" ||
    parsed.sdk.rollForward !== "disable"
  )
    throw Error("Web profile requires exact installed SDK 8.0.426 with rollForward disabled.");
  for (const metadata of job.result.metadata) {
    const bytes = await readDeclaredFile(target, metadata.path, metadata.bytes);
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.digest)
      throw Error(`Required metadata changed during Web preparation: ${metadata.path}.`);
  }
  await job.verifyDirectories();
  const sourcePaths = [...paths.values()].sort(),
    metadata = [...job.result.metadata].sort((a, b) => a.path.localeCompare(b.path));
  return {
    policy: WEB_PROFILE_POLICY,
    selection: normalizedSelection,
    sourcePaths,
    metadata,
    excludedOutputRoots: outputRoots,
    membershipDigest: projectDigest({
      policy: WEB_PROFILE_POLICY,
      selection: normalizedSelection,
      sourcePaths,
      metadata,
      outputRoots,
    }),
    scopeComplete: false,
  };
}
