// UX-M2.1 native acceptance: history over REAL runs (27 real native Graph runs on the loopback
// provider, each stopped with the real Cancel control except the last). Windows English UI,
// then the same profile in Simplified Chinese to check that Graph timestamps follow the app locale.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { reviewerNativeResponse } from "./reviewer-native-responses.mjs";
import {
  T,
  cancelRun,
  finishReceipt,
  flush,
  launchUx,
  observe,
  pageIds,
  pendingPermission,
  rangeText,
  readGraphRecord,
  selectedRunId,
  shot,
  snapshot,
  startFromNewRun,
  step,
  waitRecord,
  waitUntil,
} from "./ux-m2-native-common.mjs";

/** A responder that can hold one model reply, so the test can browse before a real Host event. */
function gatedResponder() {
  let release;
  let armed = false;
  let waiting;
  return {
    respond: async (context) => {
      if (armed) {
        armed = false;
        await new Promise((resolve) => {
          release = resolve;
          waiting?.();
        });
      }
      return reviewerNativeResponse(context);
    },
    arm: () => {
      armed = true;
    },
    release: () => release?.(),
    held: () => new Promise((resolve) => (waiting = resolve)),
  };
}

const inViewport = (window, selector) =>
  window.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0;
  });
const focusedRow = (window) =>
  window.evaluate(() => {
    const element = document.activeElement;
    return element?.getAttribute("data-testid") === "graph-run"
      ? element.getAttribute("data-run-id")
      : (element?.getAttribute("data-testid") ?? element?.tagName);
  });
