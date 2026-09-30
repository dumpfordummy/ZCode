// UX-M2.3 browser scenarios: UI-owned framing above verbatim Host diagnostics on the Context
// picker, Checks save and the New-run / review commit bars. Real Host reference validation and the
// real recipe store; the native chooser, the preflight and admission are the fixture boundary.
import assert from "node:assert/strict";
import { openPicker, search, optionCount } from "./context-picker-helpers.mjs";
import {
  T,
  admissionCalls,
  assertClean,
  boot,
  editCheckByKeyboard,
  flush,
  preparedDraft,
  started,
  templateDraft,
  until,
} from "./ux-m1-helpers.mjs";

const ERROR = "graph-context-validation-error";
const errorText = (page) =>
  T(page, ERROR)
    .innerText()
    .catch(() => "");
const referenceBindings = async (page, host) =>
  (await templateDraft(page, host))?.bindings?.references;

/** Open the picker on the `instructions` slot (empty or holding a value). */
async function pickerOnInstructions(page) {
  const replace = T(page, "graph-context-replace-instructions");
  if (await replace.count()) await replace.click();
  else {
    await openPicker(page);
    const slot = T(page, "graph-context-slot-instructions");
    if (await slot.count()) await slot.check();
  }
  await T(page, "graph-context-search").waitFor();
}
async function failSearchSelection(page) {
  await search(page, "empty");
  await until(async () => (await optionCount(page)) > 0, "results");
  await T(page, "graph-context-option-0").click();
  await until(async () => /nonempty UTF-8/.test(await errorText(page)), "Host rejection");
}

const pickerSearch = {
  name: "a chosen file that fails the Host check is framed; 'previous selection kept' appears only when there was one; the diagnostic is verbatim",
  async run({ page, host, url }) {
    await boot(page, host, url);
    // 空槽位：没有“原选择”
    await pickerOnInstructions(page);
    await failSearchSelection(page);
    let text = await errorText(page);
    assert.match(text, /Could not use empty\.md\. Nothing is selected for this slot\./);
    assert.doesNotMatch(text, /previous selection/i);
    assert.match(text, /Reference must be a nonempty UTF-8 text file\./, "Host text verbatim");
    assert.equal(await T(page, "graph-context-chip-instructions").count(), 0, "nothing selected");
    await T(page, "graph-context-search").focus();
    await page.keyboard.press("Escape");
    await T(page, "graph-context-popover").waitFor({ state: "hidden" });
    // 有原选择：说明它被保留，并点名
    await openPicker(page);
    await search(page, "Context");
    await until(async () => (await optionCount(page)) > 0, "results");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await T(page, "graph-context-chip-instructions").waitFor();
    const before = await referenceBindings(page, host);
    await pickerOnInstructions(page);
    await failSearchSelection(page);
    text = await errorText(page);
    assert.match(
      text,
      /Could not use empty\.md\. The previous selection docs\/Context\.md was kept\./,
    );
    assert.deepEqual(await referenceBindings(page, host), before, "the binding is unchanged");
    assertClean(host);
  },
};

