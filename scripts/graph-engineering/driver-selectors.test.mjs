// Static guard for the historical native drivers: every test id a driver uses must still exist in
// the UI source (a literal id, or an id built from a template prefix such as `graph-template-recipe-${id}`).
// It cannot prove a driver passes (only a native run can); it proves the driver does not reach for a
// control that was renamed or removed, which is how z6/u1/u5 became blocked.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const uiSources = ["ui", "shared", "desktop"].map((name) =>
  path.resolve(here, `../../packages/${name}/src`),
);
// 已被 UX 审计移除的 id：模板前缀（graph-view-${mode}）会让它们看起来仍然存在。
const REMOVED = new Set(["graph-view-workflows"]);

export const DRIVERS = [
  "z6-native-smoke.mjs",
  "z6-native-ui.mjs",
  "z6-native-library.mjs",
  "pre-z8-u1-native.mjs",
  "pre-z8-u1-ui.mjs",
  "pre-z8-u5-native.mjs",
  "pre-z8-u5-library.mjs",
  "ux-m3-native-library.mjs",
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Literal ids and template prefixes found in the UI source. */
async function uiIds() {
  const literals = new Set();
  const prefixes = new Set();
  for (const file of (await Promise.all(uiSources.map(walk))).flat()) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(
      /(?:data-testid|testId|dataTestId)=\{?["'`]([^"'`]+)["'`]/g,
    )) {
      const id = match[1];
      if (id.includes("${")) {
        const prefix = id.slice(0, id.indexOf("${"));
        if (prefix.length >= 6) prefixes.add(prefix); // 空前缀（`${prefix}-json`）不能让所有 id 都算存在
      } else literals.add(id);
    }
    if (/test-ids[^/]*\.ts$/.test(file))
      for (const match of source.matchAll(/["']([a-z][a-z0-9]*(?:-[a-z0-9]+)+)["']/g))
        literals.add(match[1]);
    // 直接写成字符串的 testId 属性值，例如 testId: "x"、或 `${prefix}-json` 形式的后缀由 prefix 规则覆盖。
    for (const match of source.matchAll(/testid[^\n]{0,20}?["'`]([a-z][a-z0-9-]+)["'`]/gi))
      literals.add(match[1]);
  }
  return { literals, prefixes };
}

/** Test ids a driver source refers to (exact ids, and `prefix-${...}` templates as prefixes). */
export function driverIds(source) {
  const exact = new Set();
  const prefixes = new Set();
  const add = (id) => {
    if (id.includes("${")) prefixes.add(id.slice(0, id.indexOf("${")));
    else exact.add(id);
  };
  for (const match of source.matchAll(/getByTestId\(\s*["'`]([^"'`]+)["'`]/g)) add(match[1]);
  for (const match of source.matchAll(/selectValue\(\s*\w+\s*,\s*["'`]([^"'`]+)["'`]/g))
    add(match[1]);
  for (const match of source.matchAll(/\[data-testid(\^?)=\\?["']([^"'\]\\]+)\\?["']\]/g)) {
    if (match[1]) prefixes.add(match[2]);
    else add(match[2]);
  }
  return { exact, prefixes };
}

test("the restored drivers only use test ids that exist in the UI source", async () => {
  const { literals, prefixes: uiPrefixes } = await uiIds();
  const known = (id) =>
    !REMOVED.has(id) &&
    (literals.has(id) || [...uiPrefixes].some((prefix) => id.startsWith(prefix)));
  const stale = [];
  for (const driver of DRIVERS) {
    let source;
    try {
      source = await readFile(path.join(here, driver), "utf8");
    } catch {
      continue; // 尚未创建的辅助文件
    }
    const { exact, prefixes } = driverIds(source);
    for (const id of exact) if (!known(id)) stale.push(`${driver}: ${id}`);
    for (const prefix of prefixes)
      if (
        ![...literals].some((id) => id.startsWith(prefix)) &&
        ![...uiPrefixes].some((p) => p.startsWith(prefix) || prefix.startsWith(p))
      )
        stale.push(`${driver}: ${prefix}\${...}`);
  }
  assert.deepEqual(stale, [], "driver test ids that no longer exist in the UI");
});

test("the extraction understands the id forms the drivers use", () => {
  const { exact, prefixes } = driverIds(`
    window.getByTestId("a-b");
    window.getByTestId(\`graph-x-\${id}\`);
    selectValue(window, "sel-id", "1");
    window.locator('[data-testid="loc-id"]');
    window.locator('[data-testid^="prefix-"]');
  `);
  assert.deepEqual([...exact].sort(), ["a-b", "loc-id", "sel-id"]);
  assert.deepEqual([...prefixes].sort(), ["graph-x-", "prefix-"]);
});
