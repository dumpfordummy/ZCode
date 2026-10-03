// Z8.3-W1: copy a reviewed, path-sanitized subset of the raw local evidence into the repository's documentation folder.
// Raw evidence (screenshots, UI text, profile folders, logs) stays local under packages/desktop/<dist>/w1-evidence.
// usage: w1-collect-evidence.mjs <output dir> <dist-dir>:<label> [<dist-dir>:<label> ...]
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const [output, ...targets] = process.argv.slice(2);
if (!output || !targets.length)
  throw new Error("usage: w1-collect-evidence.mjs <output dir> <dist>:<label> ...");

const DROP = new Set([
  "body",
  "uiText",
  "home",
  "screenshots",
  "stack",
  "detachedDirectory",
  "detached",
]);
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !DROP.has(key))
        .map(([key, item]) => [key, clean(item)]),
    );
  if (typeof value === "string") return sanitizeText(value);
  return value;
}
function sanitizeText(text) {
  return text
    .replace(
      /[A-Za-z]:(?:\\\\|\\|\/)[^\s"')]*(?:zcode-graph-acceptance-|zcode-graph-w1-|zw1-)[^\s"')]*/g,
      "<sandbox>",
    )
    .replace(/[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\s"')]+/g, "<user-path>")
    .split("\n")
    .slice(0, 12)
    .join("\n")
    .slice(0, 1500);
}

await mkdir(output, { recursive: true });
const index = [];
for (const target of targets) {
  const [dist, label] = target.split(":");
  const dir = path.join(root, "packages/desktop", dist, "w1-evidence", label);
  const out = path.join(output, `${dist}__${label}`);
  await mkdir(out, { recursive: true });
  for (const name of await readdir(dir)) {
    if (
      !name.endsWith(".json") ||
      !/summary|inspect|suite|detached-component|retained-hash-check/.test(name)
    )
      continue;
    const parsed = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    await writeFile(path.join(out, name), `${JSON.stringify(clean(parsed), null, 2)}\n`);
    index.push(`${dist}__${label}/${name}`);
  }
}
await writeFile(path.join(output, "INDEX.txt"), `${index.join("\n")}\n`);
process.stdout.write(`${index.length} files written to ${output}\n`);
