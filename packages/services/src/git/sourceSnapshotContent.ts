import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { IFileService } from "../index.js";
import type { GitCommandProvider } from "./providers/gitCommandProvider.js";
import { sourceCommand, SOURCE_TEXT_BYTES } from "./sourceSnapshotManifest.js";

export function workspaceSourcePath(repoRoot: string, workspacePath: string, path: string): string {
  if (
    path.includes("\0") ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path.split("/").includes("..")
  ) {
    throw new Error("Unsafe Git source path.");
  }
  const scoped = relative(workspacePath, resolve(repoRoot, path));
  if (!scoped || isAbsolute(scoped) || scoped === ".." || scoped.startsWith(`..${sep}`)) {
    throw new Error("Git source path is outside the captured workspace.");
  }
  return scoped.split(sep).join("/");
}

function validateText(text: string): string {
  for (let index = 0; index < text.length; index++) {
    const value = text.charCodeAt(index);
    if (value <= 8 || value === 11 || (value >= 14 && value <= 31) || value === 127)
      throw new Error("Binary source evidence is unsupported.");
  }
  if (text.includes("\uFFFD")) throw new Error("Invalid UTF-8 source evidence is unsupported.");
  if (Buffer.byteLength(text) > SOURCE_TEXT_BYTES) throw new Error("Source text exceeds 128 KiB.");
  return text;
}

export async function readSourceBlob(
  provider: GitCommandProvider,
  cwd: string,
  hash: string,
): Promise<string> {
  if (!hash || /^0+$/.test(hash)) return "";
  if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error("Invalid native Git blob identity.");
  return validateText(
    await sourceCommand(provider, cwd, ["cat-file", "blob", hash], SOURCE_TEXT_BYTES),
  );
}

export async function readSourceWorktree(
  fileService: IFileService | undefined,
  workspacePath: string,
  path: string,
): Promise<string> {
  if (!fileService) throw new Error("Native bounded file service is unavailable.");
  let absolutePath = workspacePath;
  for (const segment of path.split("/")) {
    absolutePath = join(absolutePath, segment);
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) throw new Error("Symbolic link source evidence is unsupported.");
    if (!info.isDirectory() && !info.isFile())
      throw new Error("Nonregular source evidence is unsupported.");
  }
  const info = await fileService.stat({ path: absolutePath });
  if (info.type !== "file") throw new Error("Nonregular source evidence is unsupported.");
  if (info.size === undefined || info.size > SOURCE_TEXT_BYTES)
    throw new Error("Source text exceeds 128 KiB.");
  const bytes = await fileService.readFileRange({
    path: absolutePath,
    offset: 0,
    length: SOURCE_TEXT_BYTES + 1,
  });
  if (bytes.byteLength > SOURCE_TEXT_BYTES || bytes.byteLength !== info.size)
    throw new Error("Source text exceeds 128 KiB or changed during capture.");
  try {
    // 默认解码会剥除 BOM，未跟踪文件仅变更 BOM 时证据就无法识别；必须保留原文标记。
    return validateText(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error("Invalid UTF-8 source evidence is unsupported.");
    throw error;
  }
}