const pickerChooser = {
  name: "the native chooser: a rejected path is named and framed, a cancel shows nothing and clears the old failure, a chooser error is framed",
  async run({ page, host, url }) {
    await boot(page, host, url);
    await openPicker(page);
    await search(page, "Context");
    await until(async () => (await optionCount(page)) > 0, "results");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await T(page, "graph-context-chip-instructions").waitFor();
    const before = await referenceBindings(page, host);
    // 工作区之外的路径：真实 Host 拒绝；界面点名文件并说明原选择保留
    host.setPickedFile(host.outside);
    await pickerOnInstructions(page);
    await T(page, "graph-context-native-picker").click();
    await until(
      async () => /Unsafe workspace-relative path/.test(await errorText(page)),
      "rejection",
    );
    const text = await errorText(page);
    assert.match(
      text,
      /Could not use outside\.md\. The previous selection docs\/Context\.md was kept\./,
    );
    assert.match(text, /Unsafe workspace-relative path segment\./, "Host text verbatim");
    assert.equal(
      await T(page, "graph-context-attempt").getAttribute("title"),
      host.outside,
      "the full chosen path is available as the title, not invented",
    );
    // 取消：不是失败；旧的失败说明也被清除
    host.setPickedFile(null);
    const validations = started(host, "validate-reference").length;
    await T(page, "graph-context-native-picker").click();
    await until(
      () => host.calls.filter((c) => c.op === "selectFile" && c.phase === "done").length === 2,
      "cancelled chooser",
    );
    await flush(page);
    assert.equal(await T(page, ERROR).count(), 0, "a cancel shows no failure");
    assert.equal(started(host, "validate-reference").length, validations, "nothing validated");
    // 选择器本身出错：给出说明与原始诊断，不产生未处理的拒绝
    host.fail("selectFile", "Dialog service unavailable (fixture)");
    await T(page, "graph-context-native-picker").click();
    await T(page, "graph-context-chooser-error").waitFor();
    const failed = await T(page, "graph-context-chooser-error").innerText();
    assert.match(
      failed,
      /The file chooser did not return a file\. The previous selection docs\/Context\.md was kept\./,
    );
    assert.match(failed, /Dialog service unavailable \(fixture\)/);
    host.fail("selectFile");
    assert.deepEqual(await referenceBindings(page, host), before, "the binding never changed");
    assertClean(host);
  },
};

const checksSave = {
  name: "a failed Save checks is framed once near Save (not repeated by the generic alert) and never shown beside Review and run",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    await editCheckByKeyboard(page, "test");
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (edited)");
    host.fail("graph.recipes.save", "disk full (fixture)");
    await T(page, "graph-save-recipes").click();
    await T(page, "graph-recipes-save-error").waitFor();
    const text = await T(page, "graph-recipes-save-error").innerText();
    assert.match(text, /The saved checks were not changed\. Your unsaved edits are kept\./);
    assert.match(text, /disk full \(fixture\)/);
    const copies = await page
      .locator('[role="alert"]')
      .evaluateAll(
        (items) => items.filter((item) => item.textContent.includes("disk full")).length,
      );
    assert.equal(copies, 1, "the same message is not shown twice on one screen");
    host.fail("graph.recipes.save");
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-new-run-pane").waitFor();
    assert.equal(await T(page, "graph-new-run-error").count(), 0, "UX-M1 Windows fix kept");
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const newRunBar = {
  name: "the New-run bar frames a failed preflight (nothing started, draft kept) and the review bar frames a failed Start without claiming nothing started",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    const draft = await templateDraft(page, host);
    host.fail("wf.prepare", "Native environment unavailable (fixture)");
    await T(page, "graph-review-run").click();
    await T(page, "graph-new-run-error").waitFor();
    const text = await T(page, "graph-new-run-error").innerText();
    assert.match(
      text,
      /Review could not be prepared\. Nothing was started; your request, context and check choices are kept\./,
    );
    assert.match(text, /Native environment unavailable \(fixture\)/, "Host text verbatim");
    assert.deepEqual(await templateDraft(page, host), draft);
    host.fail("wf.prepare");
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    await T(page, "graph-preflight-ack").click();
    host.fail("graph.run", "Admission refused (fixture)");
    await T(page, "graph-confirm-run").click();
    await T(page, "graph-run-confirmation-error").waitFor();
    const start = await T(page, "graph-run-confirmation-error").innerText();
    assert.match(
      start,
      /Start did not complete\. Check the run list to see whether a run was admitted before you start again\./,
    );
    assert.match(start, /Admission refused \(fixture\)/);
    assert.doesNotMatch(start, /Nothing was started/);
    host.fail("graph.run");
    assertClean(host);
  },
};

const chinese = {
  name: "Chinese: the framing is localized while file names and Host diagnostics stay verbatim",
  async run({ page, host, url }) {
    await boot(page, host, url, { locale: "zh-CN" });
    await pickerOnInstructions(page);
    await failSearchSelection(page);
    const text = await errorText(page);
    assert.match(text, /无法使用 empty\.md。此槽位没有选择任何内容。/);
    assert.match(text, /Reference must be a nonempty UTF-8 text file\./, "diagnostic untranslated");
    assertClean(host);
  },
};

export const errorScenarios = [pickerSearch, pickerChooser, checksSave, newRunBar, chinese];
