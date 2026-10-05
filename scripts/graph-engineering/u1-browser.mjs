// Real Runs components in the existing synthetic Host harness. No native execution.
// U1_BASELINE=1 records the unchanged integration; otherwise enforces U1 acceptance.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { runUxBrowserSuite } from "./ux-browser-runner.mjs";
import {
  boot,
  preparedDraft,
  T,
  flush,
  setState,
  admissionCalls,
  assertClean,
} from "./ux-m1-helpers.mjs";
import { u1Run } from "./u1-runs.mjs";
import { interactionScenario } from "./u1-interactions.mjs";
import { baselineSource } from "./u1-baseline.mjs";
import { assertAgentLedVerification } from "./pre-z8-u1-ui.mjs";
import { densityScenario } from "./u1-density.mjs";

const baseline = process.env.U1_BASELINE === "1";
const densityBefore = process.env.U1_DENSITY_BEFORE === "1";
const sizes = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1093, height: 614 },
];
const pick = async (page, id) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).click();
  await T(page, "graph-run-summary").waitFor();
};
async function reserveSidebar(page) {
  // Harness-only shell: Tailwind scans product sources, not this fixture's unique lg:block class.
  // Explicitly reserve the same 268px app sidebar in BOTH baseline and candidate captures.
  await page.locator("#root > div > aside").evaluateAll((elements) => {
    for (const element of elements)
      Object.assign(element.style, { display: "block", width: "268px", flexShrink: "0" });
  });
}
async function bootWithSidebar(page, host, url) {
  await boot(page, host, url);
  await reserveSidebar(page);
}
async function capture(page, shotsDir, name) {
  await reserveSidebar(page);
  // Capture settled colors, not the previous history selection's transition frame.
  await page.addStyleTag({
    content: "*,*::before,*::after{transition:none !important;animation:none !important}",
  });
  await page.mouse.move(0, 0);
  await flush(page);
  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      cssZoom: getComputedStyle(document.body).zoom,
      shellSidebar: rect("#root > div > aside"),
      content: rect('[data-testid="graph-runs-detail"]'),
      canvas: rect('[data-testid="graph-canvas"]'),
      transform: document.querySelector(".react-flow__viewport")?.getAttribute("style"),
      runId: document
        .querySelector('[data-testid="graph-run-summary"]')
        ?.getAttribute("data-run-id"),
      selectedHistoryId: document
        .querySelector('[data-testid="graph-run"][aria-current="true"]')
        ?.getAttribute("data-run-id"),
      visibleText: document.querySelector("[data-view]")?.innerText,
    };
  });
  if (metrics.runId) assert.equal(metrics.selectedHistoryId, metrics.runId);
  if (shotsDir) {
    await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
    await fs.writeFile(path.join(shotsDir, `${name}.json`), JSON.stringify(metrics, null, 2));
  }
  return metrics;
}
const graphScenario = {
  name: "U1 graph layout and captured navigation",
  async run({ page, host, url, shotsDir }) {
    const runs = [u1Run(), u1Run("branch")];
    const original = JSON.stringify(runs);
    host.setRuns("A", runs);
    await bootWithSidebar(page, host, url);
    const calls = admissionCalls(host).length;
    for (const run of runs) {
      await pick(page, run.id);
      if ((await T(page, "graph-run-graph-toggle").getAttribute("aria-pressed")) !== "true")
        await T(page, "graph-run-graph-toggle").click();
      for (const size of sizes) {
        await page.setViewportSize(size);
        await T(page, "graph-select-node-task").click();
        await T(page, "graph-canvas").scrollIntoViewIfNeeded();
        const metrics = await capture(page, shotsDir, `${run.id}-${size.width}x${size.height}`);
        if (!baseline) {
          assert.ok(metrics.canvas.width >= metrics.content.width - 4, JSON.stringify(metrics));
          assert.ok(metrics.canvas.height >= 320);
        }
      }
    }
    assert.equal(
      JSON.stringify(runs),
      original,
      "captured positions, branches and attempts unchanged",
    );
    assert.equal(admissionCalls(host).length, calls, "navigation does not admit or save work");
    assertClean(host);
  },
};
const statesScenario = {
  name: "U1 concise states in both languages",
  async run({ page, host, url, shotsDir }) {
    const runs = ["running", "permission", "failed", "completed", "approval"].map((state) =>
      u1Run("sequential", state),
    );
    host.setRuns("A", runs);
    await bootWithSidebar(page, host, url);
    for (const locale of ["en-US", "zh-CN"]) {
      await setState(page, { locale, theme: locale === "zh-CN" ? "zai-light" : "zai-dark" });
      for (const run of runs) {
        await pick(page, run.id);
        for (const size of sizes) {
          await page.setViewportSize(size);
          await page.locator("[data-view]").evaluate((element) => {
            element.scrollTop = 0;
          });
          await capture(page, shotsDir, `${run.id}-${locale}-${size.width}x${size.height}`);
        }
        if (run.status === "Completed") {
          await assertAgentLedVerification(page, run.id);
          assert.notEqual(await T(page, "graph-run-human").getAttribute("data-state"), "approved");
        }
      }
    }
    assert.equal(admissionCalls(host).length, 0);
    assertClean(host);
  },
};
const newRunScenario = {
  name: "U1 New run retains explicit review and configured checks",
  async run({ page, host, url, shotsDir }) {
    await preparedDraft(page, host, url);
    await reserveSidebar(page);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.locator("[data-view]").evaluate((element) => {
        element.scrollTop = 0;
      });
      await capture(page, shotsDir, `new-run-${size.width}x${size.height}`);
    }
    assert.equal(await T(page, "graph-review-run").isDisabled(), false);
    assert.equal(host.calls.filter((call) => call.op === "graph.run").length, 0);
    assertClean(host);
  },
};
await runUxBrowserSuite({
  suite: baseline ? "Z8.5-U1 before" : "Z8.5-U1 after",
  sourceRoot: densityBefore
    ? await baselineSource("65ca1b6b04d2dd1f8e98c7b4c769e1b893d50802")
    : baseline
      ? await baselineSource()
      : undefined,
  scenarios: [
    graphScenario,
    statesScenario,
    newRunScenario,
    ...(!baseline ? [interactionScenario({ boot: bootWithSidebar, capture })] : []),
    ...(!baseline
      ? [densityScenario({ boot: bootWithSidebar, capture, before: densityBefore })]
      : []),
  ],
});
