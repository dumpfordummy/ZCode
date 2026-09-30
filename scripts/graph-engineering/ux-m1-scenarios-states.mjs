// UX-M1.3 browser scenarios: states that must stay distinguishable (English and Simplified Chinese),
// the reason beside the primary action for each blocked state, and the picker while a run occupies the workspace.
import assert from "node:assert/strict";
import {
  openPicker,
  pickByKeyboard,
  search,
  optionCount,
  addByKeyboard,
} from "./context-picker-helpers.mjs";
import {
  REQUEST,
  T,
  admissionCalls,
  assertClean,
  boot,
  chooseChecks,
  flush,
  focused,
  inViewport,
  recipesReady,
  selectValue,
  started,
  until,
  SIZES,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS, BUILD_ALT, LINT, TEST } from "./ux-m1-checks.mjs";
import {
  approvalWaitRun,
  failedTestRun,
  invalidEvidenceRun,
  malformedReviewerRun,
  permissionWaitRun,
  questionWaitRun,
  validReviewerRun,
} from "./ux-m1-runs.mjs";

const CJK = /[一-鿿]/;
const RAW_DIAGNOSTIC = "Invalid strict JSON value.";

async function readNeedsYou(page, host, run) {
  host.setRuns("A", [run]);
  await until(
    async () =>
      (await T(page, "graph-needs-you").count()) > 0 &&
      (await T(page, "graph-needs-you").getAttribute("data-run-id")) === run.id,
    `Needs-you for ${run.id}`,
  );
  return {
    kind: await T(page, "graph-needs-you").getAttribute("data-kind"),
    text: (await T(page, "graph-needs-you").locator('[role="status"]').first().innerText()).trim(),
  };
}
async function readSettled(page, id) {
  await page.locator(`[data-testid="graph-run"][data-run-id="${id}"]`).click();
  await until(
    async () => (await T(page, "graph-run-summary").getAttribute("data-run-id")) === id,
    `summary of ${id}`,
  );
  const has = async (testId) => (await T(page, testId).count()) > 0;
  return {
    execution: (await T(page, "graph-run-execution").innerText()).replace(/\s+/g, " "),
    evidence: (await T(page, "graph-run-evidence").innerText()).replace(/\s+/g, " "),
    resultKind: (await has("graph-run-result-block"))
      ? await T(page, "graph-run-result-block").getAttribute("data-kind")
      : "none",
    resultText: (await has("graph-run-result-block"))
      ? (await T(page, "graph-run-result-block").innerText()).replace(/\s+/g, " ")
      : "",
    outputs: await page
      .locator('[data-testid="graph-run-structured-output"]')
      .evaluateAll((items) =>
        items.map((item) => [
          item.getAttribute("data-state"),
          item.innerText.replace(/\s+/g, " ").trim(),
        ]),
      ),
    diagnostics: await page.locator('[data-testid="graph-run-output-diagnostic"]').allInnerTexts(),
    validationFailed: await has("graph-run-output-validation-failed"),
  };
}

