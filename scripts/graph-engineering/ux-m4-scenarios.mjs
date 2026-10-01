// UX-M4 scenarios: populated states of the Focus-page visual system. Fixture data, real components.
import {
  SIZES,
  editCheckByKeyboard,
  flush,
  preparedDraft,
  setState,
  shot,
} from "./ux-m1-helpers.mjs";
import { approvalWaitRun, completedRun, failedTestRun, permissionWaitRun } from "./ux-m1-runs.mjs";
import { T, boot, openLibrary, selectValue } from "./ux-m3-helpers.mjs";
import { checkScenarios } from "./ux-m4-scenarios-checks.mjs";
import { contrastScenario } from "./ux-m4-scenarios-contrast.mjs";
import { disclosureScenarios } from "./ux-m4-scenarios-disclosure.mjs";

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

async function frames(page, dir, name, locale, prepare, scroll = 0) {
  for (const theme of THEMES) {
    await setState(page, { theme });
    for (const size of SIZE_LIST) {
      await page.setViewportSize(size);
      if (prepare) await prepare();
      await page.evaluate((top) => {
        window.scrollTo(0, 0);
        for (const node of document.querySelectorAll(
          "[data-view], [data-testid=graph-library-dialog], [data-testid=graph-run-history]",
        ))
          node.scrollTop = 0;
        const view = document.querySelector("[data-view]");
        if (view) view.scrollTop = top;
      }, scroll);
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

const readyScenario = (locale) => ({
  name: `captures (${locale}): new run ready to review`,
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    host.setRuns("A", runs([failedTestRun("run-failed")]));
    await preparedDraft(page, host, url);
    if (locale !== "en-US") {
      await setState(page, { locale });
      await T(page, "graph-new-run-pane").waitFor();
    }
    await frames(page, shotsDir, "m4-new-run", locale);
    await frames(page, shotsDir, "m4-new-run-lower", locale, undefined, 640);
    // Checks：从所选检查进入编辑器，未保存的修改出现变更摘要，返回栏保持可见
    await editCheckByKeyboard(page, "test");
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (edited)");
    await frames(page, shotsDir, "m4-checks-editor", locale);
    await frames(page, shotsDir, "m4-checks-editor-lower", locale, undefined, 100000);
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-new-run-pane").waitFor();
    // 预检与确认：冻结快照、确认事项与唯一的粘性提交栏
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    await frames(page, shotsDir, "m4-preflight", locale);
    await frames(page, shotsDir, "m4-preflight-lower", locale, undefined, 100000);
  },
});

const scenario = (locale) => ({
  name: `captures (${locale}): new run occupied, permission wait, failed Test, final approval, library`,
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
    await frames(page, shotsDir, "m4-run-permission-lower", locale, undefined, 560);
    await pick(page, "run-failed");
    await frames(page, shotsDir, "m4-run-failed", locale);
    await pick(page, "run-approval");
    await frames(page, shotsDir, "m4-run-approval", locale);
    // 最终人工批准：从横幅里的主操作进入，证据在下方全宽显示
    await T(page, "graph-run-review-gate").click();
    await T(page, "graph-approval-request").waitFor();
    await frames(page, shotsDir, "m4-approval-inspect", locale, undefined, 100000);
    // 披露区：运行检查器里的技术性披露栈（逐个展开，结构化事实在前，原始记录在其下）
    await page.locator('[data-testid="graph-run-tab-steps"]').click();
    for (const id of [
      "graph-routing-iterations",
      "graph-routing-checkpoints",
      "graph-frozen-provenance",
    ])
      if (await T(page, id).count()) await T(page, id).locator(":scope > summary").click();
    await page.locator('[data-testid="graph-select-node-task"]').first().click();
    await page
      .locator("summary", { hasText: /Technical identities|技术标识/ })
      .first()
      .click();
    await frames(page, shotsDir, "m4-disclosures-run", locale, undefined, 760);
    await openLibrary(page);
    await frames(page, shotsDir, "m4-library", locale);
  },
});

const LONG_NAME =
  "Quarterly payment reconciliation and refund audit workflow for the regional finance engineering group";
const LONG_REQUEST =
  "Investigate why the nightly payment reconciliation job double counts partially refunded orders when the refund arrives after the settlement window closes, then add a regression test that reproduces it with the anonymised fixture data and explain which ledger entry is written twice. Keep the public API unchanged and do not touch the billing exports.\n\nAcceptance: the reconciliation totals match the ledger for every fixture order, the new test fails before the fix and passes after it, and the change is limited to the reconciliation module.";

// 压力状态：超长名称与请求、多个上下文槽位与检查、缺少必填值、准备就绪。
const stressScenario = (locale) => ({
  name: `captures (${locale}): long names and request, several context slots and checks, missing required values`,
  async run({ page, host, url, shotsDir }) {
    if (!shotsDir) return;
    const user = await host.library.seedUser(LONG_NAME, { base: "slot", versions: 3 });
    const history = runs([]).map((run, index) => {
      run.startInput = `${LONG_REQUEST.slice(0, 90 + index * 25)}`;
      return run;
    });
    host.setRuns("A", history);
    await boot(page, host, url);
    if (locale !== "en-US") {
      await setState(page, { locale });
      await T(page, "graph-new-run-pane").waitFor();
    }
    await selectValue(page, "graph-library-entry", user.id);
    await T(page, "graph-template-parameter-request").fill(LONG_REQUEST);
    await frames(page, shotsDir, "m4-stress-missing", locale);
    await frames(page, shotsDir, "m4-stress-missing-lower", locale, undefined, 900);
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", user.id);
    await frames(page, shotsDir, "m4-stress-library", locale);
  },
});

export const uxM4Scenarios = [
  ...checkScenarios,
  contrastScenario,
  ...disclosureScenarios,
  readyScenario("en-US"),
  scenario("en-US"),
  stressScenario("en-US"),
  ...(QUICK ? [] : [readyScenario("zh-CN"), scenario("zh-CN"), stressScenario("zh-CN")]),
];
