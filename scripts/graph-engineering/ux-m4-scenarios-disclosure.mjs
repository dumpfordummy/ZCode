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
    await T(page, "graph-run-tab-technical").click();
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
      // expanded: aligned facts; the raw record remains a separate collapsed disclosure
      const body = T(page, "graph-routing-iterations");
      assert.ok((await body.locator("dl dt").count()) >= 3, "known facts are label/value rows");
      assert.match(await body.innerText(), /Steps visited/);
      const raw = T(page, "graph-routing-iterations-raw");
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
    await T(page, "graph-run-tab-technical").click();
    await summaryOf(page, "graph-routing-iterations").click();
    const zh = await T(page, "graph-routing-iterations").innerText();
    assert.match(zh, /已访问的步骤/);
    assert.match(await T(page, "graph-routing-iterations-raw").innerText(), /原始记录（JSON）/);
    assert.match(
      await summaryOf(page, "graph-routing-iterations").innerText(),
      /已记录 \d+ 轮迭代/,
    );
    assertClean(host);
  },
};

// 冻结来源：披露区头部拥有标题，嵌入的内容不再重复同一标题；独立渲染（预检）不变
const provenanceRun = () => {
  const run = approvalWaitRun("run-prov");
  run.provenance = {
    digest: "d".repeat(64),
    unknowns: [],
    template: {
      id: "generic",
      name: "Sequential engineering",
      version: 2,
      digest: "a".repeat(64),
      excluded: [],
      parameters: {},
    },
    environment: {
      status: "available",
      configDigest: "c".repeat(64),
      executables: [],
      hooks: [],
      instructions: [],
      mcp: [],
      plugins: [],
      skills: [],
    },
    auxiliary: [],
    models: [],
    permissions: [],
    recipes: [],
    references: [],
  };
  return run;
};
const provenance = {
  name: "frozen provenance: the disclosure header owns the title once; the content is unchanged",
  async run({ page, host, url }) {
    host.setRuns("A", [provenanceRun()]);
    await boot(page, host, url);
    await page.locator('[data-testid="graph-run"][data-run-id="run-prov"]').first().click();
    await T(page, "graph-run-summary").waitFor();
    const box = T(page, "graph-frozen-provenance");
    await box.locator(":scope > summary").click();
    const titled = box.getByText("Frozen workflow provenance", { exact: true });
    assert.equal(await titled.count(), 1, "the title appears once");
    assert.equal(
      await box.locator(":scope > summary").getByText("Frozen workflow provenance").count(),
      1,
    );
    const content = T(page, "graph-workflow-provenance");
    assert.equal(await content.locator("h3").count(), 0, "no inner heading when embedded");
    // the content itself is intact: template name, version, identities and digest
    const text = await content.innerText();
    assert.match(text, /Sequential engineering · Version 2/);
    assert.ok(text.includes("a".repeat(64)), "the template digest is shown");
    assertClean(host);
  },
};

export const disclosureScenarios = [disclosure, provenance];