const distinct = (locale) => ({
  name: `${locale === "zh-CN" ? "Simplified Chinese" : "English"}: permission, question, approval, failed Test, invalid evidence, malformed reviewer output and valid reviewer decisions are told apart`,
  async run({ page, host, url }) {
    await boot(page, host, url, { locale });
    const zh = locale === "zh-CN";
    // 等待中的三种：Needs-you 的类型与文案各不相同
    const waiting = [];
    for (const run of [permissionWaitRun(), questionWaitRun(), approvalWaitRun()])
      waiting.push(await readNeedsYou(page, host, run));
    assert.deepEqual(
      waiting.map((item) => item.kind),
      ["permission", "question", "approval"],
    );
    assert.equal(new Set(waiting.map((item) => item.text)).size, 3, "three different sentences");
    if (zh) for (const item of waiting) assert.match(item.text, CJK);
    // 已结束的四类：机器证据失败、机器证据无效、审阅输出格式错误、有效的审阅结论
    const runs = [
      failedTestRun(),
      invalidEvidenceRun(),
      malformedReviewerRun(),
      validReviewerRun("pass"),
      validReviewerRun("needs_changes"),
    ];
    host.setRuns("A", runs);
    await T(page, "graph-run-history").waitFor();
    await until(
      async () => (await T(page, "graph-needs-you").count()) === 0,
      "nothing is waiting any more",
    );
    const read = {};
    for (const run of runs) read[run.id] = await readSettled(page, run.id);
    assert.equal(read["run-failed-test"].resultKind, "test-failed");
    assert.equal(read["run-invalid-evidence"].resultKind, "evidence-invalid");
    assert.equal(read["run-malformed-reviewer"].resultKind, "reviewer-output-invalid");
    // 有效的审阅结论：显示的是它的结论本身（pass / needs_changes），从来不是失败
    for (const [id, outcome] of [
      ["run-valid-pass", "pass"],
      ["run-valid-needs_changes", "needs_changes"],
    ]) {
      assert.equal(read[id].resultKind, "none", `${id} is a decision, not a failure`);
      assert.deepEqual(
        read[id].outputs.map(([state]) => state),
        [outcome],
      );
      assert.equal(read[id].validationFailed, false);
    }
    assert.notEqual(
      read["run-valid-pass"].outputs[0][1],
      read["run-valid-needs_changes"].outputs[0][1],
      "the two valid decisions read differently",
    );
    // 机器证据的失败与无效，不会被说成审阅输出问题；反之亦然
    assert.equal(read["run-failed-test"].validationFailed, false);
    assert.equal(read["run-invalid-evidence"].validationFailed, false);
    assert.equal(read["run-malformed-reviewer"].validationFailed, true);
    assert.notEqual(read["run-failed-test"].evidence, read["run-invalid-evidence"].evidence);
    const signatures = [
      "run-failed-test",
      "run-invalid-evidence",
      "run-malformed-reviewer",
      "run-valid-pass",
    ].map((id) =>
      JSON.stringify([
        read[id].resultKind,
        read[id].evidence,
        read[id].outputs.map(([state]) => state),
      ]),
    );
    assert.equal(new Set(signatures).size, 4, "each state has its own signature");
    // 原始诊断保持原文，不被翻译
    assert.deepEqual(
      read["run-malformed-reviewer"].diagnostics.map((text) => text.includes(RAW_DIAGNOSTIC)),
      [true],
    );
    if (zh) {
      for (const id of ["run-failed-test", "run-invalid-evidence", "run-malformed-reviewer"])
        assert.match(read[id].resultText, CJK, `${id} headline is Chinese`);
      assert.match(read["run-valid-pass"].outputs[0][1], CJK);
      assert.match(read["run-malformed-reviewer"].diagnostics[0], /Invalid strict JSON value\./);
    } else {
      for (const id of ["run-failed-test", "run-invalid-evidence", "run-malformed-reviewer"])
        assert.doesNotMatch(read[id].resultText, CJK);
    }
    // 捕获的请求原文不被改写
    assert.match(
      await T(page, "graph-run-request").innerText(),
      /Captured request of the current run/,
    );
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
});

const fillSlot = async (page) => {
  await T(page, "graph-template-parameter-request").fill(REQUEST);
  await T(page, "graph-template-parameter-targetEngine").fill("Engine X");
  await T(page, "graph-template-parameter-criteria").fill("Spin outcomes match the rules");
  for (const id of ["normal", "free", "bonus", "respin"])
    await T(page, `graph-template-parameter-${id}`).click();
  await chooseChecks(page, { build: "build-main", test: "test-unit" });
};

const blockedStates = {
  name: "each blocked state shows its reason beside the primary action with a route to fix it: missing required context, invalid check, preflight error, ready to review",
  async run({ page, host, url }) {
    await page.setViewportSize(SIZES[0]);
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url);
    // 1) 缺少必需的上下文（老虎机工作流的 GameDoc）：其余都已填好，只剩它
    await selectValue(page, "graph-library-entry", "slot");
    await recipesReady(page);
    assert.match(
      await T(page, "graph-new-run-blocked").innerText(),
      /Not ready to review: \d+ to complete or correct/,
    );
    await fillSlot(page);
    const blocked = T(page, "graph-new-run-blocked");
    assert.equal(await blocked.getAttribute("data-blocked-by"), "fields");
    assert.match(await blocked.innerText(), /Not ready to review: 1 to complete or correct/);
    assert.match(await T(page, "graph-template-unresolved").innerText(), /Authoritative GameDoc/);
    assert.equal(
      await inViewport(page, "graph-new-run-blocked"),
      true,
      "the reason is visible beside the action",
    );
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    await T(page, "graph-go-to-first-field").click();
    await until(
      () =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest("#graph-template-field-reference-gameDoc")),
        ),
      "focus moves into the missing required context",
    );
    assert.deepEqual(admissionCalls(host), [], "the shortcut only moves focus");
    await addByKeyboard(page, "GameDoc", "gameDoc");
    await until(
      async () => !(await T(page, "graph-review-run").isDisabled()),
      "Review available once the context is set",
    );
    assert.equal(
      await T(page, "graph-new-run-blocked").count(),
      0,
      "no reason once nothing blocks",
    );
    // 2) 无效的检查：外部删除了所选检查 → 原因与去处；聚焦到该步骤
    await host.seedRecipes("A", [BUILD_ALT, TEST, LINT]);
    await T(page, "graph-template-load-recipes").click();
    await until(
      async () => (await T(page, "graph-new-run-blocked").count()) > 0,
      "reason appears for the invalid check",
    );
    assert.match(
      await T(page, "graph-new-run-blocked").innerText(),
      /Not ready to review: 1 to complete or correct/,
    );
    await T(page, "graph-go-to-first-field").click();
    await until(
      () =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest("#graph-template-field-recipe-build")),
        ),
      "focus moves to the invalid check's step",
    );
    await selectValue(page, "graph-template-recipe-build", "build-alt");
    await until(
      async () => !(await T(page, "graph-review-run").isDisabled()),
      "Review available after an explicit choice",
    );
    // 3) 预检失败：读取失败不应悄悄发生；草稿保持，原因在主操作旁可见
    host.fail("wf.prepare", "Fixture preflight failure: native environment unavailable");
    await T(page, "graph-review-run").click();
    await until(() => started(host, "wf.prepare").length === 1, "the preflight was attempted");
    const failures = page.getByRole("alert").filter({ hasText: /Fixture preflight failure/ });
    const failure = failures.first();
    await failure.waitFor();
    assert.equal(await failures.count(), 1, "the failure is announced once, next to the action");
    assert.equal(
      await T(page, "graph-run-confirmation").count(),
      0,
      "no review opens after a failed preflight",
    );
    assert.equal(started(host, "graph.run").length, 0);
    await flush(page);
    assert.equal(
      await failure.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight;
      }),
      true,
      "the preflight error is visible without scrolling to find it",
    );
    assert.equal(
      await T(page, "graph-template-parameter-request").inputValue(),
      REQUEST,
      "the draft is intact",
    );
    // 4) 重试成功 → 待审阅：确认栏里主操作、未勾选的确认与其原因都在视口内
    host.fail("wf.prepare");
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    assert.equal(await T(page, "graph-preflight-ack").getAttribute("aria-checked"), "false");
    assert.equal(await T(page, "graph-confirm-run").isDisabled(), true);
    assert.equal(await inViewport(page, "graph-confirm-run"), true, "Start is visible");
    assert.equal(
      await inViewport(page, "graph-preflight-ack"),
      true,
      "the acknowledgment is visible",
    );
    assert.equal(started(host, "graph.run").length, 0, "nothing starts until the user does");
    assertClean(host);
  },
};

