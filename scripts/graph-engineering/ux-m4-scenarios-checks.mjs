// UX-M4 functional checks (real components, fixture Host). These assert the contracts the Focus-page
// system must keep: one header, one action instance, one explanation per state, the decision inside
// the banner or the action bar (never in a tab), drafts and previews surviving tab changes, scoped
// tokens. Not Windows native acceptance and not the user's visual acceptance.
import assert from "node:assert/strict";
import {
  SIZES,
  admissionCalls,
  assertClean,
  flush,
  focused,
  preparedDraft,
  setState,
  until,
} from "./ux-m1-helpers.mjs";
import {
  approvalWaitRun,
  completedRun,
  failedTestRun,
  permissionWaitRun,
  questionWaitRun,
} from "./ux-m1-runs.mjs";
import { T, boot, openLibrary, openVersions, selectValue } from "./ux-m3-helpers.mjs";

const pick = async (page, id) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).first().click();
  await T(page, "graph-run-summary").waitFor();
};
const banner = (page) => T(page, "graph-run-banner");
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, " ").trim();

const header = {
  name: "one header: a single tab row with aria-current and the next-run context (model, mode, saved checks) on every destination",
  async run({ page, host, url }) {
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    for (const mode of ["runs", "design", "setup"]) {
      await T(page, `graph-view-${mode}`).click();
      const current = await page
        .locator('[data-testid^="graph-view-"][aria-current="page"]')
        .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
      assert.deepEqual(current, [`graph-view-${mode}`]);
      assert.match(await text(T(page, "graph-context-label")), /For the next run/);
      assert.ok((await text(T(page, "graph-context-model"))).includes("fixture"), "model is shown");
      assert.ok(await text(T(page, "graph-context-mode")), "mode is shown");
      assert.match(await text(T(page, "graph-context-checks")), /saved/);
    }
    // 上下文条与标签在同一行的容器里：不再有单独的“说明”行
    const same = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="graph-context-bar"]');
      const tab = document.querySelector('[data-testid="graph-view-runs"]');
      return Math.abs(bar.getBoundingClientRect().top - tab.getBoundingClientRect().top) < 40;
    });
    assert.ok(same, "context sits in the tab row");
    await T(page, "graph-view-runs").click();
    await T(page, "graph-context-checks").click();
    assert.equal(await T(page, "graph-view-setup").getAttribute("aria-current"), "page");
    assertClean(host);
  },
};

const newRunActions = {
  name: "New run: one action bar; ready text only when Review is possible; an occupied workspace shows a blocked Review, View current run and keeps the draft",
  async run({ page, host, url }) {
    await page.setViewportSize(SIZES[0]);
    host.setRuns("A", [failedTestRun("run-old")]);
    await preparedDraft(page, host, url);
    assert.equal(await T(page, "graph-review-run").count(), 1, "one Review and run");
    assert.equal(await T(page, "graph-review-run").isDisabled(), false);
    assert.match(await text(T(page, "graph-new-run-ready")), /Nothing starts until you confirm/);
    assert.equal(await T(page, "graph-new-run-blocked").count(), 0);
    // 占用：新的等待中运行出现
    host.setRuns("A", [permissionWaitRun("run-wait"), failedTestRun("run-old")]);
    await T(page, "graph-view-setup").click();
    await T(page, "graph-view-runs").click();
    await T(page, "graph-new-run").click();
    await T(page, "graph-new-run-blocked").waitFor();
    assert.equal(await T(page, "graph-review-run").isDisabled(), true, "Review is blocked");
    assert.equal(await T(page, "graph-new-run-ready").count(), 0, "no ready text beside a block");
    assert.equal(
      await T(page, "graph-new-run-blocked").getAttribute("data-blocked-by"),
      "run-active",
    );
    await T(page, "graph-view-current-run").waitFor();
    assert.match(
      await T(page, "graph-template-parameter-request").inputValue(),
      /\S/,
      "the draft is kept",
    );
    assert.deepEqual(admissionCalls(host), [], "nothing was admitted");
    // 现有运行结束后不会自动开始，Review 重新可用
    host.resolveRuns("A");
    await until(async () => !(await T(page, "graph-review-run").isDisabled()), "Review available");
    assert.deepEqual(admissionCalls(host), [], "no automatic start");
    assertClean(host);
  },
};

const permission = {
  name: "a permission wait: the banner states the permission once, owns the one primary action, and the facts stay present but quiet",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun("run-wait")]);
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    await pick(page, "run-wait");
    const summary = await text(T(page, "graph-run-summary"));
    const help = summary.match(/Answer the permission in this exact native conversation/g) ?? [];
    assert.equal(help.length, 1, "the permission sentence appears once");
    assert.equal(await banner(page).getAttribute("data-tone"), "warning");
    assert.equal(
      await banner(page).locator('[data-variant="default"]').count(),
      1,
      "exactly one accent-filled action in the banner",
    );
    assert.equal(await T(page, "graph-run-open-native").getAttribute("data-variant"), "default");
    for (const id of ["graph-run-execution", "graph-run-evidence", "graph-run-human"])
      assert.equal(await T(page, id).count(), 1, id);
    assert.equal(
      await T(page, "graph-run-execution").getAttribute("data-state"),
      "WaitingForPermission",
    );
    assert.equal(
      await T(page, "graph-run-summary").locator('[data-testid="graph-run-request"]').count(),
      0,
    );
    assertClean(host);
  },
};

