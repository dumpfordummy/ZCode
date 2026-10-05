import assert from "node:assert/strict";
import { readGraphRecord, modelCount } from "./z5-native-observe.mjs";
import { shot } from "./ux-m1-native-common.mjs";
export async function verifyB1RunView(isolation, window, summary, run) {
  assert.equal(run.status, "WaitingForApproval");
  const before = await readGraphRecord(isolation),
    models = modelCount(isolation);
  const t = (id) => window.getByTestId(id);
  const transform = () => window.locator(".react-flow__viewport").getAttribute("style");
  await t("graph-run-tab-steps").click();
  if (await t("graph-run-close-details").isVisible()) await t("graph-run-close-details").click();
  assert.equal(await t("graph-artifact-manifest").isVisible(), false);
  assert.equal(await t("graph-routing-checkpoints").count(), 0);
  if (!(await t("graph-canvas").isVisible())) await t("graph-run-graph-toggle").click();
  const receipt = { evidenceDir: isolation.home, screenshots: [] };
  summary.b1RunView = [];
  for (const size of [
    [1600, 900],
    [1093, 614],
  ]) {
    const bw = await isolation.app.browserWindow(window);
    await bw.evaluate((w, s) => {
      if (w.isMaximized()) w.unmaximize();
      w.setContentSize(...s);
    }, size);
    await bw.dispose();
    await window.waitForFunction(
      ([w, h]) => Math.abs(innerWidth - w) <= 2 && Math.abs(innerHeight - h) <= 2,
      size,
    );
    await t("graph-select-node-reviewer").click();
    await t("graph-fit").click();
    await window.waitForFunction(() => {
      const canvas = document.querySelector('[data-testid="graph-canvas"]').getBoundingClientRect();
      return [...document.querySelectorAll(".react-flow__node")].every((n) => {
        const b = n.getBoundingClientRect();
        return (
          b.x >= canvas.x - 2 &&
          b.y >= canvas.y - 2 &&
          b.right <= canvas.right + 2 &&
          b.bottom <= canvas.bottom + 2
        );
      });
    });
    const canvas = await t("graph-canvas").boundingBox();
    // U1 的验收依据是占满实际详情列；全局侧栏和历史列使固定像素阈值不可靠。
    const detail = await t("graph-runs-detail").boundingBox();
    assert.ok(Math.abs(canvas.width - detail.width) <= 2, "graph uses available detail width");
    await shot(isolation, window, receipt, "b1-u1-fit-" + size[0], size);
    await t("graph-focus-selected").click();
    await window.waitForFunction(
      () =>
        new DOMMatrix(getComputedStyle(document.querySelector(".react-flow__viewport")).transform)
          .a >= 0.85,
    );
    await t("graph-run-step-details").click();
    assert.equal(await t("graph-node-inspector").getAttribute("data-node-id"), "reviewer");
    await t("graph-run-close-details").click();
    const viewport = await transform();
    await t("graph-run-tab-technical").click();
    await t("graph-run-tab-steps").click();
    await window.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    assert.equal(await transform(), viewport);
    await t("graph-run-history-toggle").click();
    assert.equal(await t("graph-run-history-toggle").getAttribute("aria-expanded"), "false");
    await t("graph-fit").click();
    await shot(isolation, window, receipt, "b1-u1-history-collapsed-" + size[0], size);
    await t("graph-run-history-toggle").click();
    summary.b1RunView.push({
      size,
      canvasWidth: canvas.width,
      detailWidth: detail.width,
      fit: true,
      focus: true,
      details: true,
      tabViewportRetained: true,
      historyCollapse: true,
    });
  }
  assert.deepEqual(await readGraphRecord(isolation), before);
  assert.equal(modelCount(isolation), models);
  summary.screenshots.push(...receipt.screenshots.map((name) => isolation.home + "/" + name));
  summary.assertions.push(
    "B1-U1: native pending-approval run; wide/reduced width, Fit, Focus, details, tab viewport and history controls preserve authoritative records and model count.",
  );
}

