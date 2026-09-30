import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Windows 与默认 macOS 的文件系统不区分大小写，而 TypeScript 把 `./X.js` 先解析为 `X.ts`。
// `graphRecipeChanges.ts` 与 `GraphRecipeChanges.tsx` 在 Linux 上互不干扰，在 Windows 上却让
// `./GraphRecipeChanges.js` 落到前者（TS1149/TS2724）。因此同一目录内，忽略扩展名后仅大小写
// 不同的模块名不得并存（同名不同扩展名，如 x.js 与 x.ts，是另一回事，不在此列）。
const packagesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODULE = /\.(?:[cm]?[jt]sx?)$/;
const SKIPPED = new Set(["node_modules", "dist", "out", ".turbo"]);

async function collisions(directory: string, found: string[] = []): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) await collisions(path.join(directory, entry.name), found);
    } else if (MODULE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      const stem = entry.name.replace(MODULE, "");
      const key = stem.toLowerCase();
      groups.set(key, (groups.get(key) ?? new Set<string>()).add(stem));
    }
  }
  for (const stems of groups.values())
    if (stems.size > 1) found.push(`${directory}: ${[...stems].join(", ")}`);
  return found;
}

test("no two sibling modules differ only by letter case (case-insensitive file systems)", async () => {
  const packages = await readdir(packagesRoot, { withFileTypes: true });
  const found: string[] = [];
  for (const item of packages)
    if (item.isDirectory())
      await collisions(path.join(packagesRoot, item.name, "src")).then(
        (list) => found.push(...list),
        () => {},
      );
  assert.deepEqual(found, []);
});
