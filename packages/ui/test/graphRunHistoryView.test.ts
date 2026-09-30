import assert from "node:assert/strict";
import test from "node:test";
import {
  graphHistoryPage,
  graphRunsNewestFirst,
} from "../src/graph-engineering/graphRunHistoryView.js";
import { graphIsoTimestamp, graphTimestamp } from "../src/graph-engineering/graphTimestamp.js";

type Row = { id: string; createdAt: number; updatedAt: number };
// Host 追加顺序即创建顺序：索引越大越新。
const appended = (count: number, time: (index: number) => number = (i) => 1_700_000_000_000 + i) =>
  Array.from(
    { length: count },
    (_, index): Row => ({ id: `run-${index}`, createdAt: time(index), updatedAt: time(index) }),
  );
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

test("newest first is the reverse of the Host's append order and never mutates the projection", () => {
  const runs = deepFreeze(appended(3));
  const before = JSON.stringify(runs);
  assert.deepEqual(
    graphRunsNewestFirst(runs).map((run) => run.id),
    ["run-2", "run-1", "run-0"],
  );
  assert.equal(JSON.stringify(runs), before, "the frozen Host array is untouched");
  assert.notEqual(graphRunsNewestFirst(runs), runs, "a new array is returned");
});

test("ties, a clock that went backwards and later progress never reorder rows", () => {
  const tie = appended(4, () => 1_700_000_000_000);
  assert.deepEqual(
    graphRunsNewestFirst(tie).map((run) => run.id),
    ["run-3", "run-2", "run-1", "run-0"],
    "identical createdAt keeps append order (reversed), deterministically",
  );
  const skewed = appended(3, (i) => [3_000, 1_000, 2_000][i]!);
  assert.deepEqual(
    graphRunsNewestFirst(skewed).map((run) => run.id),
    ["run-2", "run-1", "run-0"],
    "createdAt is not a sort key",
  );
  const progressed = appended(3);
  progressed[0]!.updatedAt = 9_999_999_999_999;
  assert.equal(graphRunsNewestFirst(progressed)[0]!.id, "run-2", "updatedAt is not a sort key");
  assert.deepEqual(graphRunsNewestFirst([]), []);
});

test("paging over the newest-first order: page 1 is the newest; the selected run's page is found; pages clamp", () => {
  const ordered = graphRunsNewestFirst(appended(27));
  const first = graphHistoryPage(ordered, 0, "run-26");
  assert.equal(first.items[0]!.id, "run-26");
  assert.equal(first.items.length, 25);
  assert.equal(first.pages, 2);
  assert.equal(first.selectedPage, 0, "the newest run is on page 1");
  const older = graphHistoryPage(ordered, 1, "run-26");
  assert.deepEqual(
    older.items.map((run) => run.id),
    ["run-1", "run-0"],
  );
  assert.equal(older.selectedPage, 0, "the selected run's page is still known from another page");
  assert.equal(graphHistoryPage(ordered, 9).page, 1, "an out-of-range page is clamped");
  assert.equal(graphHistoryPage(ordered, Number.NaN).page, 0);
  assert.equal(graphHistoryPage([], 3).pages, 1);
});

test("timestamps follow the app locale; invalid or missing values are never shown as a date", () => {
  const value = Date.UTC(2026, 8, 30, 12, 34, 56);
  const en = graphTimestamp(value, "en-US");
  const zh = graphTimestamp(value, "zh-CN");
  assert.ok(en && zh);
  assert.notEqual(en, zh, "the same instant renders differently in English and Chinese");
  assert.equal(en, new Date(value).toLocaleString("en-US"), "viewer time zone kept, as before");
  for (const invalid of [undefined, null, Number.NaN, Infinity, 0, -1, "2026-09-30", 8.65e15 + 1])
    assert.equal(graphTimestamp(invalid, "en-US"), undefined, `${String(invalid)} is not a time`);
  assert.equal(graphIsoTimestamp(value), "2026-09-30T12:34:56.000Z", "captured ISO text is exact");
  assert.equal(graphIsoTimestamp(Number.NaN), undefined, "no RangeError, no invented date");
});
