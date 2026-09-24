import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ZCodeRecipe } from "@zcode/shared";

export async function resolveRecipeCwd(root: string, recipe: ZCodeRecipe): Promise<string> {
  if (recipe.executable.includes("\0") || recipe.args.some((arg) => arg.includes("\0")))
    throw new Error("Recipe contains a NUL byte");
  const tool = basename(recipe.executable.replaceAll("\\", "/"))
    .toLowerCase()
    .replace(/\.exe$/, "");
  if (
    /\.(cmd|bat|ps1|sh)$/i.test(tool) ||
    [
      "cmd",
      "powershell",
      "pwsh",
      "bash",
      "sh",
      "zsh",
      "fish",
      "csh",
      "wscript",
      "cscript",
    ].includes(tool)
  )
    throw new Error(
      "Script-shell and batch recipes are unsupported; configure a direct executable",
    );
  if (
    isAbsolute(recipe.cwdRelative) ||
    /^[A-Za-z]:/.test(recipe.cwdRelative) ||
    recipe.cwdRelative.split(/[\\/]/).includes("..") ||
    recipe.cwdRelative.includes("\0")
  )
    throw new Error("Recipe cwd must be workspace-relative without traversal");
  const workspace = resolve(root);
  const target = resolve(workspace, recipe.cwdRelative);
  const suffix = relative(workspace, target);
  if (suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix))
    throw new Error("Recipe cwd is outside workspace");
  let current = workspace;
  for (const segment of ["", ...suffix.split(sep).filter(Boolean)]) {
    if (segment) current = join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("Recipe cwd cannot contain symlink/reparse entries");
    if (!info.isDirectory()) throw new Error("Recipe cwd must name a directory");
  }
  if ((await realpath(workspace)) !== workspace || (await realpath(target)) !== target)
    throw new Error("Recipe cwd resolves through a symlink/reparse path");
  return target;
}
