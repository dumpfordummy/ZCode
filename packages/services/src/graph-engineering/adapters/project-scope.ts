import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { GraphSourceScope } from "../domain/project-budgets.js";
import { PROJECT_SCOPE_BUDGET } from "../domain/project-budgets.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";
import { assertWorkspaceFilePath, readDeclaredFile } from "./artifact-files.js";
import { ProjectScanJob, pathKey, projectDigest } from "./project-scan-job.js";

const ancestorNames = [
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Direct preparation never upgrades the completeness of a partial inventory scan. */
export async function prepareProjectScope(job: ProjectScanJob, project: string) {
  validateGraphRelativePath(project);
  if (!/\.(sln|slnx|csproj)$/i.test(project)) throw Error("Select a solution or C# project.");
  job.progress.stage = "metadata";
  const complete = new Set<string>(),
    active = new Set<string>();
  const stack = [{ path: project, exit: false }];
  while (stack.length) {
    job.check();
    const item = stack.pop()!,
      key = pathKey(item.path);
    if (item.exit) {
      active.delete(key);
      complete.add(key);
      continue;
    }
    if (active.has(key)) throw Error(`Cyclic required ProjectReference: ${item.path}.`);
    if (complete.has(key)) continue;
    if (active.size >= PROJECT_SCOPE_BUDGET.depth)
      throw Error(`Reference depth budget reached (${PROJECT_SCOPE_BUDGET.depth}).`);
    const candidate = await job.metadata(item.path);
    if (!candidate) throw Error(`Required project could not be read: ${item.path}.`);
    if (candidate.coverage === "unsupported" || (candidate.kind === "project" && !candidate.quick))
      throw Error(
        `${item.path}: ${candidate.quickIssues?.[0] ?? candidate.issues[0] ?? "Unsupported project shape"}`,
      );
    if (candidate.kind === "solution" && !candidate.projects.length)
      throw Error(`${item.path}: no literal project references were established.`);
    active.add(key);
    stack.push({ path: item.path, exit: true });
    for (const path of [...candidate.projects].reverse()) stack.push({ path, exit: false });
    if (stack.length > PROJECT_SCOPE_BUDGET.referenceEdges * 2)
      throw Error("Reference queue budget reached.");
  }
  const paths = new Map<string, string>();
  let totalBytes = 0;
  const add = async (path: string) => {
    job.check();
    const key = pathKey(path),
      old = paths.get(key);
    if (old && old !== path) throw Error(`Ambiguous case/alias source: ${old}, ${path}.`);
    if (old) return;
    if (paths.size >= PROJECT_SCOPE_BUDGET.sourceFiles)
      throw Error(`Source count budget reached (${PROJECT_SCOPE_BUDGET.sourceFiles}).`);
    const { absolutePath } = await assertWorkspaceFilePath(job.target, path);
    const info = await lstat(absolutePath);
    if (info.size > PROJECT_SCOPE_BUDGET.sourceFileBytes)
      throw Error(
        `${path}: ${info.size} bytes exceeds source limit ${PROJECT_SCOPE_BUDGET.sourceFileBytes}.`,
      );
    if (totalBytes + info.size > PROJECT_SCOPE_BUDGET.sourceBytes)
      throw Error(`Source aggregate budget reached (${PROJECT_SCOPE_BUDGET.sourceBytes} bytes).`);
    paths.set(key, path);
    totalBytes += info.size;
  };
  const folders = new Set<string>();
  const solutionFolders = new Set<string>();
  const solutions = job.result.candidates.filter((candidate) => candidate.kind === "solution");
  for (const candidate of job.result.candidates) {
    await add(candidate.path);
    if (candidate.kind === "project")
      folders.add(
        candidate.path.includes("/")
          ? candidate.path.slice(0, candidate.path.lastIndexOf("/"))
          : "",
      );
  }
  for (const solution of solutions)
    solutionFolders.add(
      solution.path.includes("/") ? solution.path.slice(0, solution.path.lastIndexOf("/")) : "",
    );
  const names = [
    ...ancestorNames,
    ...(solutions.length ? ["Directory.Solution.props", "Directory.Solution.targets"] : []),
  ];
  for (const solution of solutions)
    for (const path of new Set([solution.path, solution.path.replace(/\.slnx$/i, ".sln")])) {
      const slash = path.lastIndexOf("/"),
        folder = path.slice(0, slash + 1),
        name = path.slice(slash + 1);
      for (const prefix of ["before", "after"]) {
        const imported = `${folder}${prefix}.${name}.targets`;
        if (await exists(join(job.target.workspacePath, imported)))
          throw Error(`${imported}: solution-specific imports require Advanced review.`);
      }
    }
  // 工作区外的适用元数据不能假定不存在；发现后明确阻止自动验证。
  let parent = dirname(resolve(job.target.workspacePath));
  for (let count = 0; ; count++) {
    job.check();
    if (count > PROJECT_SCOPE_BUDGET.depth)
      throw Error("External ancestor inspection depth exceeded.");
    for (const name of names)
      if (await exists(join(parent, name)))
        throw Error(`Applicable metadata outside workspace requires review: ancestor ${name}.`);
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  const ancestors = new Set<string>([""]);
  const projectAncestors = new Set<string>([""]),
    solutionAncestors = new Set<string>();
  for (const folder of [...folders, ...solutionFolders]) {
    const parts = folder.split("/");
    while (parts.length) {
      ancestors.add(parts.join("/"));
      if (folders.has(folder)) projectAncestors.add(parts.join("/"));
      if (solutionFolders.has(folder)) solutionAncestors.add(parts.join("/"));
      parts.pop();
    }
  }
  if (solutions.length) solutionAncestors.add("");
  for (const folder of ancestors)
    for (const name of names) {
      if (name.startsWith("Directory.Solution.") && !solutionAncestors.has(folder)) continue;
      if (
        /^Directory\.(Build\.(props|targets)|Packages\.props)$/.test(name) &&
        !projectAncestors.has(folder)
      )
        continue;
      const path = folder ? `${folder}/${name}` : name;
      if (!(await exists(join(job.target.workspacePath, path)))) continue;
      await job.metadata(path);
      await add(path);
      if (name === "global.json") {
        const value: unknown = JSON.parse(job.contents.get(pathKey(path))!);
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          Object.keys(value).some((key) => !["$schema", "sdk"].includes(key))
        )
          throw Error(`${path}: custom SDK/runner metadata requires Advanced review.`);
        const sdk = (value as { sdk?: unknown }).sdk;
        if (
          sdk !== undefined &&
          (!sdk ||
            typeof sdk !== "object" ||
            Array.isArray(sdk) ||
            Object.keys(sdk).some(
              (key) => !["version", "rollForward", "allowPrerelease"].includes(key),
            ))
        )
          throw Error(`${path}: external/custom SDK resolution requires Advanced review.`);
      }
      if (/^Directory\./i.test(name))
        throw Error(`${path}: applicable imported defaults require Advanced review.`);
    }
  job.progress.stage = "sources";
  const roots = [...folders]
    .sort()
    .filter(
      (folder, _, all) =>
        !all.some((other) => other !== folder && (other === "" || folder.startsWith(`${other}/`))),
    );
  for (const folder of roots) await job.walk(folder, add, true);
  // 元数据读取与源枚举间发生变化时拒绝发布，不把不同时刻的闭包拼成授权。
  let recheckRemaining = PROJECT_SCOPE_BUDGET.metadataRecheckBytes;
  for (const metadata of job.result.metadata) {
    job.check();
    if (metadata.bytes > recheckRemaining) throw Error("Metadata recheck byte budget exceeded.");
    const bytes = await readDeclaredFile(job.target, metadata.path, metadata.bytes);
    recheckRemaining -= bytes.length;
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.digest)
      throw Error(`Required metadata changed during preparation: ${metadata.path}.`);
  }
  await job.verifyDirectories();
  const sourcePaths = [...paths.values()].sort();
  const metadata = [...job.result.metadata].sort((a, b) => (a.path < b.path ? -1 : 1));
  const scope: GraphSourceScope = {
    version: 1,
    project,
    sourceCount: sourcePaths.length,
    membershipDigest: projectDigest({ version: 1, project, sourcePaths, metadata }),
  };
  job.result.prepared = { scope, sourcePaths };
  if (Buffer.byteLength(JSON.stringify(job.result)) > PROJECT_SCOPE_BUDGET.serializedBytes) {
    delete job.result.prepared;
    throw Error(
      "Selected response exceeds the 4 MiB serialized inventory budget; select a narrower target.",
    );
  }
}

export async function revalidateProjectScope(
  target: ProjectScanJob["target"],
  expected: GraphSourceScope,
  deadline = Date.now() + PROJECT_SCOPE_BUDGET.elapsedMs,
) {
  const job = new ProjectScanJob(target, "freshness");
  job.limits.elapsedMs = Math.max(0, deadline - Date.now());
  await prepareProjectScope(job, expected.project);
  const prepared = job.finish().prepared!;
  if (
    prepared.scope.membershipDigest !== expected.membershipDigest ||
    prepared.scope.sourceCount !== expected.sourceCount
  )
    throw Error("Selected input membership or metadata changed; detect and prepare checks again.");
  return prepared.sourcePaths;
}
