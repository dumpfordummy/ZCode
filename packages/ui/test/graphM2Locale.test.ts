import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
import { GRAPH_M2_MESSAGE_KEYS } from "../src/i18n/locales/graphM2.js";

const dir = new URL("../src/graph-engineering/", import.meta.url);
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every UX-M2 message exists in English and Simplified Chinese with matching placeholders", () => {
  assert.ok(GRAPH_M2_MESSAGE_KEYS.length > 0);
  for (const key of GRAPH_M2_MESSAGE_KEYS) {
    const id = `graph.m2.${key}`;
    assert.ok(enUS[id]?.trim(), `${id} missing in en-US`);
    assert.ok(zhCN[id]?.trim(), `${id} missing in zh-CN`);
    assert.notEqual(zhCN[id], enUS[id], `${id} is not translated`);
    assert.deepEqual(placeholders(zhCN[id]!), placeholders(enUS[id]!), `${id} placeholders differ`);
  }
});

test("the graph-engineering components only read UX-M2 message ids that are defined", () => {
  const used = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => /\.tsx?$/.test(name))) {
    const source = readFileSync(new URL(file, dir), "utf8");
    for (const match of source.matchAll(/\bm2\(\s*"([A-Za-z]+)"/g)) used.add(match[1]!);
    for (const match of source.matchAll(/"graph\.m2\.([A-Za-z]+)"/g)) used.add(match[1]!);
  }
  // 由条件或模板字符串选出的键，扫描不到字面量，单独校验。
  for (const key of [
    "rowNew",
    "rowUnsaved",
    "selectedModified",
    "selectedRemoved",
    "newRunUnsaved",
    "newRunUnsavedUnlisted",
    "changeAdded",
    "changeModified",
    "changeRemoved",
    "unsummarizable.invalid-json",
    "unsummarizable.missing-id",
    "unsummarizable.duplicate-id",
  ])
    used.add(key);
  assert.ok(used.size >= 3, "the scan found UX-M2 keys in the components");
  for (const key of used)
    assert.ok(GRAPH_M2_MESSAGE_KEYS.includes(key), `graph.m2.${key} is used but not defined`);
});