const pickerWhileOccupied = {
  name: "while a run occupies the workspace, picker Enter selects context only and Escape only closes; neither submits, and focus returns to the picker's control",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun()]);
    await boot(page, host, url);
    await T(page, "graph-template-parameter-request").fill(REQUEST);
    await openPicker(page);
    await page.keyboard.press("Escape");
    await T(page, "graph-context-popover").waitFor({ state: "hidden" });
    await until(
      async () => (await focused(page)) === "graph-context-add",
      "Escape returns focus to the control that opened the picker",
    );
    await openPicker(page);
    await search(page, "Context");
    await until(async () => (await optionCount(page)) > 0, "results");
    await pickByKeyboard(page, 0);
    await T(page, "graph-context-chip-instructions").waitFor();
    await T(page, "graph-context-popover").waitFor({ state: "hidden" });
    await flush(page);
    assert.notEqual(await focused(page), "BODY", "focus is not lost after selecting");
    assert.deepEqual(admissionCalls(host), [], "selecting context never reaches admission");
    assert.equal(await T(page, "graph-run-confirmation").count(), 0);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assertClean(host);
  },
};

const chineseLabels = {
  name: "Simplified Chinese: the unresolved-fields list, step preview and Context 'used by' use the same localized names as the form (values and ids stay raw)",
  async run({ page, host, url }) {
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url, { locale: "zh-CN" });
    await addByKeyboard(page, "Context", "instructions");
    const chip = await T(page, "graph-context-chip-instructions").innerText();
    assert.match(chip, /审阅/, "the review step is localized");
    assert.doesNotMatch(chip, /\bReview\b/);
    assert.match(
      await T(page, "graph-template-step-preview").innerText(),
      /分析 → 实现 → 审阅 → 最终人工审阅/,
    );
    await selectValue(page, "graph-library-entry", "generic");
    await recipesReady(page);
    const list = await T(page, "graph-template-unresolved").innerText();
    for (const label of ["明确的运行请求", "构建", "按配置的标准测试"])
      assert.match(list, new RegExp(label));
    for (const raw of ["Explicit run request", "Build", "Test configured criteria"])
      assert.doesNotMatch(list, new RegExp(raw));
    assert.match(
      await T(page, "graph-new-run-blocked").innerText(),
      /尚不能审阅：还有 3 项需补全或修正/,
    );
    assert.equal(await T(page, "graph-go-to-first-field").innerText(), "前往第一个字段");
    assertClean(host);
  },
};

export const stateScenarios = [
  distinct("en-US"),
  distinct("zh-CN"),
  chineseLabels,
  blockedStates,
  pickerWhileOccupied,
];
