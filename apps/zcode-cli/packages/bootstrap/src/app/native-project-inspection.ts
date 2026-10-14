import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  zcodeRecipeRequestSchema,
  INSPECTION_PURPOSE,
  INSPECTION_REVIEW_MS,
  INSPECTION_TIMEOUT_MS,
  inspectionArguments,
  inspectionReviewParamsSchema,
  type ZCodeRecipeRequest,
} from "@zcode/shared";

const MAX_FILES = 20_000,
  MAX_BYTES = 512 * 1024 * 1024,
  MAX_MS = 120_000;
const same = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
export class InspectionChanged extends Error {
  constructor() {
    super("Inspection inputs or installed engine changed; review again.");
  }
}
/** Bounded observation only. Excluded Git/app state is not a claimed Build input policy. */
async function observation(
  workspace: string,
  executable: string,
  sdk: string,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) {
  const deadline = performance.now() + MAX_MS;
  const hash = createHash("sha256");
  let files = 0,
    bytes = 0;
  const check = () => {
    signal?.throwIfAborted();
    if (performance.now() > deadline) throw Error("Inspection observation expired.");
  };
  const visit = async (path: string, depth: number) => {
    check();
    if (depth > 32) throw Error("Inspection observation depth limit.");
    const before = await lstat(path);
    if (before.isSymbolicLink() || !same(await realpath(path), resolve(path)))
      throw Error("Inspection link/reparse paths are unsupported.");
    if (before.isDirectory()) {
      const names = (await readdir(path)).sort();
      hash.update(JSON.stringify([path, names]));
      for (const name of names) {
        if (same(path, workspace) && [".git", ".zcode"].includes(name)) continue;
        await visit(join(path, name), depth + 1);
      }
      const after = await lstat(path);
      if (
        after.ino !== before.ino ||
        after.mtimeMs !== before.mtimeMs ||
        JSON.stringify((await readdir(path)).sort()) !== JSON.stringify(names)
      )
        throw new InspectionChanged();
      return;
    }
    if (
      !before.isFile() ||
      ++files > MAX_FILES ||
      (bytes += before.size) > MAX_BYTES ||
      before.size > 64 * 1024 * 1024
    )
      throw Error("Inspection observation file/byte limit.");
    const handle = await open(path, "r");
    const content = createHash("sha256");
    try {
      const opened = await handle.stat();
      if (opened.ino !== before.ino || opened.dev !== before.dev) throw new InspectionChanged();
      let count = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        check();
        count += chunk.length;
        if (count > before.size) throw new InspectionChanged();
        content.update(chunk);
      }
      const after = await lstat(path),
        final = await handle.stat();
      if (
        count !== before.size ||
        final.mtimeMs !== before.mtimeMs ||
        final.ctimeMs !== before.ctimeMs ||
        after.ino !== before.ino ||
        after.dev !== before.dev ||
        after.mtimeMs !== before.mtimeMs ||
        !same(await realpath(path), resolve(path))
      )
        throw new InspectionChanged();
      hash.update(JSON.stringify([path, count, content.digest("hex")]));
    } finally {
      await handle.close();
    }
  };
  await visit(workspace, 0);
  await visit(executable, 0);
  // Exact reviewed installed SDK directory, not the user profile or arbitrary package roots.
  await visit(sdk, 0);
  hash.update(
    JSON.stringify(
      Object.keys(env)
        .sort()
        .map((key) => [key, env[key]]),
    ),
  );
  return { observationDigest: hash.digest("hex"), observedFiles: files, observedBytes: bytes };
}

export async function prepareProjectInspection(
  raw: unknown,
  workspace: string,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<ZCodeRecipeRequest> {
  if (process.platform !== "win32")
    throw Error("Hard inspection process limit unavailable on this platform.");
  const selected = inspectionReviewParamsSchema.parse(raw);
  const root = resolve(workspace),
    executable = resolve(selected.executable);
  if (!isAbsolute(selected.executable) || !/^dotnet(?:\.exe)?$/i.test(basename(executable)))
    throw Error("Inspection requires the resolved installed dotnet executable.");
  const project = resolve(root, selected.project),
    relation = relative(root, project);
  if (
    isAbsolute(selected.project) ||
    relation === ".." ||
    relation.startsWith(`..${sep}`) ||
    selected.project.startsWith("-")
  )
    throw Error("Inspection target must be a relative project inside this workspace.");
  const projectInfo = await lstat(project);
  if (!projectInfo.isFile() || projectInfo.isSymbolicLink())
    throw Error("Inspection project is not a regular file.");
  const sdkDirectory = join(dirname(executable), "sdk", selected.sdkVersion);
  const engine = await lstat(join(sdkDirectory, "MSBuild.dll"));
  if (!engine.isFile()) throw Error("Selected installed MSBuild engine is unavailable.");
  const captured = await observation(root, executable, sdkDirectory, env, signal);
  const inspection = {
    purpose: INSPECTION_PURPOSE,
    project: selected.project,
    configuration: selected.configuration,
    framework: selected.framework,
    sdkVersion: selected.sdkVersion,
    sdkDirectory,
    ...captured,
    expiresAt: selected.expiresAt ?? Date.now() + INSPECTION_REVIEW_MS,
  };
  return zcodeRecipeRequestSchema.parse({
    operationId: selected.operationId,
    inspection,
    recipe: {
      id: INSPECTION_PURPOSE,
      executable,
      cwdRelative: ".",
      timeoutMs: INSPECTION_TIMEOUT_MS,
      args: inspectionArguments(inspection),
    },
  });
}

export async function validateProjectInspection(
  request: ZCodeRecipeRequest,
  workspace: string,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
) {
  if (!request.inspection) return;
  const binding = request.inspection;
  if (Date.now() >= binding.expiresAt) throw Error("Inspection review expired.");
  const fresh = await prepareProjectInspection(
    {
      sessionId: "validation",
      operationId: request.operationId,
      executable: request.recipe.executable,
      project: binding.project,
      configuration: binding.configuration,
      framework: binding.framework,
      sdkVersion: binding.sdkVersion,
      expiresAt: binding.expiresAt,
    },
    workspace,
    env,
    signal,
  );
  if (JSON.stringify(fresh) !== JSON.stringify(request)) throw new InspectionChanged();
}
