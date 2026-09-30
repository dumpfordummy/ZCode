// UX-M2 screenshots of the touched journey. Each image is inspected by eye before it is committed
// (an existing image is not acceptance). Fixture services and synthetic data; Linux Chromium, not
// Electron and not Windows. Locale is switched before an error is raised, because switching the
// locale remounts the harness page (an action error is component state and would be lost).
import {
  T,
  SIZES,
  assertClean,
  editCheckByKeyboard,
  flush,
  preparedDraft,
  recipesReady,
  setState,
  shot,
} from "./ux-m1-helpers.mjs";
import { openPicker } from "./context-picker-helpers.mjs";
import { completedRun } from "./ux-m1-runs.mjs";

const BASE = Date.UTC(2026, 8, 30, 8, 0, 0);
const history = (count) =>
  Array.from({ length: count }, (_, index) => {
    const run = completedRun(`run-${index}`);
    run.createdAt = BASE + index * 60_000;
    return run;
  });
const THEMES = ["zai-dark", "zai-light"];
const reveal = (page, testId) => T(page, testId).scrollIntoViewIfNeeded();
const toTop = (page) =>
  page.evaluate(() => {
    const scroller = document.querySelector("[data-view]");
    if (scroller) scroller.scrollTop = 0;
  });

async function everyVariant(page, dir, name, locale, prepare) {
  for (const theme of THEMES) {
    await setState(page, { theme });
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await prepare();
      await page.mouse.move(0, 0); // 指针停在某一行上会拍到悬停高亮，看起来像选中
      await flush(page);
      await shot(page, dir, `${name}-${locale}-${theme.replace("zai-", "")}`, size);
    }
  }
}
async function oneVariant(page, dir, name, locale, prepare) {
  const [theme, size] = locale === "en-US" ? ["zai-dark", SIZES[0]] : ["zai-light", SIZES[1]];
  await setState(page, { theme });
  await page.setViewportSize(size);
  await prepare();
  await page.mouse.move(0, 0);
  await flush(page);
  await shot(page, dir, `${name}-${locale}-${theme.replace("zai-", "")}`, size);
}

function journey(locale) {
  return {
    name: `screenshots (${locale}): history, unsaved-check disclosure, Save summary, Discard and failure framing`,
    async run({ page, host, url, shotsDir }) {
      if (!shotsDir) return;
      host.setRuns("A", history(27));
      await preparedDraft(page, host, url);
      if (locale !== "en-US") {
        await setState(page, { locale });
        await T(page, "graph-new-run-pane").waitFor();
        await recipesReady(page);
      }
      // 1. New run：未保存的检查编辑标记 + 失败的预检（操作栏里的说明与原始诊断）
      await editCheckByKeyboard(page, "test");
      await T(page, "graph-recipe-field-2-name").fill("Unit tests (edited)");
      await T(page, "graph-return-to-workflow").click();
      await T(page, "graph-new-run-pane").waitFor();
      host.fail("wf.prepare", "Native environment unavailable (fixture).");
      await T(page, "graph-review-run").click();
      await T(page, "graph-new-run-error").waitFor();
      host.fail("wf.prepare");
      await everyVariant(page, shotsDir, "m2-new-run", locale, () =>
        reveal(page, "graph-selected-checks-test"),
      );
      // 2. Checks：返回栏说明、变更摘要、Save 与 Discard、框定的保存失败
      await page
        .locator(
          '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-edit"]',
        )
        .click();
      await T(page, "graph-guided-recipe").waitFor();
      host.fail("graph.recipes.save", "disk full (fixture)");
      await T(page, "graph-save-recipes").click();
      await T(page, "graph-recipes-save-error").waitFor();
      host.fail("graph.recipes.save");
      await everyVariant(page, shotsDir, "m2-checks-summary", locale, () =>
        reveal(page, "graph-recipe-changes"),
      );
      // 3. Discard 的内联确认
      await T(page, "graph-recipe-discard").click();
      await T(page, "graph-recipe-discard-confirmation").waitFor();
      await oneVariant(page, shotsDir, "m2-discard-confirm", locale, () =>
        reveal(page, "graph-recipe-discard-confirmation"),
      );
      await T(page, "graph-recipe-discard-cancel").click();
      // 4. Context：原生选择器返回工作区之外的文件
      await T(page, "graph-return-to-workflow").click();
      await T(page, "graph-new-run-pane").waitFor();
      host.setPickedFile(host.outside);
      const replace = T(page, "graph-context-replace-instructions");
      if (await replace.count()) await replace.click();
      else await openPicker(page);
      await T(page, "graph-context-native-picker").click();
      await T(page, "graph-context-validation-error").waitFor();
      await oneVariant(page, shotsDir, "m2-context-failure", locale, () =>
        reveal(page, "graph-context-validation-error"),
      );
      await T(page, "graph-context-search").focus();
      await page.keyboard.press("Escape");
      // 5. 历史：由新到旧、应用语言的时间
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      await page.locator('[data-testid="graph-run"][data-run-id="run-26"]').click();
      await T(page, "graph-run-summary").waitFor();
      await oneVariant(page, shotsDir, "m2-history", locale, () => toTop(page));
      assertClean(host);
    },
  };
}

export const m2ShotScenarios = [journey("en-US"), journey("zh-CN")];
