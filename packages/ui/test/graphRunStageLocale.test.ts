import assert from "node:assert/strict";
import test from "node:test";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";
import { graphHumanKey, graphRunStage } from "../src/graph-engineering/graphRunStage.js";
import { graphRunSummary } from "../src/graph-engineering/graphRunSummary.js";
import { summaryRun } from "./graphRunSummary.fixture.js";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Every key `graphRunStage.ts` can ask the run text for, plus the UX-P2 evidence-check copy. */
const keys = [
  "stage.running-task",
  "stage.running-tool",
  "nothingNeeded",
  "human.unconfirmed",
  "evidenceChecks",
  "testCounts",
];

test("every UX-P2 run message exists in English and Simplified Chinese with matching placeholders", () => {
  for (const key of keys) {
    const id = `graph.run.${key}`;
    assert.ok(enUS[id]?.trim(), `${id} missing in en-US`);
    assert.ok(zhCN[id]?.trim(), `${id} missing in zh-CN`);
    assert.notEqual(zhCN[id], enUS[id], `${id} is not translated`);
    assert.deepEqual(placeholders(zhCN[id]!), placeholders(enUS[id]!), `${id} placeholders differ`);
  }
});

test("the labels the helper selects are defined messages", () => {
  const summary = graphRunSummary(summaryRun());
  assert.ok(enUS[`graph.run.${graphHumanKey(summary)}`], "a human label exists for the summary");
  const stage = graphRunStage(summary);
  if (stage.kind !== "none") assert.ok(enUS[`graph.run.stage.${stage.kind}`]);
});

test("the unconfirmed-outcome label never claims an approval record is incomplete", () => {
  assert.doesNotMatch(enUS["graph.run.human.unconfirmed"]!, /approval|record|incomplete/i);
  assert.match(enUS["graph.run.human.unconfirmed"]!, /unconfirmed/i);
  // The original wording remains for a genuinely unresolved approval record.
  assert.match(enUS["graph.run.human.unknown"]!, /approval record is incomplete or unresolved/);
});

test("the saved-checks status keeps a count placeholder and states no run claim it cannot back", () => {
  assert.deepEqual(placeholders(enUS["graph.preZ8.checksLoaded"]!), ["count"]);
  assert.deepEqual(placeholders(zhCN["graph.preZ8.checksLoaded"]!), ["count"]);
  assert.doesNotMatch(enUS["graph.preZ8.checksLoaded"]!, /ran|passed|verified/i);
});
