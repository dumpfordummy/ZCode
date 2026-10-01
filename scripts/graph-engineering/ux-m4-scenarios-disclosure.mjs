// UX-M4 disclosure pattern (real components, fixture Host): collapsed, expanded, keyboard toggle,
// visible focus, long titles, optional summary, both themes, English and Chinese UI-owned copy.
import assert from "node:assert/strict";
import { SIZES, assertClean, flush, setState } from "./ux-m1-helpers.mjs";
import { approvalWaitRun } from "./ux-m1-runs.mjs";
import { T, boot } from "./ux-m3-helpers.mjs";

const open = (page, id) => T(page, id).evaluate((node) => node.open);
const summaryOf = (page, id) => T(page, id).locator(":scope > summary");
const style = (page, id) =>
  summaryOf(page, id).evaluate((node) => {
    const s = getComputedStyle(node);
    return {
      display: s.display,
      list: s.listStyleType,
      height: node.getBoundingClientRect().height,
      border: s.borderLeftColor,
      background: s.backgroundColor,
    };
  });

const disclosure = {
  name: "disclosure pattern: collapsed, expanded, Enter/Space, focus, long title, summary line, both themes, English and Chinese",
  async run({ page, host, url }) {
    host.setRuns("A", [approvalWaitRun("run-approval")]);
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    await page.locator('[data-testid="graph-run"][data-run-id="run-approval"]').first().click();
    await T(page, "graph-run-summary").waitFor();
    for (const theme of ["zai-dark", "zai-light"]) {
      await setState(page, { theme });
      await flush(page);
      // collapsed: our own row, no browser triangle, a comfortable target, a secondary summary line
      assert.equal(await open(page, "graph-routing-iterations"), false);
      const rest = await style(page, "graph-routing-iterations");
      assert.equal(rest.display, "flex");
      assert.equal(rest.list, "none");
      assert.ok(rest.height >= 36, `row height ${rest.height}`);
      assert.match(
        await summaryOf(page, "graph-routing-iterations").innerText(),
        /iterations? recorded/,
      );
      // keyboard: Enter and Space toggle, focus stays on the summary
      await summaryOf(page, "graph-routing-iterations").focus();
      await page.keyboard.press("Enter");
      assert.equal(await open(page, "graph-routing-iterations"), true, `${theme}: Enter opens`);
      await page.keyboard.press("Space");
      assert.equal(await open(page, "graph-routing-iterations"), false, `${theme}: Space closes`);
      await page.keyboard.press("Space");
      assert.equal(await open(page, "graph-routing-iterations"), true);
      assert.equal(
        await page.evaluate(() => document.activeElement?.tagName),
        "SUMMARY",
        "focus stays on the toggle",
      );
      // visible focus: border and fill differ from the resting state
      const focused = await style(page, "graph-routing-iterations");
      assert.notEqual(focused.border, rest.border, `${theme}: focus border`);
      assert.notEqual(focused.background, rest.background, `${theme}: focus fill`);
      // expanded: aligned facts first, the raw record is a nested disclosure that stays closed
      const body = T(page, "graph-routing-iterations");
      assert.ok((await body.locator("dl dt").count()) >= 3, "known facts are label/value rows");
      assert.match(await body.innerText(), /Steps visited/);
      const raw = body.locator("details", { hasText: "Raw record (JSON)" });
      assert.equal(await raw.evaluate((node) => node.open), false);
      await raw.locator(":scope > summary").click();
      assert.match(await raw.locator("pre").innerText(), /"visitedNodeIds"/);
      await raw.locator(":scope > summary").click();
      await summaryOf(page, "graph-routing-iterations").click();
      assert.equal(await open(page, "graph-routing-iterations"), false, "a click closes it");
    }
    // a very long title wraps and never causes horizontal overflow
    await summaryOf(page, "graph-routing-iterations")
      .locator("span.font-medium")
      .evaluate((node) => {
        node.textContent = "LongTitle".repeat(40);
      });
    const overflow = await page.evaluate(() => {
      const view = document.querySelector("[data-view]");
      return view.scrollWidth - view.clientWidth;
    });
    assert.ok(overflow <= 1, `no horizontal overflow (${overflow})`);
    // Chinese: the UI-owned labels are localized
    await setState(page, { locale: "zh-CN" });
    await page.locator('[data-testid="graph-run"][data-run-id="run-approval"]').first().click();
    await T(page, "graph-run-summary").waitFor();
    await summaryOf(page, "graph-routing-iterations").click();
    const zh = await T(page, "graph-routing-iterations").innerText();
    assert.match(zh, /已访问的步骤/);
    assert.match(zh, /原始记录（JSON）/);
    assert.match(
      await summaryOf(page, "graph-routing-iterations").innerText(),
      /已记录 \d+ 轮迭代/,
    );
    assertClean(host);
  },
};

export const disclosureScenarios = [disclosure];