const failure = {
  name: "a failed Test: the banner is the failure treatment, names the next action and never implies an approval is pending",
  async run({ page, host, url }) {
    host.setRuns("A", [failedTestRun("run-failed")]);
    await boot(page, host, url);
    await pick(page, "run-failed");
    assert.equal(await banner(page).getAttribute("data-tone"), "danger");
    const bannerText = await text(banner(page));
    assert.match(bannerText, /Test failed/);
    assert.match(bannerText, /No approval was requested/);
    assert.equal(
      await T(page, "graph-run-inspect-failure").getAttribute("data-variant"),
      "default",
    );
    const human = await text(T(page, "graph-run-human"));
    assert.match(human, /Not requested/);
    assert.doesNotMatch(human, /Pending/);
    assert.equal(await T(page, "graph-run-human").getAttribute("data-state"), "not-requested");
    assertClean(host);
  },
};

const approval = {
  name: "a final approval: the banner's primary action opens the inspector in the Steps tab from any tab, and Approve and Reject live in one bar with their reason",
  async run({ page, host, url }) {
    host.setRuns("A", [approvalWaitRun("run-approval")]);
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    await pick(page, "run-approval");
    assert.equal(await banner(page).getAttribute("data-tone"), "warning");
    assert.equal(await T(page, "graph-run-review-gate").getAttribute("data-variant"), "default");
    await T(page, "graph-run-tab-evidence").click();
    assert.equal(await T(page, "graph-approval-request").count(), 0, "not in the Evidence tab");
    await T(page, "graph-run-review-gate").click();
    await T(page, "graph-approval-request").waitFor();
    assert.equal(await T(page, "graph-run-tab-steps").getAttribute("aria-selected"), "true");
    const commit = T(page, "graph-approval-commit");
    assert.equal(await commit.locator('[data-testid="graph-approval-approve"]').count(), 1);
    assert.equal(await commit.locator('[data-testid="graph-approval-reject"]').count(), 1);
    assert.equal(await T(page, "graph-approval-approve").count(), 1, "one Approve in the page");
    // 被阻止的原因在同一栏里（此处证据未完整或无请求时）
    const blocked = T(page, "graph-approval-blocked");
    if (await blocked.count())
      assert.equal(await commit.locator('[data-testid="graph-approval-blocked"]').count(), 1);
    assertClean(host);
  },
};

const tabs = {
  name: "run detail has one level of named tabs with the tab pattern (arrow keys), and the former disclosures are panels",
  async run({ page, host, url }) {
    host.setRuns("A", [failedTestRun("run-failed")]);
    await boot(page, host, url);
    await pick(page, "run-failed");
    const names = await page
      .locator('[role="tablist"] [role="tab"]')
      .evaluateAll((items) => items.map((item) => item.textContent));
    assert.deepEqual(names, ["Steps", "Request and result", "Evidence", "Technical details"]);
    assert.equal(await T(page, "graph-run-steps").count(), 1, "Steps is the default");
    await T(page, "graph-run-tab-steps").focus();
    await page.keyboard.press("ArrowRight");
    await T(page, "graph-run-request").waitFor();
    assert.equal(await T(page, "graph-run-tab-request").getAttribute("aria-selected"), "true");
    assert.match(await text(T(page, "graph-run-request")), /Captured request of the current run/);
    await page.keyboard.press("ArrowRight");
    await T(page, "graph-run-captured-changes").waitFor();
    assert.equal(await T(page, "graph-run-checks").count(), 1);
    assert.equal(await T(page, "graph-run-captured-changes").count(), 1);
    await page.keyboard.press("ArrowRight");
    await T(page, "graph-run-summary-snapshot").waitFor();
    assert.ok((await T(page, "graph-run-summary-snapshot").innerText()).includes("execution"));
    assert.equal(await page.locator("details details").count(), 0, "no nested disclosures");
    // 决定所需的内容（横幅与操作）不在任何标签里
    assert.equal(await T(page, "graph-run-summary").locator('[role="tabpanel"]').count(), 0);
    assertClean(host);
  },
};

