// UX-M1.4 journey E (presentation): English/Simplified Chinese x Zai Dark/Light x 1280x720 / 1920x1080
// on the touched surfaces of the real Electron app, plus emulated 125%/150% device scale factors
// (a Chromium switch inside the test process; the user's Windows display settings are never changed).
// Layout is asserted from geometry (the primary action, its reason and the Back bar stay usable);
// the screenshots are then inspected by eye.
import assert from "node:assert/strict";
import { openPicker, optionCount, search, until } from "./context-picker-helpers.mjs";
import {
  REQUEST,
  SIZES,
  T,
  chipValue,
  finishReceipt,
  flush,
  launchUx,
  observe,
  openNewRun,
  pendingPermission,
  shot,
  snapshot,
  step,
  waitRecord,
  reloadToWorkspace,
} from "./ux-m1-native-common.mjs";

const HAN = /[一-鿿]/;
const NEXT_TASK = "Next task drafted while a run waits";
const setSize = async (isolation, window, [width, height]) => {
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    await nativeWindow.evaluate(
      (browserWindow, [w, h]) => {
        if (browserWindow.isMaximized()) browserWindow.unmaximize();
        browserWindow.setContentSize(w, h);
      },
      [width, height],
    );
  } finally {
    await nativeWindow.dispose();
  }
  // 小数缩放（125%）时窗口尺寸换算会有 2 CSS 像素以内的取整；实际尺寸记录在回执里。
  await window.waitForFunction(
    ([w, h]) => Math.abs(innerWidth - w) <= 2 && Math.abs(innerHeight - h) <= 2,
    [width, height],
  );
  return window.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
};
const box = async (window, testId) => {
  const b = await T(window, testId).boundingBox();
  const viewport = await window.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  return { b, viewport };
};
/** The element is fully inside the viewport (sticky bars must not be scrolled away or clipped). */
const assertInView = async (window, testId, label) => {
  const { b, viewport } = await box(window, testId);
  assert.ok(b, `${label}: ${testId} is rendered`);
  assert.ok(
    b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.w + 1 && b.y + b.height <= viewport.h + 1,
    `${label}: ${testId} is inside the ${viewport.w}x${viewport.h} viewport (${JSON.stringify(b)})`,
  );
  return b;
};
const scrollPane = (window, where) =>
  window.evaluate((position) => {
    const scroller = document.querySelector("[data-view]");
    if (!scroller) return false;
    scroller.scrollTop = position === "top" ? 0 : scroller.scrollHeight;
    return true;
  }, where);

/** Open the picker, choose the slot explicitly (the default may be another slot), search and pick by keyboard. */
async function addToSlot(window, slot, query) {
  await openPicker(window);
  await T(window, `graph-context-slot-${slot}`).check();
  await search(window, query);
  await until(async () => (await optionCount(window)) > 0, `results for ${query}`);
  await window.keyboard.press("ArrowDown");
  await window.keyboard.press("Enter");
  await T(window, `graph-context-chip-${slot}`).waitFor();
  await T(window, "graph-context-popover").waitFor({ state: "hidden" });
}

