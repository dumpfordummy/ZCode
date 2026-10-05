import assert from "node:assert/strict";
import {
  T,
  flush,
  until,
  navigation,
  selectValue,
  admissionCalls,
  assertClean,
} from "./ux-m1-helpers.mjs";
import { u1Run } from "./u1-runs.mjs";

const transform = (page) => page.locator(".react-flow__viewport").getAttribute("style");
const zoom = (page) =>
  page
    .locator(".react-flow__viewport")
    .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
const selected = async (page, host) => (await navigation(page))[host.workspaces.A];
const row = (page, id) => page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`);

export function interactionScenario({ boot, capture }) {
  return {
    name: "U1 Fit, pan, refresh, historical attempts, keyboard and read-only boundaries",
    async run({ page, host, url, shotsDir }) {
      const branch = u1Run("branch"),
        sequential = u1Run();
      host.setRuns("A", [branch, sequential]);
      const original = JSON.stringify(host.graph.A.runs);
      host.graph.A.definition.name = "Today’s edited workflow — never the historical canvas";
      await boot(page, host, url);
      await page.setViewportSize({ width: 1600, height: 900 });
      await row(page, branch.id).click();
      // First reveal from a hidden Steps tab must have actual measured nodes and nonzero dimensions.
      await T(page, "graph-run-tab-request").click();
      await T(page, "graph-run-tab-steps").click();
      await T(page, "graph-run-graph-toggle").focus();
      await page.keyboard.press("Enter");
      await T(page, "graph-select-node-task").click();
      await until(async () => (await zoom(page)) >= 0.85, "readable selection on first reveal");
      await T(page, "graph-fit").focus();
      await page.keyboard.press("Enter");
      await until(async () => (await zoom(page)) < 0.85, "Fit can zoom out below the old clamp");
      await T(page, "graph-canvas").scrollIntoViewIfNeeded();
      await flush(page);
      const fit = await T(page, "graph-canvas").boundingBox();
      for (const node of await page.locator(".react-flow__node").all()) {
        const box = await node.boundingBox();
        assert.ok(
          box.x >= fit.x &&
            box.y >= fit.y &&
            box.x + box.width <= fit.x + fit.width &&
            box.y + box.height <= fit.y + fit.height,
          `Fit contains ${await node.getAttribute("data-id")}`,
        );
      }
      await capture(page, shotsDir, "branch-fit-1600x900");
      await T(page, "graph-focus-selected").focus();
      await page.keyboard.press("Enter");
      await until(async () => (await zoom(page)) >= 0.85, "Focus restores readable labels");
      await T(page, "graph-region-select").click();
      await T(page, "graph-run-step-details").click();
      assert.equal((await selected(page, host)).regionId, "repair-region");
      assert.equal(await T(page, "graph-node-inspector").count(), 0);
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
        "graph-region-inspector",
      );
      await T(page, "graph-run-close-details").click();
      // A click selects a different captured node; keyboard node navigation remains available.
      await T(page, "graph-select-node-repair").focus();
      await page.keyboard.press("Enter");
      await until(
        async () => (await selected(page, host)).nodeId === "repair",
        "keyboard node selection",
      );
      await T(page, "graph-select-node-task").click();
      await T(page, "graph-run-step-details").focus();
      await page.keyboard.press("Enter");
      await until(
        async () =>
          (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) ===
          "graph-node-inspector",
        "focus enters details",
      );
      await selectValue(page, "graph-attempt-select", "task-previous");
      assert.equal(
        await T(page, "graph-node-inspector").getAttribute("data-attempt-id"),
        "task-previous",
      );
      assert.equal(
        await T(page, "graph-resolved-instructions").evaluate((element) => element.open),
        false,
      );
      await T(page, "graph-resolved-instructions").locator("summary").focus();
      await page.keyboard.press("Enter");
      assert.match(
        await T(page, "graph-resolved-instructions").innerText(),
        /Preserve all public API names/,
      );
      await T(page, "graph-run-close-details").focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
        "graph-run-step-details",
      );
      await T(page, "graph-canvas").scrollIntoViewIfNeeded();
      const box = await T(page, "graph-canvas").boundingBox();
      const beforePan = await transform(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 95, box.y + box.height * 0.75 + 25, {
        steps: 8,
      });
      await page.mouse.up();
      await until(async () => (await transform(page)) !== beforePan, "pan changes viewport");
      const beforeZoom = await zoom(page);
      await page.locator(".react-flow__controls-zoomin").click();
      await until(async () => (await zoom(page)) > beforeZoom, "zoom control works");
      await flush(page);
      const retained = await transform(page);
      const beforeRefresh = host.calls.filter(
        (call) => call.op === "graph.getWorkspace" && call.phase === "done",
      ).length;
      host.setRuns("A", [branch, sequential]);
      await until(
        () =>
          host.calls.filter((call) => call.op === "graph.getWorkspace" && call.phase === "done")
            .length > beforeRefresh,
        "Host refresh delivered",
      );
      await flush(page);
      assert.equal(await transform(page), retained, "polling never resets pan/zoom");
      assert.equal((await selected(page, host)).attemptId, "task-previous");
      await T(page, "graph-run-graph-toggle").click();
      await T(page, "graph-run-graph-toggle").click();
      await flush(page);
      assert.equal(await transform(page), retained, "hide/reveal retains pan/zoom");
      await T(page, "graph-run-tab-request").click();
      assert.match(await T(page, "graph-run-request").innerText(), /Fix the request parser/);
      await T(page, "graph-run-tab-technical").click();
      assert.match(await T(page, "graph-run-technical-details").innerText(), /C:\/synthetic/);
      await T(page, "graph-run-tab-steps").click();
      await flush(page);
      assert.equal(await transform(page), retained, "tab return retains viewport");
      assert.equal((await selected(page, host)).attemptId, "task-previous");
      await page.setViewportSize({ width: 1093, height: 614 });
      await flush(page);
      assert.equal((await selected(page, host)).runId, branch.id);
      assert.equal((await selected(page, host)).attemptId, "task-previous");
      assert.ok((await T(page, "graph-canvas").boundingBox()).width > 600);
      await T(page, "graph-run-history-toggle").focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await T(page, "graph-run-history-toggle").getAttribute("aria-expanded"),
        "false",
      );
      await T(page, "graph-fit").click();
      await T(page, "graph-canvas").scrollIntoViewIfNeeded();
      await capture(page, shotsDir, "branch-narrow-history-collapsed-1093x614");
      await T(page, "graph-run-history-toggle").click();
      await row(page, sequential.id).click();
      assert.equal((await selected(page, host)).runId, sequential.id);
      assert.notEqual((await selected(page, host)).attemptId, "task-previous");
      assert.equal(
        await page.locator('.react-flow__node[data-id="condition"]').count(),
        0,
        "new run has its own captured graph",
      );
      await row(page, branch.id).click();
      assert.equal(await page.locator('.react-flow__node[data-id="condition"]').count(), 1);
      assert.equal(
        JSON.stringify(host.graph.A.runs),
        original,
        "no historical record or position changed",
      );
      assert.equal(admissionCalls(host).length, 0, "no run/save/model/tool/approval admission");
      assertClean(host);
    },
  };
}
