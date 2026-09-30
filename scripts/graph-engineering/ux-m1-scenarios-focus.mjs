// UX-M1.3 browser scenarios: keyboard journey and focus, late replies, Needs-you scope.
import assert from "node:assert/strict";
import {
  T,
  admissionCalls,
  assertClean,
  boot,
  flush,
  focused,
  hasFocusTreatment,
  preparedDraft,
  pressUntilFocused,
  started,
  templateDraft,
  until,
} from "./ux-m1-helpers.mjs";
import { completedRun, permissionWaitRun } from "./ux-m1-runs.mjs";

const keyboardJourney = {
  name: "prepare, inspect the current run and return using only the keyboard; focus lands where it should and is visibly marked",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun()]);
    await boot(page, host, url);
    await T(page, "graph-template-parameter-request").focus();
    await page.keyboard.type("Prepare the next task");
    // Tab 顺序：被禁用的 Review/Save 不可聚焦，原因之后紧跟“查看当前运行”
    const forward = await pressUntilFocused(page, "graph-view-current-run");
    assert.ok(
      !forward.includes("graph-review-run") && !forward.includes("graph-library-instantiate"),
    );
    assert.equal(await hasFocusTreatment(page), true, "View current run shows the focus treatment");
    await page.keyboard.press("Enter");
    await T(page, "graph-run-summary").waitFor();
    await until(
      async () => (await focused(page)) === "graph-run-summary",
      "focus lands on the run summary",
    );
    assert.equal(await hasFocusTreatment(page), true, "the run summary shows the focus treatment");
    // 返回：反向 Tab 到 New run，用 Space 激活
    await pressUntilFocused(page, "graph-new-run", "Shift+Tab");
    assert.equal(await hasFocusTreatment(page), true, "New run shows the focus treatment");
    await page.keyboard.press("Space");
    await T(page, "graph-template-parameter-request").waitFor();
    await until(
      async () => (await focused(page)) === "graph-template-parameter-request",
      "focus returns to the request field",
    );
    assert.equal(
      await T(page, "graph-template-parameter-request").inputValue(),
      "Prepare the next task",
    );
    assert.deepEqual(admissionCalls(host), [], "the whole journey never reached admission");
    assertClean(host);
  },
};

const latePrepare = {
  name: "a preflight reply that arrives after the user left the review is discarded",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    host.hold("wf.prepare");
    await T(page, "graph-review-run").click();
    await until(() => host.waiting("wf.prepare") === 1, "the preflight is in flight");
    await T(page, "graph-view-design").click(); // 离开这次审阅意图
    await T(page, "graph-view-runs").click();
    host.release("wf.prepare");
    await until(
      () => host.calls.some((call) => call.op === "wf.prepare" && call.phase === "done"),
      "the late reply was delivered",
    );
    await flush(page);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(
      await T(page, "graph-run-confirmation").count(),
      0,
      "the abandoned review does not appear",
    );
    assert.equal(started(host, "graph.run").length, 0);
    // 显式重新审阅仍然正常：得到全新的、未确认的审阅
    await T(page, "graph-new-run").click();
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    assert.equal(await T(page, "graph-preflight-ack").getAttribute("aria-checked"), "false");
    assert.ok(await templateDraft(page, host), "the draft is intact");
    assertClean(host);
  },
};

const many = (count) =>
  Array.from({ length: count }, (_, index) => completedRun(`run-old-${index}`));

const needsYouScope = {
  name: "Needs-you states its scope and still reaches a waiting run that the selected history page does not list",
  async run({ page, host, url }) {
    // 25 条一页。UX-M2.1 起历史由新到旧：等待中的运行（唯一未结束的，因而总是最新的）在第 1 页。
    // 为保留原有语义（所示页不含等待中的运行时 Needs-you 仍能到达它），用户先翻到较早的一页。
    host.setRuns("A", [...many(25), permissionWaitRun("run-far")]);
    await boot(page, host, url);
    await T(page, "graph-needs-you").waitFor();
    await T(page, "graph-history-next").click();
    assert.equal(await T(page, "graph-needs-you").getAttribute("data-run-id"), "run-far");
    assert.equal(
      await page.locator('[data-testid="graph-run"][data-run-id="run-far"]').count(),
      0,
      "the waiting run is not on the selected history page",
    );
    assert.match(
      await T(page, "graph-needs-you-scope").innerText(),
      /this workspace.*this Host.*not a queue across/i,
    );
    await T(page, "graph-needs-you-go").focus();
    await page.keyboard.press("Enter");
    await T(page, "graph-run-summary").waitFor();
    assert.equal(await T(page, "graph-run-summary").getAttribute("data-run-id"), "run-far");
    await until(
      async () => (await focused(page)) === "graph-run-summary",
      "focus lands on the run summary",
    );
    // UX-M2.1：Go to run 是显式导航，历史翻回该运行所在的页。
    assert.equal(
      await page
        .locator('[data-testid="graph-run"][data-run-id="run-far"]')
        .getAttribute("aria-current"),
      "true",
      "Go to run reveals the waiting run's history page",
    );
    assertClean(host);
  },
};

export const focusScenarios = [keyboardJourney, latePrepare, needsYouScope];
