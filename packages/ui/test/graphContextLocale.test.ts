import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
import { GRAPH_CONTEXT_MESSAGE_KEYS } from "../src/i18n/locales/graphContextPicker.js";

const source = (name: string) =>
  readFileSync(new URL(`../src/graph-engineering/${name}`, import.meta.url), "utf8");
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every context picker message exists in English and Simplified Chinese", () => {
  for (const key of GRAPH_CONTEXT_MESSAGE_KEYS) {
    const id = `graph.context.${key}`;
    assert.ok(enUS[id]?.trim(), `${id} missing in en-US`);
    assert.ok(zhCN[id]?.trim(), `${id} missing in zh-CN`);
    assert.notEqual(zhCN[id], enUS[id], `${id} is not translated`);
    assert.deepEqual(placeholders(zhCN[id]!), placeholders(enUS[id]!), `${id} placeholders differ`);
  }
});

test("the components only read message ids that exist (no typo'd keys)", () => {
  const files = ["GraphContextSection.tsx", "GraphContextPicker.tsx", "GraphContextChip.tsx"];
  const used = new Set<string>();
  for (const file of files)
    for (const match of source(file).matchAll(/\bt\(\s*"([A-Za-z]+)"/g)) used.add(match[1]!);
  // 状态文案是由 t(cond ? "a" : "b") 选出的，单独校验。
  for (const key of [
    "groupSkill",
    "groupInstruction",
    "groupFile",
    "searchSkills",
    "searchFiles",
    "announceRemovedRequired",
    "announceRemoved",
  ])
    used.add(key);
  assert.ok(used.size > 20, "the scan found the component keys");
  for (const key of used)
    assert.ok(
      GRAPH_CONTEXT_MESSAGE_KEYS.includes(key),
      `graph.context.${key} is used but not defined`,
    );
});

test("reused Host-status labels come from the existing graph.editor messages", () => {
  const reused = [
    "nativeInstructions",
    "explicitRead",
    "nativeSkill",
    "unavailable",
    "loading",
    "nativePicker",
    "advanced",
  ];
  for (const key of reused) {
    assert.ok(enUS[`graph.editor.${key}`], `graph.editor.${key} missing in en-US`);
    assert.ok(zhCN[`graph.editor.${key}`], `graph.editor.${key} missing in zh-CN`);
  }
  // 组件确实是通过 editor(...) 读取它们，而不是又造一套说法
  const text =
    source("GraphContextChip.tsx") +
    source("GraphContextPicker.tsx") +
    source("GraphContextSection.tsx");
  for (const key of reused)
    assert.ok(text.includes(`"${key}"`), `${key} is read via the editor text`);
});

test("no message claims a reference is inherited", () => {
  for (const [id, text] of Object.entries(enUS))
    if (id.startsWith("graph.context.")) assert.doesNotMatch(text, /inherit/i, id);
  for (const [id, text] of Object.entries(zhCN))
    if (id.startsWith("graph.context.")) assert.doesNotMatch(text, /继承/, id);
});
