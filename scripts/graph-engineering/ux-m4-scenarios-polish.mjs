// UX-M4 final polish checks (real components, fixture Host): the library footer speaks about the
// operation (not New-run review), the Needs-you strip is a quiet pointer for the open run, and a Test
// failure that never reached approval is worded literally. Not the user's visual acceptance.
import assert from "node:assert/strict";
import { SIZES, assertClean, setState, until } from "./ux-m1-helpers.mjs";
import { approvalWaitRun, failedTestRun, permissionWaitRun } from "./ux-m1-runs.mjs";
import { T, boot, openLibrary, selectValue } from "./ux-m3-helpers.mjs";

const pick = async (page, id) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).first().click();
  await T(page, "graph-run-summary").waitFor();
};
const banner = (page) => T(page, "graph-run-banner");
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, " ").trim();

// 页脚里不得出现新建运行的审阅措辞（“Open in Runs”的固定说明里的 reviewed 不算）。
const REVIEW_LANGUAGE = /Not ready to review|ready to review|Review and run/i;
const NEW_RUN_LANGUAGE = /Not ready to review|ready to review|Review and run|Go to first field/i;

const libraryFooter = {
  name: "library footer: browsing Versions never shows New-run review language; a blocked Load into design is framed as that operation, with Open Use",
  async run({ page, host, url }) {
    const user = await host.library.seedUser("Slot flow", { base: "slot", versions: 1 });
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    await selectValue(page, "graph-library-entry", user.id);
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", user.id);
    const footer = T(page, "graph-library-footer");
    await T(page, "graph-new-run-blocked").waitFor();
    const versionsText = await text(footer);
    assert.doesNotMatch(versionsText, NEW_RUN_LANGUAGE, versionsText);
    assert.match(versionsText, /\d+ required fields? needs? configuration in Use/);
    assert.equal(await T(page, "graph-go-to-first-field").count(), 0);
    assert.equal(
      await T(page, "graph-library-instantiate").isDisabled(),
      true,
      "the blocker is kept",
    );
    assert.equal(await T(page, "graph-new-run-blocked").getAttribute("data-blocked-by"), "fields");
    // 打开“使用”：切到使用标签；在使用标签里字段级的就绪在页面内，页脚用“前往第一个字段”
    await T(page, "graph-library-open-use").click();
    assert.equal(await T(page, "graph-library-tab-use").getAttribute("aria-selected"), "true");
    assert.equal(await T(page, "graph-library-open-use").count(), 0);
    assert.doesNotMatch(await text(footer), REVIEW_LANGUAGE);
    assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
    // 其它标签（分享、高级）同样不出现新建运行的措辞
    await T(page, "graph-library-tab-share").click();
    assert.doesNotMatch(await text(footer), NEW_RUN_LANGUAGE);
    assert.equal(await T(page, "graph-library-open-use").count(), 1);
    await T(page, "graph-library-tab-advanced").click();
    assert.doesNotMatch(await text(footer), NEW_RUN_LANGUAGE);
    // 一个运行占用工作区：同样按“载入设计”的口径说明
    host.setRuns("A", [permissionWaitRun("run-wait")]);
    await page.keyboard.press("Escape");
    await T(page, "graph-view-setup").click();
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", user.id);
    await T(page, "graph-new-run-blocked").waitFor();
    const occupied = await text(footer);
    assert.match(occupied, /Load into design is unavailable while a run owns this workspace/);
    assert.doesNotMatch(occupied, REVIEW_LANGUAGE);
    assert.equal(await T(page, "graph-library-instantiate").isDisabled(), true);
    assertClean(host);
  },
};

