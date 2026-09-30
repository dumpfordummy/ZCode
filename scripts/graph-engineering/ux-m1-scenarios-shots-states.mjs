// UX-M1.3 screenshots: blocked reasons beside the action, a preflight error, ready to review, Needs-you
// scope, distinguishable run states and keyboard focus. Each image is inspected by eye before it is committed.
import { addByKeyboard } from "./context-picker-helpers.mjs";
import {
  REQUEST,
  SIZES,
  T,
  assertClean,
  boot,
  chooseChecks,
  flush,
  pressUntilFocused,
  recipesReady,
  selectValue,
  setState,
  shot,
  until,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS } from "./ux-m1-checks.mjs";
import {
  completedRun,
  failedTestRun,
  malformedReviewerRun,
  permissionWaitRun,
  validReviewerRun,
} from "./ux-m1-runs.mjs";

const bottom = (page) =>
  page.evaluate(() => {
    const scroller = document.querySelector("[data-view]");
    scroller.scrollTop = scroller.scrollHeight;
  });
const fillSlot = async (page) => {
  await T(page, "graph-template-parameter-request").fill(REQUEST);
  await T(page, "graph-template-parameter-targetEngine").fill("Engine X");
  await T(page, "graph-template-parameter-criteria").fill("Spin outcomes match the rules");
  for (const id of ["normal", "free", "bonus", "respin"])
    await T(page, `graph-template-parameter-${id}`).click();
  await chooseChecks(page, { build: "build-main", test: "test-unit" });
};

const actionStates = {
  name: "screenshots: missing required context, preflight error and ready to review (1280x720 and 1920x1080, dark and light)",
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    await page.setViewportSize(SIZES[0]);
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url);
    await selectValue(page, "graph-library-entry", "slot");
    await recipesReady(page);
    await fillSlot(page);
    await bottom(page);
    await shot(page, shotsDir, "m1-blocked-required-context", SIZES[0]);
    await setState(page, { theme: "zai-light" });
    await shot(page, shotsDir, "m1-blocked-required-context-light", SIZES[0]);
    await setState(page, { theme: "zai-dark" });
    await addByKeyboard(page, "GameDoc", "gameDoc");
    await until(async () => !(await T(page, "graph-review-run").isDisabled()), "Review available");
    host.fail("wf.prepare", "Preflight could not read the native environment for this workspace.");
    await T(page, "graph-review-run").click();
    await T(page, "graph-new-run-error").waitFor();
    await bottom(page);
    await shot(page, shotsDir, "m1-preflight-error", SIZES[0]);
    host.fail("wf.prepare");
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await flush(page);
      await shot(page, shotsDir, "m1-ready-to-review", size);
    }
    await setState(page, { theme: "zai-light" });
    await shot(page, shotsDir, "m1-ready-to-review-light", SIZES[0]);
    assertClean(host);
  },
};

const needsYou = {
  name: "screenshots: Needs-you scope with the waiting run off the history page, the focused run summary, and Chinese (1280x720)",
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    await page.setViewportSize(SIZES[0]);
    const many = Array.from({ length: 25 }, (_, index) => completedRun(`run-old-${index}`));
    host.setRuns("A", [...many, permissionWaitRun("run-far")]);
    await boot(page, host, url);
    await T(page, "graph-needs-you").waitFor();
    await shot(page, shotsDir, "m1-needs-you-scope", SIZES[0]);
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-needs-you-scope").waitFor();
    await shot(page, shotsDir, "m1-needs-you-scope-zh", SIZES[0]);
    await setState(page, { locale: "en-US" });
    await T(page, "graph-needs-you-go").focus();
    await page.keyboard.press("Enter");
    await T(page, "graph-run-summary").waitFor();
    await flush(page);
    await shot(page, shotsDir, "m1-run-focus", SIZES[0]);
    await pressUntilFocused(page, "graph-new-run", "Shift+Tab");
    await shot(page, shotsDir, "m1-new-run-focus", SIZES[0]);
    assertClean(host);
  },
};

const runStates = {
  name: "screenshots: failed Test, malformed reviewer output and a valid reviewer decision (1280x720, English and Chinese)",
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    await page.setViewportSize(SIZES[0]);
    const runs = [failedTestRun(), malformedReviewerRun(), validReviewerRun("needs_changes")];
    host.setRuns("A", runs);
    await boot(page, host, url);
    for (const [id, name] of [
      ["run-failed-test", "m1-state-failed-test"],
      ["run-malformed-reviewer", "m1-state-malformed-reviewer"],
      ["run-valid-needs_changes", "m1-state-valid-decision"],
    ]) {
      await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).click();
      await until(
        async () => (await T(page, "graph-run-summary").getAttribute("data-run-id")) === id,
        id,
      );
      await flush(page);
      await shot(page, shotsDir, name, SIZES[0]);
    }
    await setState(page, { locale: "zh-CN" });
    await page.locator('[data-testid="graph-run"][data-run-id="run-malformed-reviewer"]').click();
    await until(
      async () =>
        (await T(page, "graph-run-summary").getAttribute("data-run-id")) ===
        "run-malformed-reviewer",
      "zh",
    );
    await flush(page);
    await shot(page, shotsDir, "m1-state-malformed-reviewer-zh", SIZES[0]);
    assertClean(host);
  },
};

export const stateShotScenarios = [actionStates, needsYou, runStates];