const summaryRunId = (window) => T(window, "graph-run-summary").getAttribute("data-run-id");
export async function historyJourney() {
  const gate = gatedResponder();
  const { isolation, receipt, ...launched } = await launchUx("history", {
    scenario: "pass",
    responder: gate.respond,
  });
  let window = launched.window;
  const ids = [];
  let pendingId;
  let error;
  try {
    await step(
      receipt,
      "H0",
      "Create 26 real runs (each started, then stopped with Cancel)",
      async () => {
        for (let count = 0; count < 26; count += 1) {
          const run = await startFromNewRun(isolation, window);
          ids.push(run.id);
          await cancelRun(isolation, window, run.id);
        }
        const record = await readGraphRecord(isolation);
        assert.equal(record.runs.length, 26);
        assert.deepEqual(
          record.runs.map((run) => run.id),
          ids,
          "the Host appended in creation order",
        );
        assert.ok(record.runs.every((run) => ["Cancelled", "Interrupted"].includes(run.status)));
        observe(receipt, "createdAt / updatedAt are both non-decreasing in append order", {
          created: record.runs.every(
            (run, index, all) => !index || run.createdAt >= all[index - 1].createdAt,
          ),
          updated: record.runs.every(
            (run, index, all) => !index || run.updatedAt >= all[index - 1].updatedAt,
          ),
        });
      },
    );

    await step(
      receipt,
      "H1",
      "Page 1 holds the newest 25, newest first; Newer/Older go the right way",
      async () => {
        await T(window, "graph-new-run").click();
        const newestFirst = [...ids].reverse();
        assert.deepEqual(await pageIds(window), newestFirst.slice(0, 25));
        assert.equal(await T(window, "graph-history-previous").innerText(), "Newer runs");
        assert.equal(await T(window, "graph-history-next").innerText(), "Older runs");
        assert.equal(await T(window, "graph-history-previous").isDisabled(), true);
        assert.equal(await T(window, "graph-history-next").isDisabled(), false);
        assert.match(await rangeText(window), /1.25 of 26 runs.*Page 1 of 2/);
        await shot(isolation, window, receipt, "h-page1-newest-first", [1280, 720]);
        await T(window, "graph-history-next").click();
        assert.deepEqual(await pageIds(window), [ids[0]], "the oldest run is on the last page");
        assert.equal(await T(window, "graph-history-next").isDisabled(), true);
        assert.equal(await T(window, "graph-history-previous").isDisabled(), false);
        assert.match(await rangeText(window), /26.26 of 26 runs.*Page 2 of 2/);
        await shot(isolation, window, receipt, "h-page2-oldest", [1280, 720]);
        await T(window, "graph-history-previous").click();
        assert.deepEqual(await pageIds(window), newestFirst.slice(0, 25));
      },
    );

    await step(
      receipt,
      "H2",
      "Browse to an older page, then Start: the new run is on page 1, selected and visible",
      async () => {
        await T(window, "graph-history-next").click();
        assert.deepEqual(await pageIds(window), [ids[0]]);
        // Start 从 New run 开始；用户此刻停在较早的一页（New run 面板里的历史就是同一个组件）。
        const run = await startFromNewRun(isolation, window);
        pendingId = run.id;
        const newestFirst = [run.id, ...[...ids].reverse()];
        await waitUntil(
          window,
          (id) =>
            document
              .querySelector('[data-testid="graph-run"][aria-current="true"]')
              ?.getAttribute("data-run-id") === id,
          run.id,
          "the started run to be selected on the shown page",
        );
        assert.deepEqual(
          await pageIds(window),
          newestFirst.slice(0, 25),
          "page 1 with the new run on top",
        );
        assert.deepEqual(await selectedRunId(window), [run.id]);
        assert.equal(await summaryRunId(window), run.id);
        assert.equal(
          await inViewport(window, `[data-testid="graph-run"][data-run-id="${run.id}"]`),
          true,
          "the new row is visible",
        );
        assert.match(await rangeText(window), /1.25 of 27 runs.*Page 1 of 2/);
        await shot(isolation, window, receipt, "h-after-start-page1", [1280, 720]);
      },
    );

    await step(
      receipt,
      "H3",
      "The run waits for a real native permission (Needs-you finds it off the shown page)",
      async () => {
        await waitRecord(isolation, pendingPermission, "the first native permission");
        await T(window, "graph-new-run").click();
        await T(window, "graph-history-next").click();
        assert.deepEqual(
          await pageIds(window),
          ids.slice(0, 2).reverse(),
          "page 2 holds the two oldest",
        );
        await T(window, "graph-needs-you").waitFor();
        assert.equal(await T(window, "graph-needs-you").getAttribute("data-run-id"), pendingId);
        assert.equal(
          await window.locator(`[data-testid="graph-run"][data-run-id="${pendingId}"]`).count(),
          0,
        );
        await shot(isolation, window, receipt, "h-needs-you-off-page", [1280, 720]);
      },
    );

    await step(receipt, "H4", "Go to run reveals the page of the run", async () => {
      await T(window, "graph-needs-you-go").click();
      await T(window, "graph-run-summary").waitFor();
      assert.equal(await summaryRunId(window), pendingId);
      assert.deepEqual(await selectedRunId(window), [pendingId]);
      assert.equal(
        await inViewport(window, `[data-testid="graph-run"][data-run-id="${pendingId}"]`),
        true,
      );
      assert.match(await rangeText(window), /Page 1 of 2/);
    });

    await step(
      receipt,
      "H5",
      "View current run reveals the page of the run (browsed away from an already selected run)",
      async () => {
        await T(window, "graph-new-run").click();
        await T(window, "graph-history-next").click();
        assert.equal(
          await window.locator(`[data-testid="graph-run"][data-run-id="${pendingId}"]`).count(),
          0,
        );
        await T(window, "graph-view-current-run").click();
        await T(window, "graph-run-summary").waitFor();
        assert.equal(await summaryRunId(window), pendingId);
        assert.deepEqual(await selectedRunId(window), [pendingId]);
        assert.match(await rangeText(window), /Page 1 of 2/);
      },
    );

    await step(
      receipt,
      "H6",
      "Back to run (native conversation) returns to the run, its page shown, permission unanswered",
      async () => {
        const before = await snapshot(isolation);
        await T(window, "graph-new-run").click();
        await T(window, "graph-history-next").click();
        await T(window, "graph-needs-you-conversation").click();
        await window
          .getByRole("option", { name: "Allow", exact: true })
          .waitFor({ timeout: 30000 });
        await T(window, "graph-back-to-run").click();
        await T(window, "graph-run-summary").waitFor();
        assert.equal(await summaryRunId(window), pendingId);
        assert.deepEqual(await selectedRunId(window), [pendingId]);
        assert.match(await rangeText(window), /Page 1 of 2/);
        const after = await snapshot(isolation);
        assert.equal(after.recordDigest, before.recordDigest, "answering nothing changed nothing");
        observe(
          receipt,
          "the Graph panel remounts when the conversation opens, so this asserts the final page state only",
        );
      },
    );

    await step(
      receipt,
      "H7",
      "A real Host progress event while browsing an older page moves neither page, selection nor focus",
      async () => {
        const held = gate.held();
        gate.arm();
        await T(window, "graph-new-run").click();
        await T(window, "graph-needs-you-conversation").click();
        await approveNativePermissionOnce(window);
        await held; // 下一次模型请求已被暂扣：Host 此刻没有进展
        await T(window, "graph-back-to-run").click();
        await T(window, "graph-run-summary").waitFor();
        // 权限已回答、下一次模型请求被暂扣：Host 不再有待处理项，运行处于 Running。
        await waitRecord(
          isolation,
          (record) => !pendingPermission(record),
          "the permission to be answered",
        );
        await T(window, "graph-history-next").click();
        const oldest = window.locator(`[data-testid="graph-run"][data-run-id="${ids[0]}"]`);
        await oldest.focus();
        const before = {
          range: await rangeText(window),
          ids: await pageIds(window),
          focus: await focusedRow(window),
          summary: await T(window, "graph-run-summary").innerText(),
          digest: (await snapshot(isolation)).recordDigest,
        };
        assert.equal(before.focus, ids[0]);
        assert.match(before.range, /Page 2 of 2/);
        assert.equal(await summaryRunId(window), pendingId);
        gate.release();
        // Host 事件真的到达渲染进程：运行详情随之改变（回到等待权限）。
        await waitUntil(
          window,
          (text) => document.querySelector('[data-testid="graph-run-summary"]')?.innerText !== text,
          before.summary,
          "the Host event to reach the run detail",
          90000,
        );
        await flush(window);
        assert.notEqual(
          (await snapshot(isolation)).recordDigest,
          before.digest,
          "the Host record changed",
        );
        assert.equal(await rangeText(window), before.range, "page unchanged");
        assert.deepEqual(await pageIds(window), before.ids, "rows unchanged");
        assert.equal(await focusedRow(window), before.focus, "keyboard focus unchanged");
        assert.equal(await summaryRunId(window), pendingId, "selected run unchanged");
        assert.deepEqual(
          await selectedRunId(window),
          [],
          "the selected run is not on the shown page",
        );
        await shot(isolation, window, receipt, "h-host-event-older-page", [1280, 720]);
        observe(receipt, "run detail changed from/to", [
          before.summary.replace(/\s+/g, " ").slice(0, 120),
          (await T(window, "graph-run-summary").innerText()).replace(/\s+/g, " ").slice(0, 120),
        ]);
      },
    );

    await step(receipt, "H8", "Stop the last run (cleanup)", async () => {
      await cancelRun(isolation, window, pendingId);
      const record = await readGraphRecord(isolation);
      assert.equal(record.runs.length, 27);
      observe(
        receipt,
        "27 real runs, creation order",
        record.runs.map((run) => [run.id, run.createdAt, run.updatedAt, run.status]),
      );
    });

    let stored;
    await step(
      receipt,
      "H9",
      "Reopen the same profile in Simplified Chinese with Windows in English: times follow the app locale",
      async () => {
        stored = (await readGraphRecord(isolation)).runs.map((run) => [
          run.id,
          run.createdAt,
          run.updatedAt,
        ]);
        await isolation.stopApp();
        const settingPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
        const setting = JSON.parse(await readFile(settingPath, "utf8"));
        await writeFile(settingPath, JSON.stringify({ ...setting, localePreference: "zh-CN" }));
        window = await isolation.launch({
          bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
        });
        await T(window, "graph-engineering-open").click();
        await T(window, "graph-view-runs").click();
        await T(window, "graph-run-history").waitFor();
        const os = await window.evaluate(() => ({
          navigatorLanguage: navigator.language,
          resolved: Intl.DateTimeFormat().resolvedOptions().locale,
          htmlLang: document.documentElement.lang,
        }));
        observe(receipt, "renderer OS locale versus app locale", os);
        const persisted = (await readGraphRecord(isolation)).runs;
        const rows = await window
          .locator('[data-testid="graph-run"]')
          .evaluateAll((items) =>
            items.map((item) => ({ id: item.getAttribute("data-run-id"), text: item.innerText })),
          );
        const format = (value, locale) =>
          window.evaluate(([v, l]) => new Date(v).toLocaleString(l), [value, locale]);
        let differs = 0;
        for (const row of rows) {
          const created = persisted.find((run) => run.id === row.id).createdAt;
          const zh = await format(created, "zh-CN");
          const en = await format(created, "en-US");
          assert.ok(row.text.includes(zh), `row ${row.id} shows the zh-CN time ${zh}`);
          if (zh !== en) differs += 1;
        }
        assert.ok(
          differs > 0,
          "the zh-CN and en-US renderings of these times differ, so the check is meaningful",
        );
        assert.match(await rangeText(window), /共 27|27/);
        observe(
          receipt,
          `zh-CN row time sample: ${rows[0].text.replace(/\s+/g, " ").slice(0, 160)}`,
        );
        assert.deepEqual(
          (await readGraphRecord(isolation)).runs.map((run) => [
            run.id,
            run.createdAt,
            run.updatedAt,
          ]),
          stored,
          "stored timestamps are unchanged by the language change",
        );
        await shot(isolation, window, receipt, "h-zh-times", [1280, 720]);
        // 捕获的 ISO 出处保持 ISO-8601 UTC 原文，不随应用语言变化
        await window
          .locator(`[data-testid="graph-run"][data-run-id="${ids[0]}"]`)
          .click()
          .catch(async () => {
            await T(window, "graph-history-next").click();
            await window.locator(`[data-testid="graph-run"][data-run-id="${ids[0]}"]`).click();
          });
        const acceptedAt = persisted.find((run) => run.id === ids[0]).provenance.operationalDecision
          .acceptedAt;
        const decision = T(window, "graph-operational-decision");
        await decision.waitFor({ state: "attached" });
        // 出处位于折叠的 <details> 内：像用户一样先展开，再读可见文字。
        await decision.evaluate((element) => {
          for (
            let node = element.closest("details");
            node;
            node = node.parentElement?.closest("details")
          )
            node.open = true;
        });
        assert.ok(
          (await decision.innerText()).includes(new Date(acceptedAt).toISOString()),
          "captured ISO provenance unchanged",
        );
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
