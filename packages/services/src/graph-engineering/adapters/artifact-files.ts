import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphFileFingerprint, GraphFileObservation } from "../artifact-types.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";
import { PROJECT_SCOPE_BUDGET } from "../domain/project-budgets.js";

const samePath = (left: string, right: string) =>
  process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
function assertWithin(root: string, child: string): void {
  const relation = relative(root, child);
  if (isAbsolute(relation) || relation === ".." || relation.startsWith(`..${sep}`))
    throw new Error("Declared path is outside the workspace.");
}
/** Preflight also validates existing ancestors of not-yet-created declared output files. */
export async function assertWorkspaceFilePath(
  target: GraphWorkspaceTarget,
  path: string,
  allowMissing = false,
): Promise<{ absolutePath: string; exists: boolean }> {
  validateGraphRelativePath(path);
  const root = resolve(target.workspacePath),
    rootInfo = await lstat(root),
    canonicalRoot = await realpath(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !samePath(root, canonicalRoot))
    throw new Error("Workspace link/reparse aliases are unsupported for declared capture.");
  const parts = path.split("/");
  let candidate = root,
    missing = false;
  for (const [index, part] of parts.entries()) {
    candidate = join(candidate, part);
    assertWithin(root, candidate);
    if (missing) continue;
    let info;
    try {
      info = await lstat(candidate);
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") {
        missing = true;
        continue;
      }
      throw error;
    }
    if (info.isSymbolicLink())
      throw new Error("Declared paths must not traverse symbolic links or reparse points.");
    const canonical = await realpath(candidate);
    assertWithin(canonicalRoot, canonical);
    if (!samePath(candidate, canonical))
      throw new Error("Declared path has an unsupported reparse alias.");
    if (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())
      throw new Error("Declared artifact path is not a regular file.");
  }
  return { absolutePath: candidate, exists: !missing };
}

async function streamDeclaredFile(
  target: GraphWorkspaceTarget,
  path: string,
  maximum: number,
  retain: boolean,
  deadline = Infinity,
): Promise<{ bytes: number; digest: string; modifiedAt: number; content?: Buffer }> {
  const beforePath = await assertWorkspaceFilePath(target, path);
  const before = await lstat(beforePath.absolutePath);
  if (before.size > maximum)
    throw new Error(
      `Declared file is ${(before.size / 1048576).toFixed(2)} MiB (${before.size} bytes) and exceeds the ${(maximum / 1048576).toFixed(2)} MiB (${maximum}-byte) limit.`,
    );
  const handle = await open(beforePath.absolutePath, "r"),
    chunks: Buffer[] = [],
    hash = createHash("sha256");
  let bytes = 0;
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs
    )
      throw new Error("Declared file changed before capture.");
    const buffer = Buffer.alloc(64 * 1024);
    for (;;) {
      if (Date.now() > deadline) throw new Error("Fingerprint elapsed-time budget exceeded.");
      const result = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, maximum + 1 - bytes),
        null,
      );
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
      if (bytes > maximum) throw new Error(`Declared file exceeds the ${maximum}-byte limit.`);
      const chunk = buffer.subarray(0, result.bytesRead);
      hash.update(chunk);
      if (retain) chunks.push(Buffer.from(chunk));
    }
    const after = await handle.stat();
    await assertWorkspaceFilePath(target, path);
    const final = await lstat(beforePath.absolutePath);
    if (
      bytes !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      final.ino !== before.ino ||
      final.dev !== before.dev ||
      final.mtimeMs !== before.mtimeMs ||
      final.size !== before.size
    )
      throw new Error("Declared file changed during capture.");
  } finally {
    await handle.close();
  }
  return {
    bytes,
    digest: hash.digest("hex"),
    modifiedAt: before.mtimeMs,
    ...(retain ? { content: Buffer.concat(chunks) } : {}),
  };
}
export async function readDeclaredFile(
  target: GraphWorkspaceTarget,
  path: string,
  maximum: number,
): Promise<Buffer> {
  return (await streamDeclaredFile(target, path, maximum, true)).content!;
}
export async function readDeclaredFileSnapshot(
  target: GraphWorkspaceTarget,
  path: string,
  maximum: number,
) {
  const snapshot = await streamDeclaredFile(target, path, maximum, true);
  return { ...snapshot, content: snapshot.content! };
}
export async function fingerprintDeclaredFiles(
  target: GraphWorkspaceTarget,
  paths: string[],
): Promise<GraphFileFingerprint> {
  return fingerprintDeclaredFilesWithin(target, paths, Date.now() + PROJECT_SCOPE_BUDGET.elapsedMs);
}
export async function fingerprintDeclaredFilesWithin(
  target: GraphWorkspaceTarget,
  paths: string[],
  deadline = Date.now() + PROJECT_SCOPE_BUDGET.elapsedMs,
): Promise<GraphFileFingerprint> {
  validateFingerprintPaths(paths);
  const files: GraphFileFingerprint["files"] = [];
  let remaining = PROJECT_SCOPE_BUDGET.sourceBytes;
  const ordered = [...paths].sort();
  let cursor = 0;
  let failure: unknown;
  const worker = async () => {
    while (cursor < ordered.length && !failure) {
      const index = cursor++,
        path = ordered[index]!;
      try {
        if (Date.now() > deadline) throw new Error("Fingerprint elapsed-time budget exceeded.");
        const checked = await assertWorkspaceFilePath(target, path);
        const size = (await lstat(checked.absolutePath)).size;
        if (size > PROJECT_SCOPE_BUDGET.sourceFileBytes)
          throw new Error(
            `Source per-file byte budget exceeded (${PROJECT_SCOPE_BUDGET.sourceFileBytes} bytes): ${path} (${size} bytes).`,
          );
        if (size > remaining)
          throw new Error(
            `Source byte budget exceeded: ${path} (${size} bytes; ${remaining} remaining).`,
          );
        remaining -= size;
        const { bytes, digest, modifiedAt } = await streamDeclaredFile(
          target,
          path,
          size,
          false,
          deadline,
        );
        files[index] = { path, bytes, digest, modifiedAt };
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PROJECT_SCOPE_BUDGET.concurrency, ordered.length) }, worker),
  );
  if (failure) throw failure;
  // 时间属于新鲜度证据而非字节身份；同内容重建必须保留相同的来源摘要。
  const content = files.map(({ path, bytes, digest }) => ({ path, bytes, digest }));
  return { files, digest: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}

function validateFingerprintPaths(
  paths: string[],
  maximum: number = PROJECT_SCOPE_BUDGET.sourceFiles,
): void {
  if (
    paths.length > maximum ||
    new Set(paths.map((path) => path.toLowerCase())).size !== paths.length
  )
    throw new Error(`Declare at most ${maximum} unique, non-aliased fingerprint paths.`);
}

export async function observeDeclaredFiles(
  target: GraphWorkspaceTarget,
  paths: string[],
): Promise<GraphFileObservation[]> {
  validateFingerprintPaths(paths, 32);
  const result: GraphFileObservation[] = [];
  for (const path of [...paths].sort()) {
    const checked = await assertWorkspaceFilePath(target, path, true);
    if (!checked.exists) result.push({ path, exists: false });
    else {
      const { bytes, digest, modifiedAt } = await streamDeclaredFile(
        target,
        path,
        32 * 1024 * 1024,
        false,
      );
      result.push({ path, exists: true, bytes, digest, modifiedAt });
    }
  }
  return result;
}
