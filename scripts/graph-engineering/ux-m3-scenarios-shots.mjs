// UX-M3 screenshots of the touched journey. Each image is inspected by eye before it is committed
// (an existing image is not acceptance). Fixture run records and the REAL GraphWorkflowService over
// an in-memory store; Linux Chromium, not Electron and not Windows.
import { SIZES, flush, setState, shot } from "./ux-m1-helpers.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";
import { ALL_CHECKS } from "./ux-m1-checks.mjs";
import { pinnedRun } from "./ux-m3-pins.mjs";
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

function shareJourney(locale, variants) {
  return {
    name: `screenshots (${locale}): save current design with unsaved edits and a rename, export and import, and the saved result`,
    async run({ page, host, url, shotsDir }) {
      if (!shotsDir) return;
      const team = await host.library.seedUser("Team release", {
        base: "agent-assisted",
        versions: 2,
      });
      await boot(page, host, url);
      if (locale !== "en-US") {
        await setState(page, { locale });
        await T(page, "graph-new-run-pane").waitFor();
      }
      await selectValue(page, "graph-library-entry", team.id);
      await T(page, "graph-template-parameter-request").fill("Tidy the release notes");
      await T(page, "graph-library-instantiate").click();
      await T(page, "graph-design-origin").waitFor();
      await page.evaluate(() => window.__harness.editDesignName("A", "Release notes (edited)"));
      await openLibrary(page);
      await openShare(page);
      await T(page, "graph-library-name").fill("Release notes (edited)");
      await T(page, "graph-library-capture").click();
      await T(page, "graph-save-reviewed").click();
      await T(page, "graph-share-save-design").scrollIntoViewIfNeeded();
      await variants(page, shotsDir, "m3-share-save", locale, async () => {
        await T(page, "graph-share-save-design").scrollIntoViewIfNeeded();
      });
      await T(page, "graph-save-confirm").click();
      await T(page, "graph-library-result").waitFor();
      await variants(page, shotsDir, "m3-share-result", locale, async () => {
        await scrollDialogTop(page);
      });
      await T(page, "graph-library-export").click();
      await T(page, "graph-export-reviewed").click();
      await variants(page, shotsDir, "m3-share-export", locale, async () => {
        await T(page, "graph-share-export").scrollIntoViewIfNeeded();
      });
      await page.keyboard.press("Escape");
    },
  };
}

function pinJourney(locale, variants) {
  return {
    name: `screenshots (${locale}): a historical pin that is no longer offered, and what Continue carried over`,
    async run({ page, host, url, shotsDir }) {
      if (!shotsDir) return;
      await host.seedRecipes("A", ALL_CHECKS);
      host.setRuns("A", [
        pinnedRun("run-historical", {
          templateId: "generic",
          name: "Sequential engineering",
          parameters: { request: "Fix the request parser", oldFlag: true },
          bindings: {
            references: { instructions: "docs/Context.md", notes: "docs/Notes.md" },
            recipes: { build: "build-main", test: "test-unit", lint: "lint-main" },
            sourcePaths: [],
          },
          references: [
            { id: "instructions", kind: "instruction", nodeIds: [] },
            { id: "notes", kind: "document", nodeIds: [] },
          ],
        }),
      ]);
      await boot(page, host, url);
      if (locale !== "en-US") {
        await setState(page, { locale });
        await T(page, "graph-new-run-pane").waitFor();
      }
      await page.locator('[data-testid="graph-run"][data-run-id="run-historical"]').click();
      await T(page, "graph-run-again").click();
      await T(page, "graph-historical-pin").waitFor();
      await variants(page, shotsDir, "m3-pin-notice", locale, async () => {
        await T(page, "graph-historical-pin").scrollIntoViewIfNeeded();
      });
      await T(page, "graph-historical-pin-continue").click();
      await T(page, "graph-carry-report").waitFor();
      await variants(page, shotsDir, "m3-pin-carried", locale, async () => {
        await T(page, "graph-carry-report").scrollIntoViewIfNeeded();
      });
    },
  };
}

export const m3ShotScenarios = [
  pinJourney("en-US", everyVariant),
  pinJourney("zh-CN", oneVariant),
  libraryJourney("en-US", everyVariant),
  libraryJourney("zh-CN", oneVariant),
  shareJourney("en-US", everyVariant),
  shareJourney("zh-CN", oneVariant),
];
