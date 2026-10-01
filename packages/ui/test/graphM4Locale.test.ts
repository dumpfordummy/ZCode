import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
import { GRAPH_M4_MESSAGE_KEYS } from "../src/i18n/locales/graphM4.js";

const dir = new URL("../src/graph-engineering/", import.meta.url);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every UX-M4 message exists in English and Simplified Chinese with matching placeholders", () => {
  assert.ok(GRAPH_M4_MESSAGE_KEYS.length > 0);
  for (const key of GRAPH_M4_MESSAGE_KEYS) {
    const id = `graph.m4.${key}`;
    assert.ok(enUS[id]?.trim(), `${id} missing in en-US`);
    assert.ok(zhCN[id]?.trim(), `${id} missing in zh-CN`);
    assert.notEqual(zhCN[id], enUS[id], `${id} is not translated`);
    assert.deepEqual(placeholders(zhCN[id]!), placeholders(enUS[id]!), `${id} placeholders differ`);
  }
});

test("the graph-engineering components only read UX-M4 message ids that are defined", () => {
  const used = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => /\.tsx?$/.test(name))) {
    const source = readFileSync(new URL(file, dir), "utf8");
    for (const match of source.matchAll(/\bm4\(\s*"([A-Za-z.]+)"/g)) used.add(match[1]!);
    for (const match of source.matchAll(/"graph\.m4\.([A-Za-z.]+)"/g)) used.add(match[1]!);
  }
  assert.ok(used.size >= 4, "the scan found UX-M4 keys in the components");
  for (const key of used)
    assert.ok(GRAPH_M4_MESSAGE_KEYS.includes(key), `graph.m4.${key} is used but not defined`);
});
