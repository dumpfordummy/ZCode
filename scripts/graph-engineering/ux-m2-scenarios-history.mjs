// UX-M2.1 browser scenarios: newest-first history, reveal on explicit navigation, refreshes that
// move nothing, Newer/Older wording and app-locale timestamps. Run records are the UI tests'
// summaryRun() variants (FIXTURE, unit-only captured records), appended in creation order like the
// real Host.
import assert from "node:assert/strict";
import {
  T,
  assertClean,
  boot,
  flush,
  focused,
  preparedDraft,
  setState,
  started,
  until,
} from "./ux-m1-helpers.mjs";
import { completedRun, permissionWaitRun } from "./ux-m1-runs.mjs";

const BASE = Date.UTC(2026, 8, 30, 8, 0, 0);
/** `count` settled runs in creation (append) order, one minute apart: run-0 is the oldest. */
const history = (count) =>
  Array.from({ length: count }, (_, index) => {
    const run = completedRun(`run-${index}`);
    run.createdAt = BASE + index * 60_000;
    run.updatedAt = run.createdAt;
    return run;
  });
const listed = (page) =>
  page
    .locator('[data-testid="graph-run"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-run-id")));
const range = (page) => T(page, "graph-history-range").innerText();
const row = (page, id) => page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`);
const focusedRun = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute("data-run-id") ?? null);

const order = {
  name: "history is newest first by creation order: page 1 holds the newest runs; Newer/Older match the order in English and Chinese",
  async run({ page, host, url }) {
    const runs = history(27);
    // 进度更新时间不参与排序：最早的运行刚刚有进度，仍排在最后。
    runs[0].updatedAt = BASE + 10 * 86_400_000;
    // 创建时间相同（并列）或时钟回拨，都保持追加顺序。
    runs[25].createdAt = runs[26].createdAt;
    host.setRuns("A", runs);
    await boot(page, host, url);
    const first = await listed(page);
    assert.equal(first.length, 25);
    assert.deepEqual(first.slice(0, 3), ["run-26", "run-25", "run-24"]);
    assert.equal(first.at(-1), "run-2");
    assert.match(await range(page), /1–25 of 27 runs · Page 1 of 2/);
    assert.equal(await T(page, "graph-history-previous").innerText(), "Newer runs");
    assert.equal(await T(page, "graph-history-next").innerText(), "Older runs");
    assert.equal(await T(page, "graph-history-previous").isDisabled(), true, "no newer page");
    await T(page, "graph-history-next").click();
    assert.deepEqual(await listed(page), ["run-1", "run-0"]);
    assert.equal(await T(page, "graph-history-next").isDisabled(), true, "no older page");
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-history-next").waitFor();
    assert.equal(await T(page, "graph-history-previous").innerText(), "较新的运行");
    assert.equal(await T(page, "graph-history-next").innerText(), "较早的运行");
    assertClean(host);
  },
};

const startReveals = {
  name: "Start with more than one page of history, while an older page is shown, opens the admitted run on page 1, selected and visible",
  async run({ page, host, url }) {
    host.setRuns("A", history(26));
    await preparedDraft(page, host, url);
    await T(page, "graph-history-next").click();
    assert.deepEqual(await listed(page), ["run-0"], "the user is browsing the older page");
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    await T(page, "graph-preflight-ack").click();
    await T(page, "graph-confirm-run").click();
    await until(() => started(host, "graph.run").length === 1, "explicit Start");
    await T(page, "graph-run-summary").waitFor();
    const admitted = await T(page, "graph-run-summary").getAttribute("data-run-id");
    assert.equal(host.graph.A.runs.at(-1).id, admitted, "the fixture Host appended the run");
    await until(async () => (await listed(page))[0] === admitted, "the admitted run is on top");
    assert.equal(await row(page, admitted).getAttribute("aria-current"), "true");
    assert.match(await range(page), /Page 1 of 2/);
    assertClean(host);
  },
};

const navigationReveals = {
  name: "Go to run and View current run reveal the run's page, also when it was already selected and the user browsed away",
  async run({ page, host, url }) {
    host.setRuns("A", [...history(26), permissionWaitRun("run-wait")]);
    await boot(page, host, url);
    // View current run（新建运行窗格）：先翻到较早的一页
    await T(page, "graph-history-next").click();
    assert.equal(await row(page, "run-wait").count(), 0);
    await T(page, "graph-view-current-run").click();
    await T(page, "graph-run-summary").waitFor();
    await until(async () => (await row(page, "run-wait").count()) === 1, "page 1 revealed");
    assert.equal(await row(page, "run-wait").getAttribute("aria-current"), "true");
    // 已选中的运行：翻走后再 Go to run，仍然翻回来
    await T(page, "graph-history-next").click();
    assert.equal(await row(page, "run-wait").count(), 0, "browsed away from the selected run");
    assert.equal(
      await T(page, "graph-run-summary").getAttribute("data-run-id"),
      "run-wait",
      "browsing does not change the selection",
    );
    await T(page, "graph-needs-you-go").focus();
    await page.keyboard.press("Enter");
    await until(async () => (await row(page, "run-wait").count()) === 1, "revealed again");
    await until(async () => (await focused(page)) === "graph-run-summary", "focus as in UX-M1");
    assertClean(host);
  },
};

const refreshMovesNothing = {
  name: "a Host event, a status change and a newer run arriving leave the page, the selected run and keyboard focus where they were",
  async run({ page, host, url }) {
    const runs = history(27);
    host.setRuns("A", runs);
    await boot(page, host, url);
    await T(page, "graph-history-next").click();
    await row(page, "run-0").focus();
    await page.keyboard.press("Enter");
    await until(
      async () => (await T(page, "graph-run-summary").getAttribute("data-run-id")) === "run-0",
      "run-0 selected with the keyboard",
    );
    assert.equal(await focusedRun(page), "run-0", "the row keeps focus (UX-M1)");
    const before = { range: await range(page) };
    // Host 事件：同样的运行、状态变化
    const changed = structuredClone(runs);
    changed[5].updatedAt += 1;
    host.setRuns("A", changed);
    await until(
      () => host.calls.filter((c) => c.op === "graph.getWorkspace").length >= 2,
      "reload",
    );
    await flush(page);
    assert.equal(await range(page), before.range, "page unchanged by a refresh");
    assert.equal(await focusedRun(page), "run-0", "focus unchanged by a refresh");
    // 更新的运行到达：接受的一行偏移（本页仍是第 2 页）；选择与焦点按运行身份保留
    const reads = host.calls.filter((c) => c.op === "graph.getWorkspace").length;
    const newer = completedRun("run-27");
    newer.createdAt = BASE + 27 * 60_000;
    host.setRuns("A", [...changed, newer]);
    await until(
      () => host.calls.filter((c) => c.op === "graph.getWorkspace").length > reads,
      "second reload",
    );
    await until(async () => /of 28 runs/.test(await range(page)), "the newer run is projected");
    assert.match(await range(page), /26–28 of 28 runs · Page 2 of 2/, "still the older page");
    assert.deepEqual(await listed(page), ["run-2", "run-1", "run-0"], "rows shifted by one");
    assert.equal(await row(page, "run-0").getAttribute("aria-current"), "true");
    assert.equal(await focusedRun(page), "run-0", "focus kept by run identity");
    assert.equal(
      await T(page, "graph-run-summary").getAttribute("data-run-id"),
      "run-0",
      "selection unchanged",
    );
    // 浏览不含所选运行的页时再来一次 Host 事件：页不会被拉回所选运行那一页。
    await T(page, "graph-history-previous").click();
    assert.equal(await row(page, "run-0").count(), 0, "browsing the newer page");
    const readsBefore = host.calls.filter((c) => c.op === "graph.getWorkspace").length;
    host.setRuns("A", [...changed, newer]);
    await until(
      () => host.calls.filter((c) => c.op === "graph.getWorkspace").length > readsBefore,
      "third reload",
    );
    await flush(page);
    assert.match(await range(page), /Page 1 of 2/, "a refresh does not jump to the selection");
    assert.equal(await row(page, "run-0").count(), 0);
    assert.equal(await T(page, "graph-run-summary").getAttribute("data-run-id"), "run-0");
    assertClean(host);
  },
};

const timestamps = {
  name: "history timestamps use the app locale, and a run without a valid time says so instead of inventing a date",
  async run({ page, host, url }) {
    const runs = history(2);
    runs[0].createdAt = Number.NaN;
    host.setRuns("A", runs);
    await boot(page, host, url);
    const text = async (id) => (await row(page, id).innerText()).replace(/\s+/g, " ");
    const en = await text("run-1");
    assert.ok(en.includes(new Date(runs[1].createdAt).toLocaleString("en-US")), en);
    assert.match(await text("run-0"), /Time not recorded/);
    assert.doesNotMatch(await text("run-0"), /Invalid Date|1970/);
    await setState(page, { locale: "zh-CN" });
    await row(page, "run-1").waitFor();
    const zh = await text("run-1");
    assert.ok(zh.includes(new Date(runs[1].createdAt).toLocaleString("zh-CN")), zh);
    assert.notEqual(zh, en);
    assert.match(await text("run-0"), /未记录时间/);
    assert.equal(host.graph.A.runs[1].createdAt, runs[1].createdAt, "stored value untouched");
    assertClean(host);
  },
};

export const historyScenarios = [
  order,
  startReveals,
  navigationReveals,
  refreshMovesNothing,
  timestamps,
];
