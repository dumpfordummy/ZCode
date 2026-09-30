// UX-M2 presentation acceptance in the real Electron window: history, New run with the unsaved-check
// marker, Checks summary, Discard confirmation and Context failure, at 1280x720 and 1920x1080, in
// Zai Dark and Zai Light, in English and Simplified Chinese (one launch per language, the theme
// switches by reload). `scale` emulates 125% / 150% inside the test process only.
import assert from "node:assert/strict";
import path from "node:path";
import { openPicker } from "./context-picker-helpers.mjs";
import {
  T,
  cancelRun,
  finishReceipt,
  launchUx,
  observe,
  openNewRun,
  pageIds,
  prepareNewRun,
  readGraphRecord,
  shotSizes,
  startFromNewRun,
  step,
} from "./ux-m2-native-common.mjs";
import { back, editCheck, recipeFieldName } from "./ux-m1-native-checks-helpers.mjs";

const HAN = /[一-鿿]/;

/** Geometry the user relies on: nothing overflows sideways and the named control is fully in view. */
async function assertFits(window, testIds, what) {
  const overflow = await window.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${what}: no horizontal overflow (${overflow}px)`);
  for (const id of testIds) {
    const box = await T(window, id).boundingBox();
    const [width, height] = await window.evaluate(() => [innerWidth, innerHeight]);
    assert.ok(
      box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
      `${what}: ${id} is inside the ${width}x${height} viewport (${JSON.stringify(box)})`,
    );
  }
}
const reveal = (window, id) =>
  T(window, id).evaluate((el) => el.scrollIntoView({ block: "center" }));

async function surfaces({ isolation, window, receipt, files, dialogControl }, tag, locale, ids) {
  const zh = locale === "zh-CN";
  const ws = isolation.workspace;
  await step(
    receipt,
    `${tag}-history`,
    `${tag}: history, newest first, Newer/Older wording`,
    async () => {
      await openNewRun(window);
      const shown = await pageIds(window);
      assert.deepEqual(shown, [...ids].reverse().slice(0, 25), "newest first");
      const labels = [
        await T(window, "graph-history-previous").innerText(),
        await T(window, "graph-history-next").innerText(),
      ];
      observe(receipt, `${tag} paging labels`, labels);
      if (zh) assert.match(labels.join(" "), /较新.*较早/);
      else assert.deepEqual(labels, ["Newer runs", "Older runs"]);
      await shotSizes(isolation, window, receipt, `${tag}-history`, async () => {
        await reveal(window, "graph-history-range");
        await assertFits(window, ["graph-history-previous", "graph-history-next"], "history");
      });
    },
  );

  await step(
    receipt,
    `${tag}-new-run`,
    `${tag}: New run with an unsaved-check marker (saved check still shown)`,
    async () => {
      await prepareNewRun(window);
      await editCheck(window, "test");
      await (await recipeFieldName(window)).name.fill("Presentation probe (unsaved)");
      await back(window);
      const line = await T(window, "graph-new-run-unsaved-checks").innerText();
      observe(receipt, `${tag} New run line`, line);
      if (zh) assert.match(line, HAN);
      assert.ok(
        !(await T(window, "graph-selected-checks-test").innerText()).includes("Presentation probe"),
        "the saved check is shown",
      );
      await shotSizes(isolation, window, receipt, `${tag}-new-run`, async () => {
        await reveal(window, "graph-new-run-unsaved-checks");
        await assertFits(window, ["graph-new-run-unsaved-checks"], "New run");
      });
    },
  );

  await step(
    receipt,
    `${tag}-checks`,
    `${tag}: Checks summary above Save checks and the Discard entry`,
    async () => {
      await editCheck(window, "test");
      const summary = await T(window, "graph-recipe-changes").innerText();
      observe(receipt, `${tag} Save summary`, summary);
      if (zh) assert.match(summary, HAN);
      await shotSizes(isolation, window, receipt, `${tag}-checks-summary`, async () => {
        await reveal(window, "graph-save-recipes");
        await assertFits(window, ["graph-save-recipes", "graph-recipe-discard"], "Checks summary");
      });
    },
  );

  await step(
    receipt,
    `${tag}-discard`,
    `${tag}: Discard confirmation names the whole list`,
    async () => {
      await T(window, "graph-recipe-discard").click();
      await T(window, "graph-recipe-discard-confirmation").waitFor();
      const text = await T(window, "graph-recipe-discard-confirmation").innerText();
      if (zh) assert.match(text, HAN);
      await shotSizes(isolation, window, receipt, `${tag}-discard-confirm`, async () => {
        await reveal(window, "graph-recipe-discard-confirmation");
        await assertFits(
          window,
          ["graph-recipe-discard-confirm", "graph-recipe-discard-cancel"],
          "Discard confirmation",
        );
      });
      await T(window, "graph-recipe-discard-confirm").click();
      await T(window, "graph-recipe-discarded").waitFor();
      await back(window);
    },
  );

  await step(
    receipt,
    `${tag}-context`,
    `${tag}: Context failure names the file and keeps the previous selection`,
    async () => {
      const notes = path.join(ws, "docs", "Notes.md");
      await dialogControl.set({ open: { path: notes } });
      await openPicker(window);
      await T(window, "graph-context-slot-instructions").check();
      await T(window, "graph-context-native-picker").click();
      await T(window, "graph-context-popover").waitFor({ state: "hidden" });
      await dialogControl.set({ open: { path: files.outside } });
      await T(window, "graph-context-replace-instructions").click();
      await T(window, "graph-context-native-picker").click();
      await T(window, "graph-context-validation-error").waitFor({ timeout: 20000 });
      const text = await T(window, "graph-context-validation-error").innerText();
      observe(receipt, `${tag} Context failure`, text);
      assert.ok(
        text.includes("outside-secret.md") && text.includes("docs/Notes.md"),
        "file and previous selection are named",
      );
      assert.ok(text.includes("Unsafe workspace-relative path segment."), "Host text verbatim");
      if (zh) assert.match(text, HAN);
      await shotSizes(isolation, window, receipt, `${tag}-context-failure`, async () => {
        await reveal(window, "graph-context-validation-error");
        await assertFits(window, ["graph-context-validation-error"], "Context failure");
      });
      await dialogControl.set({});
    },
  );
}

async function themePhase(ctx, tag, theme, locale, ids) {
  const { window } = ctx;
  if (theme) {
    await window.evaluate((value) => localStorage.setItem("zcode-theme", value), theme);
    await window.reload();
    await window.waitForLoadState("domcontentloaded");
    await T(window, "graph-engineering-open").waitFor({ timeout: 45000 });
    assert.match(
      await window.evaluate(() => document.documentElement.className),
      theme === "zai-light" ? /light/ : /dark/,
    );
  }
  await surfaces(ctx, tag, locale, ids);
}

async function makeRuns(ctx, count) {
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const run = await startFromNewRun(ctx.isolation, ctx.window);
    ids.push(run.id);
    await cancelRun(ctx.isolation, ctx.window, run.id);
  }
  return ids;
}

export async function presentationJourney(locale = "en-US", scale) {
  const name = scale ? `scale-${scale}` : `presentation-${locale}`;
  const ctx = await launchUx(name, {
    scenario: "pass",
    locale,
    theme: "zai-dark",
    dialog: true,
    scale,
  });
  const { isolation, window, receipt } = ctx;
  let error;
  try {
    let ids;
    await step(
      receipt,
      "P0",
      `${locale}: the app starts in Zai Dark; three real runs exist (each stopped with Cancel)`,
      async () => {
        if (scale) assert.equal(await window.evaluate(() => devicePixelRatio), Number(scale));
        observe(
          receipt,
          "document language / devicePixelRatio",
          await window.evaluate(() => [document.documentElement.lang, devicePixelRatio]),
        );
        // 中文界面的运行需要回答权限时才会用到 “Allow”；这里只启动并立即取消，不涉及权限。
        ids = await makeRuns(ctx, 3);
        assert.deepEqual(
          (await readGraphRecord(isolation)).runs.map((run) => run.id),
          ids,
        );
      },
    );
    await themePhase(ctx, `${name}-dark`, undefined, locale, ids);
    if (!scale) await themePhase(ctx, `${name}-light`, "zai-light", locale, ids);
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}

export const scalingJourney = (scale) => presentationJourney("en-US", scale);
