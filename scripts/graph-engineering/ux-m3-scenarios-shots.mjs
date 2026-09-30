// UX-M3 screenshots of the touched journey. Each image is inspected by eye before it is committed
// (an existing image is not acceptance). Fixture run records and the REAL GraphWorkflowService over
// an in-memory store; Linux Chromium, not Electron and not Windows.
import { SIZES, flush, setState, shot } from "./ux-m1-helpers.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";
import { T, boot, openAdvanced, openLibrary, openShare, selectValue } from "./ux-m3-helpers.mjs";

const THEMES = ["zai-dark", "zai-light"];
/** Every theme and size for the shot, in the current locale. */
async function everyVariant(page, dir, name, locale, prepare) {
  for (const theme of THEMES) {
    await setState(page, { theme });
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await prepare();
      await page.mouse.move(0, 0);
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
const scrollDialogTop = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="graph-library-dialog"]');
    if (dialog) dialog.scrollTop = 0;
  });

function libraryJourney(locale, variants) {
  return {
    name: `screenshots (${locale}): library dialog while a run waits, New run version line, and the design origin`,
    async run({ page, host, url, shotsDir }) {
      if (!shotsDir) return;
      const entry = await host.library.seedUser("Team release", {
        base: "agent-assisted",
        versions: 3,
      });
      host.setRuns("A", [permissionWaitRun("run-waiting")]);
      await boot(page, host, url);
      if (locale !== "en-US") {
        await setState(page, { locale });
        await T(page, "graph-new-run-pane").waitFor();
      }
      // 1. New run：这一次运行将使用的版本，占用时的原因在同一处
      await selectValue(page, "graph-library-entry", entry.id);
      await variants(page, shotsDir, "m3-new-run-version", locale, async () => {
        await T(page, "graph-new-run-version-line").waitFor();
      });
      // 2. 资料库对话框：运行占用时只读浏览
      await openLibrary(page);
      await selectValue(page, "graph-library-entry", entry.id);
      await variants(page, shotsDir, "m3-library-occupied", locale, async () => {
        await scrollDialogTop(page);
      });
      // 3. 展开 Share 与 Advanced
      await openShare(page);
      await openAdvanced(page);
      await variants(page, shotsDir, "m3-library-share-advanced", locale, async () => {
        await T(page, "graph-library-advanced").scrollIntoViewIfNeeded();
      });
      await page.keyboard.press("Escape");
    },
  };
}

export const m3ShotScenarios = [
  libraryJourney("en-US", everyVariant),
  libraryJourney("zh-CN", oneVariant),
];
