import { lstat, realpath, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep, parse } from "node:path";
import { homedir } from "node:os";

export function graphSourcePath(value: string): string {
  if (!value || value.includes("\\") || isAbsolute(value) || value.includes(":"))
    throw new Error("A plain workspace-relative source path is required.");
  if (
    value
      .split("/")
      .some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")
  )
    throw new Error("Unsafe source path.");
  return value;
}
export async function realGraphDirectory(value: string): Promise<string> {
  const absolute = resolve(value);
  const real = await realpath(absolute);
  if (real !== absolute || (await lstat(absolute)).isSymbolicLink())
    throw new Error("Aliased or symbolic workspace paths are unsupported.");
  return real;
}
export function graphOwnedPath(root: string, ownerId: string, slot: string): string {
  if (![ownerId, slot].every((part) => /^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(part)))
    throw new Error("Invalid owned workspace identifier.");
  const path = resolve(root, ownerId, slot);
  const child = relative(resolve(root), path);
  if (
    !child ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child) ||
    path === homedir() ||
    path === parse(path).root
  )
    throw new Error("Refusing a foreign, home or root workspace.");
  return path;
}
export async function assertGraphTreeHasNoLinks(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error("Owned workspace contains a symbolic link; retain and inspect it.");
    if (info.isDirectory()) await assertGraphTreeHasNoLinks(path);
    else if (!info.isFile()) throw new Error("Unsupported owned workspace entry.");
  }
}