async function reviewSurface(isolation, window, receipt, tag) {
  await openNewRun(window);
  await T(window, "graph-library-entry").click();
  await window.locator('[role="option"][data-value="generic"]').click();
  await T(window, "graph-template-recipe-build").waitFor();
  await T(window, "graph-template-parameter-request").fill(`${REQUEST} (presentation check)`);
  await addToSlot(window, "instructions", "Notes");
  for (const [testId, value] of [
    ["graph-template-recipe-build", "alt-build"],
    ["graph-template-recipe-test", "alt-test"],
  ]) {
    await T(window, testId).click();
    await window.locator(`[role="option"][data-value="${value}"]`).click();
    await flush(window);
  }
  for (const size of SIZES) {
    await setSize(isolation, window, size);
    await scrollPane(window, "top");
    await assertInView(window, "graph-review-run", `${tag} new-run action (scrolled to top)`);
    await scrollPane(window, "bottom");
    await assertInView(window, "graph-review-run", `${tag} new-run action (scrolled to bottom)`);
    await shot(isolation, window, receipt, `${tag}-new-run-ready`, size);
  }
  await setSize(isolation, window, SIZES[0]);
  await T(window, "graph-review-run").click();
  await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
  assert.equal(await T(window, "graph-preflight-ack").getAttribute("aria-checked"), "false");
  for (const size of SIZES) {
    await setSize(isolation, window, size);
    await T(window, "graph-preflight-ack").scrollIntoViewIfNeeded();
    await assertInView(window, "graph-confirm-run", `${tag} Start run`);
    await shot(isolation, window, receipt, `${tag}-review-unticked`, size);
  }
}

async function startFromReview(window, isolation) {
  await T(window, "graph-preflight-ack").click();
  await T(window, "graph-confirm-run").click();
  const { record } = await waitRecord(
    isolation,
    (item) => item.runs.length > 0 && pendingPermission(item),
    "a native permission wait",
  );
  return record.runs.at(-1);
}

async function occupiedSurfaces(isolation, window, receipt, tag, { locale }) {
  // 新运行（被占用）：草稿保留，原因与“查看当前运行”紧挨主操作。
  await openNewRun(window);
  await T(window, "graph-template-parameter-request").fill(NEXT_TASK);
  await addToSlot(window, "instructions", "Extra");
  for (const size of SIZES) {
    await setSize(isolation, window, size);
    await scrollPane(window, "top");
    const action = await assertInView(window, "graph-review-run", `${tag} occupied action (top)`);
    const reason = await assertInView(
      window,
      "graph-new-run-blocked",
      `${tag} occupied reason (top)`,
    );
    await assertInView(window, "graph-view-current-run", `${tag} View current run (top)`);
    assert.ok(Math.abs(reason.y - action.y) < 120, `${tag}: the reason sits beside the action`);
    await scrollPane(window, "bottom");
    await assertInView(window, "graph-review-run", `${tag} occupied action (bottom)`);
    await assertInView(window, "graph-view-current-run", `${tag} View current run (bottom)`);
    await shot(isolation, window, receipt, `${tag}-occupied-new-run`, size);
  }
  if (locale === "zh-CN") {
    const text = await T(window, "graph-new-run-blocked").innerText();
    assert.match(text, HAN, "the blocking reason is localized");
    assert.match(
      await T(window, "graph-context-label").innerText(),
      HAN,
      "the next-run label is localized",
    );
    // 用户文字与 id 不翻译。
    assert.equal(await T(window, "graph-template-parameter-request").inputValue(), NEXT_TASK);
    assert.match(await chipValue(window, "instructions"), /^docs\/Extra\.md$/);
  }
  // Checks 编辑器 + Back 栏
  const edit = window.locator(
    '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-edit"]',
  );
  await edit.scrollIntoViewIfNeeded();
  await edit.focus();
  await window.keyboard.press("Enter");
  await T(window, "graph-guided-recipe").waitFor();
  for (const size of SIZES) {
    await setSize(isolation, window, size);
    await scrollPane(window, "top");
    await assertInView(window, "graph-return-to-workflow", `${tag} Back bar (top)`);
    await scrollPane(window, "bottom");
    await assertInView(
      window,
      "graph-return-to-workflow",
      `${tag} Back bar (scrolled to the bottom)`,
    );
    await shot(isolation, window, receipt, `${tag}-checks-editor-back`, size);
  }
  if (locale === "zh-CN") assert.match(await T(window, "graph-return-note").innerText(), HAN);
  assert.equal(
    await T(window, "graph-guided-recipe").getAttribute("data-recipe-id"),
    "alt-test",
    "stored check ids are never translated",
  );
  await T(window, "graph-return-to-workflow").click();
  // Needs-you 与运行详情
  await T(window, "graph-view-current-run").click();
  await T(window, "graph-run-summary").waitFor();
  for (const size of SIZES) {
    await setSize(isolation, window, size);
    await scrollPane(window, "top");
    await T(window, "graph-needs-you").waitFor();
    await assertInView(window, "graph-needs-you-go", `${tag} Go to run`);
    if (locale === "zh-CN") assert.match(await T(window, "graph-needs-you-scope").innerText(), HAN);
    await shot(isolation, window, receipt, `${tag}-needs-you-run-detail`, size);
  }
}