const strip = {
  name: "the step strip lists the visited steps in order, marks the current one, and opens a step in the Steps tab",
  async run({ page, host, url }) {
    host.setRuns("A", [approvalWaitRun("run-approval")]);
    await boot(page, host, url);
    await pick(page, "run-approval");
    const steps = await page
      .locator('[data-testid="graph-strip-step"]')
      .evaluateAll((items) =>
        items.map((item) => [item.getAttribute("data-node-id"), item.getAttribute("data-current")]),
      );
    const trail = await page
      .locator('[data-testid="graph-run-trail"] [data-testid^="graph-select-node-"]')
      .count();
    assert.ok(steps.length >= 2, "at least the visited steps");
    assert.ok(steps.length <= trail, "no invented steps");
    assert.equal(steps.filter(([, current]) => current === "true").length, 1, "one current step");
    await T(page, "graph-run-tab-technical").click();
    await page.locator('[data-testid="graph-strip-step"]').first().click();
    assert.equal(await T(page, "graph-run-tab-steps").getAttribute("aria-selected"), "true");
    assertClean(host);
  },
};

const libraryFailure = {
  name: "library: a failure renders beside the tabs with Refresh, a previous success is gone, and drafts survive a tab change",
  async run({ page, host, url }) {
    const entry = await host.library.seedUser("Team release", { base: "generic", versions: 1 });
    await boot(page, host, url);
    await page.setViewportSize(SIZES[0]);
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", entry.id);
    await openVersions(page);
    await T(page, "graph-library-duplicate-name").fill("First copy");
    await T(page, "graph-library-duplicate").click();
    await T(page, "graph-library-result").waitFor();
    // 换标签再回来：没有提交的名称草稿仍在
    await T(page, "graph-library-duplicate-name").fill("Second copy");
    await T(page, "graph-library-tab-share").click();
    await T(page, "graph-library-tab-versions").click();
    assert.equal(await T(page, "graph-library-duplicate-name").inputValue(), "Second copy");
    await host.library.externalChange();
    await T(page, "graph-library-duplicate").click();
    await T(page, "graph-library-error").waitFor();
    assert.equal(await T(page, "graph-library-result").count(), 0, "the old success is gone");
    const related = await page.evaluate(() => {
      const error = document.querySelector('[data-testid="graph-library-error"]');
      const tabs = document
        .querySelector('[data-testid="graph-library-tab-versions"]')
        .closest('[role="tablist"]');
      return error.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    assert.ok(related, "the error sits directly above the tabs");
    await T(page, "graph-library-error-refresh").click();
    await until(async () => (await T(page, "graph-library-error").count()) === 0, "cleared");
    assertClean(host);
  },
};

const layout = {
  name: "layout: no horizontal overflow, the New run column keeps at least 30rem at 1280px, the rail stays within 17rem, and Graph tokens do not leak",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await flush(page);
      const metrics = await page.evaluate(() => {
        const view = document.querySelector("[data-view]");
        const pane = document
          .querySelector('[data-testid="graph-new-run-pane"]')
          .getBoundingClientRect();
        const rail = document
          .querySelector('[data-testid="graph-run-history"], [data-testid="graph-new-run"]')
          ?.closest("nav")
          ?.getBoundingClientRect();
        return {
          overflow: view.scrollWidth - view.clientWidth,
          pane: pane.width,
          rail: rail?.width ?? 0,
          rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        };
      });
      assert.ok(metrics.overflow <= 1, `no horizontal overflow at ${size.width}`);
      assert.ok(metrics.pane >= 30 * metrics.rem, `task column ${metrics.pane}px at ${size.width}`);
      assert.ok(metrics.rail <= 17 * metrics.rem + 1, `rail ${metrics.rail}px at ${size.width}`);
    }
    // 令牌只在 Graph 范围内：Graph 面板外的元素仍读到共享令牌
    for (const theme of ["zai-dark", "zai-light"]) {
      await setState(page, { theme });
      const read = await page.evaluate(() => {
        const probe = document.createElement("div");
        document.body.append(probe);
        const outside = getComputedStyle(probe).getPropertyValue("--color-background").trim();
        probe.remove();
        const inside = getComputedStyle(
          document.querySelector('[data-testid="graph-engineering-panel"]'),
        )
          .getPropertyValue("--color-background")
          .trim();
        return { outside, inside };
      });
      assert.notEqual(read.outside, read.inside, `${theme}: scoped`);
      assert.equal(
        read.outside,
        theme === "zai-dark" ? "#161616" : "#f8f8f8",
        `${theme}: shared token intact`,
      );
    }
    assertClean(host);
  },
};

const questionBanner = {
  name: "a question wait and a completed run get their own banner tones without a permission sentence",
  async run({ page, host, url }) {
    host.setRuns("A", [questionWaitRun("run-question"), completedRun("run-done")]);
    await boot(page, host, url);
    await pick(page, "run-question");
    assert.equal(await banner(page).getAttribute("data-tone"), "warning");
    assert.equal(await T(page, "graph-run-permission").count(), 0);
    await pick(page, "run-done");
    assert.equal(await banner(page).getAttribute("data-tone"), "success");
    assert.equal((await focused(page)) !== undefined, true);
    assertClean(host);
  },
};

export const checkScenarios = [
  header,
  newRunActions,
  permission,
  failure,
  approval,
  tabs,
  strip,
  libraryFailure,
  layout,
  questionBanner,
];
