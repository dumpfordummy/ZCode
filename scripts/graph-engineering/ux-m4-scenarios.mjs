// UX-M4 scenarios: populated states of the Focus-page visual system. Fixture data, real components.
import { SIZES, flush, preparedDraft, setState, shot } from "./ux-m1-helpers.mjs";
import { approvalWaitRun, completedRun, failedTestRun, permissionWaitRun } from "./ux-m1-runs.mjs";
import { T, openLibrary } from "./ux-m3-helpers.mjs";

const QUICK = process.env.M4_QUICK === "1";
const THEMES = QUICK ? ["zai-dark"] : ["zai-dark", "zai-light"];
const SIZE_LIST = QUICK ? [SIZES[0]] : SIZES;
const BASE = Date.UTC(2026, 8, 30, 8, 0, 0);
const runs = (extra = []) => [
  ...extra,
  ...Array.from({ length: 6 }, (_, index) => {
    const run = completedRun(`run-hist-${index}`);
    run.createdAt = BASE + index * 60_000;
    return run;
  }),
];

async function frames(page, dir, name, locale, prepare) {
  for (const theme of THEMES) {
    await setState(page, { theme });
    for (const size of SIZE_LIST) {
      await page.setViewportSize(size);
      if (prepare) await prepare();
      await page.evaluate(() => {
        for (const node of document.querySelectorAll("[data-view], [data-testid=graph-library-dialog]"))
          node.scrollTop = 0;
      });
      await page.mouse.move(0, 0);
      await flush(page);
      await shot(page, dir, `${name}-${locale}-${theme.replace("zai-", "")}`, size);
    }
  }
}
const pick = async (page, id) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).first().click();
  await T(page, "graph-run-summary").waitFor();
};

const scenario = (locale) => ({
  name: `captures (${locale}): new run, permission wait, failed Test, final approval, library`,
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    const waiting = permissionWaitRun("run-waiting");
    waiting.createdAt = BASE + 99 * 60_000;
    host.setRuns(
      "A",
      runs([failedTestRun("run-failed"), approvalWaitRun("run-approval"), waiting]),
    );
    await preparedDraft(page, host, url);
    if (locale !== "en-US") {
      await setState(page, { locale });
      await T(page, "graph-new-run-pane").waitFor();
    }
    await frames(page, shotsDir, "m4-new-run-occupied", locale);
    await pick(page, "run-waiting");
    await frames(page, shotsDir, "m4-run-permission", locale);
    await pick(page, "run-failed");
    await frames(page, shotsDir, "m4-run-failed", locale);
    await pick(page, "run-approval");
    await frames(page, shotsDir, "m4-run-approval", locale);
    await openLibrary(page);
    await frames(page, shotsDir, "m4-library", locale);
  },
});

export const uxM4Scenarios = [scenario("en-US"), ...(QUICK ? [] : [scenario("zh-CN")])];