async function cancelPending(window, isolation, runId) {
  await T(window, "graph-view-runs").click();
  const row = window.locator(`[data-testid="graph-run"][data-run-id="${runId}"]`);
  if (await row.count()) await row.click();
  await T(window, "graph-cancel").click();
  await waitRecord(
    isolation,
    (item) =>
      ["Cancelled", "Interrupted"].includes(item.runs.find((run) => run.id === runId)?.status),
    "the run to stop",
  );
}

async function themePhase(ctx, tag, theme, locale) {
  const { isolation, window, receipt } = ctx;
  if (theme) {
    await window.evaluate((value) => localStorage.setItem("zcode-theme", value), theme);
    await reloadToWorkspace(window);
    const applied = await window.evaluate(() => document.documentElement.className);
    assert.match(
      applied,
      theme === "zai-light" ? /light/ : /dark/,
      `the ${theme} theme is applied`,
    );
  }
  await step(receipt, `${tag}-review`, `${tag}: ready-to-review surface at both sizes`, () =>
    reviewSurface(isolation, window, receipt, tag),
  );
  let run;
  await step(receipt, `${tag}-start`, `${tag}: explicit Start on the real preflight`, async () => {
    await setSize(isolation, window, SIZES[0]);
    run = await startFromReview(window, isolation);
  });
  await step(
    receipt,
    `${tag}-occupied`,
    `${tag}: occupied New run, Checks editor with the Back bar, Needs-you and run detail`,
    () => occupiedSurfaces(isolation, window, receipt, tag, { locale }),
  );
  await step(receipt, `${tag}-stop`, `${tag}: stop the synthetic run`, () =>
    cancelPending(window, isolation, run.id),
  );
}

/** Locale x theme matrix: one launch per locale, the theme switches by reload inside it. */
export async function presentationJourney(locale = "en-US") {
  const ctx = await launchUx(`presentation-${locale}`, {
    scenario: "pass",
    locale,
    theme: "zai-dark",
  });
  const { isolation, window, receipt } = ctx;
  let error;
  try {
    await step(
      receipt,
      "P0",
      `${locale}: the app starts in Zai Dark with the requested language`,
      async () => {
        const lang = await window.evaluate(() => document.documentElement.lang);
        observe(receipt, "document language", lang);
      },
    );
    await themePhase(ctx, `${locale}-dark`, undefined, locale);
    await themePhase(ctx, `${locale}-light`, "zai-light", locale);
    const record = (await snapshot(isolation)).record;
    observe(
      receipt,
      "runs created (all stopped with Cancel)",
      record.runs.map((run) => run.status),
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

/** Emulated 125% / 150% device scale factor on the same surfaces (English, Zai Dark). */
export async function scalingJourney(scale) {
  const ctx = await launchUx(`scale-${scale}`, { scenario: "pass", scale, theme: "zai-dark" });
  const { isolation, window, receipt } = ctx;
  let error;
  try {
    await step(receipt, "S0", `device scale factor ${scale} is really applied`, async () => {
      const ratio = await window.evaluate(() => devicePixelRatio);
      assert.equal(ratio, Number(scale));
      observe(receipt, "devicePixelRatio", ratio);
    });
    await themePhase(ctx, `scale-${scale}`, undefined, "en-US");
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