const quietNeedsYou = {
  name: "Needs-you: a quiet pointer when the waiting run is the open run (no second action, no second primary), the full strip when attention is elsewhere",
  async run({ page, host, url }) {
    const wait = permissionWaitRun("run-wait");
    const approval = approvalWaitRun("run-approval");
    host.setRuns("A", [wait]);
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    await pick(page, "run-wait");
    const strip = T(page, "graph-needs-you");
    assert.equal(await strip.getAttribute("data-quiet"), "true");
    assert.equal(await strip.getAttribute("data-run-id"), "run-wait");
    assert.equal(await T(page, "graph-needs-you-conversation").count(), 0, "no second action");
    assert.equal(
      await strip.locator('[data-variant="default"]').count(),
      0,
      "no primary in the strip",
    );
    assert.equal(
      await T(page, "graph-run-open-native").count(),
      1,
      "the banner owns Open conversation",
    );
    assert.equal(
      await page
        .locator('[data-variant="default"]:visible')
        .filter({ hasText: /Open (existing native )?conversation/ })
        .count(),
      1,
    );
    assert.match(await text(strip), /waiting for you/);
    assert.equal(await T(page, "graph-needs-you-scope").count(), 1, "the scope note stays");
    assert.equal(await T(page, "graph-needs-you-go").count(), 1, "navigation stays");
    // 注意力在别处：另一个运行也在等待，条带指向它，完整显示
    host.setRuns("A", [wait, approval]);
    await until(
      async () => (await T(page, "graph-needs-you").getAttribute("data-run-id")) === "run-approval",
      "strip points elsewhere",
    );
    assert.equal(await T(page, "graph-needs-you").getAttribute("data-quiet"), null);
    assert.equal(await T(page, "graph-needs-you-go").count(), 1);
    // 不在任何运行页上：完整条带，和以前一样
    await T(page, "graph-new-run").click();
    assert.equal(await T(page, "graph-needs-you").getAttribute("data-quiet"), null);
    assertClean(host);
  },
};

const failedWording = {
  name: "a Test failure that never reached approval reads Stopped after Test failure in the facts and the list, in English and Chinese, with the stored facts untouched",
  async run({ page, host, url }) {
    host.setRuns("A", [failedTestRun("run-failed")]);
    await boot(page, host, url);
    await pick(page, "run-failed");
    const execution = await text(T(page, "graph-run-execution"));
    assert.match(execution, /Stopped after Test failure/);
    assert.doesNotMatch(execution, /human review/i);
    assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), "NeedsHuman");
    assert.match(await text(T(page, "graph-run-human")), /Not requested/);
    assert.match(await text(banner(page)), /no reviewer was started/i);
    const row = page.locator('[data-testid="graph-run"][data-run-id="run-failed"]');
    assert.equal(
      await row.getAttribute("data-status"),
      "NeedsHuman",
      "the stored status is unchanged",
    );
    assert.match(await text(row), /Stopped after Test failure/);
    await setState(page, { locale: "zh-CN" });
    await pick(page, "run-failed");
    assert.match(await text(T(page, "graph-run-execution")), /测试失败后停止/);
    assert.doesNotMatch(await text(T(page, "graph-run-execution")), /人工审阅/);
    // 真实运行里最终闸门的尝试存在但被跳过（Skipped，没有请求）：措辞相同，存储的状态不变
    const skipped = failedTestRun("run-failed-skipped");
    const gate = { ...approvalWaitRun("x").approvalAttempts[0], status: "Skipped" };
    delete gate.request;
    delete gate.decision;
    skipped.approvalAttempts = [gate];
    host.setRuns("A", [skipped]);
    await pick(page, "run-failed-skipped");
    assert.match(await text(T(page, "graph-run-execution")), /测试失败后停止/);
    assert.equal(await T(page, "graph-run-execution").getAttribute("data-state"), "NeedsHuman");
    // 其它停止原因保持原措辞：到达了审批但等待中的运行不受影响
    host.setRuns("A", [approvalWaitRun("run-approval")]);
    await pick(page, "run-approval");
    assert.doesNotMatch(await text(T(page, "graph-run-execution")), /测试失败后停止/);
    assertClean(host);
  },
};

export const polishScenarios = [libraryFooter, quietNeedsYou, failedWording];
