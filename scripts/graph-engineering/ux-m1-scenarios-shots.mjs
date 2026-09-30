// UX-M1.2 screenshots. Each is inspected by eye before it is committed (an existing image is not acceptance).
import {
  T,
  SIZES,
  assertClean,
  boot,
  chooseGeneric,
  editCheckByKeyboard,
  flush,
  preparedDraft,
  setState,
  shot,
  stepRows,
  until,
} from "./ux-m1-helpers.mjs";
import { BUILD_ALT, LINT, TEST } from "./ux-m1-checks.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";

const reveal = (page, testId) => T(page, testId).scrollIntoViewIfNeeded();

const shots = {
  name: "screenshots: selected checks, the checks editor with its return bar, and an unresolved check (dark and light, 1280x720 and 1920x1080)",
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    await preparedDraft(page, host, url);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await reveal(page, "graph-selected-checks-build");
      await flush(page);
      await shot(page, shotsDir, "m1-selected-checks", size);
    }
    await setState(page, { theme: "zai-light" });
    await page.setViewportSize(SIZES[0]);
    await reveal(page, "graph-selected-checks-build");
    await shot(page, shotsDir, "m1-selected-checks-light", SIZES[0]);
    await setState(page, { theme: "zai-dark" });
    // 检查编辑器：粘性返回栏与被打开的那一项检查
    for (const [theme, name] of [
      ["zai-dark", "m1-checks-editor-return"],
      ["zai-light", "m1-checks-editor-return-light"],
    ]) {
      await setState(page, { theme });
      await page.setViewportSize(SIZES[0]);
      if ((await T(page, "graph-guided-recipe").count()) === 0)
        await editCheckByKeyboard(page, "test");
      await flush(page);
      await shot(page, shotsDir, name, SIZES[0]);
      if (theme === "zai-dark") {
        await page.evaluate(() => {
          const scroller = document.querySelector("[data-view]");
          scroller.scrollTop = scroller.scrollHeight;
        });
        await flush(page);
        await shot(page, shotsDir, "m1-checks-editor-return-scrolled", SIZES[0]);
        await page.evaluate(() => {
          document.querySelector("[data-view]").scrollTop = 0;
        });
      }
    }
    await setState(page, { theme: "zai-dark" });
    await T(page, "graph-return-to-workflow").click();
    // 未解决的选择：外部删除了所选 Build 检查，另一个兼容检查存在但不会被自动选中
    await host.seedRecipes("A", [BUILD_ALT, TEST, LINT]);
    await T(page, "graph-template-load-recipes").click();
    await until(async () => (await stepRows(page, "build"))[0]?.state === "missing", "missing");
    await page.setViewportSize(SIZES[0]);
    await reveal(page, "graph-selected-checks-build");
    await flush(page);
    await shot(page, shotsDir, "m1-unresolved-check", SIZES[0]);
    assertClean(host);
  },
};

const chineseShots = {
  name: "screenshots: Simplified Chinese with an occupying run (1280x720, dark)",
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    host.setRuns("A", [permissionWaitRun()]);
    await host.seedRecipes("A", [BUILD_ALT, TEST, LINT]);
    await boot(page, host, url, { locale: "zh-CN" });
    await chooseGeneric(page);
    await page.setViewportSize(SIZES[0]);
    await reveal(page, "graph-selected-checks-build");
    await flush(page);
    await shot(page, shotsDir, "m1-zh-new-run", SIZES[0]);
    await T(page, "graph-template-recipe-build").click();
    await page.locator('[role="option"][data-value="build-alt"]').click();
    await T(page, "graph-template-recipe-test").click();
    await page.locator('[role="option"][data-value="test-unit"]').click();
    await flush(page);
    await editCheckByKeyboard(page, "test");
    await flush(page);
    await shot(page, shotsDir, "m1-zh-checks-editor", SIZES[0]);
    assertClean(host);
  },
};

export const shotScenarios = [shots, chineseShots];
