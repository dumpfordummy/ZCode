import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphFileFingerprint, GraphFileObservation } from "../artifact-types.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";

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
): Promise<{ bytes: number; digest: string; modifiedAt: number; content?: Buffer }> {
  const beforePath = await assertWorkspaceFilePath(target, path);
  const before = await lstat(beforePath.absolutePath);
  if (before.size > maximum) throw new Error(`Declared file exceeds the ${maximum}-byte limit.`);
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
export async function fingerprintDeclaredFiles(
  target: GraphWorkspaceTarget,
  paths: string[],
): Promise<GraphFileFingerprint> {
  validateFingerprintPaths(paths);
  const files: GraphFileFingerprint["files"] = [];
  for (const path of [...paths].sort()) {
    const { bytes, digest, modifiedAt } = await streamDeclaredFile(
      target,
      path,
      32 * 1024 * 1024,
      false,
    );
    files.push({ path, bytes, digest, modifiedAt });
  }
  // 时间属于新鲜度证据而非字节身份；同内容重建必须保留相同的来源摘要。
  const content = files.map(({ path, bytes, digest }) => ({ path, bytes, digest }));
  return { files, digest: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
}

function validateFingerprintPaths(paths: string[]): void {
  if (paths.length > 32 || new Set(paths).size !== paths.length)
    throw new Error("Declare at most 32 unique fingerprint paths.");
}

export async function observeDeclaredFiles(
  target: GraphWorkspaceTarget,
  paths: string[],
): Promise<GraphFileObservation[]> {
  validateFingerprintPaths(paths);
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
