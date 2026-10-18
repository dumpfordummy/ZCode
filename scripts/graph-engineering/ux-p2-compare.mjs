// Z8.5-UX-P2 evidence: pairs the before (untouched #25 baseline) and after (P2) captures by name and
// records what changed in the default view: visible characters, scroll height, horizontal overflow
// and whether the visible text changed at all. Reads capture JSON written by ux-p2-browser.mjs.
//   node scripts/graph-engineering/ux-p2-compare.mjs <before-dir> <after-dir> [--out=<metrics.json>]
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "./browser-harness-common.mjs";

/** The harness creates a random temporary workspace per run; that name is not a UI difference. */
const stable = (text) => text.replace(/\/tmp\/zcode-context-picker-[A-Za-z0-9]+/g, "<workspace>");
const read = async (dir, name) => JSON.parse(await readFile(path.join(dir, name), "utf8"));
const names = async (dir) =>
  (await readdir(dir)).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5));

export async function compareCaptures(beforeDir, afterDir) {
  const [before, after] = await Promise.all([names(beforeDir), names(afterDir)]);
  const shared = before.filter((name) => after.includes(name)).sort();
  const rows = [];
  for (const name of shared) {
    const [b, a] = await Promise.all([
      read(beforeDir, `${name}.json`),
      read(afterDir, `${name}.json`),
    ]);
    rows.push({
      name,
      beforeChars: b.visibleChars,
      afterChars: a.visibleChars,
      deltaChars: a.visibleChars - b.visibleChars,
      beforeHeight: b.scrollHeight,
      afterHeight: a.scrollHeight,
      textChanged: stable(b.visibleText) !== stable(a.visibleText),
      beforeOverflow: b.horizontalOverflow,
      afterOverflow: a.horizontalOverflow,
    });
  }
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  return {
    pairs: rows.length,
    onlyBefore: before.filter((name) => !after.includes(name)),
    onlyAfter: after.filter((name) => !before.includes(name)),
    changed: rows.filter((row) => row.textChanged).length,
    unchanged: rows.filter((row) => !row.textChanged).length,
    horizontalOverflowAfter: rows.filter((row) => row.afterOverflow).length,
    beforeChars: sum("beforeChars"),
    afterChars: sum("afterChars"),
    rows,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = parseArgs();
  const [beforeDir, afterDir] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const result = await compareCaptures(beforeDir, afterDir);
  if (typeof args.out === "string")
    await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `${result.pairs} pairs · ${result.changed} changed · ${result.unchanged} identical · overflow after: ${result.horizontalOverflowAfter}`,
  );
}
