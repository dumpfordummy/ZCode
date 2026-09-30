// UX-M2.2 browser scenarios: unsaved check edits are disclosed where they matter, never used by
// Review, summarized completely before Save, and discarded only by a confirmed, whole-list Discard.
// Saved checks live in the REAL recipe store (`.zcode/config.json` of a temporary workspace); the
// fixture preflight reads that store, like the Host.
import assert from "node:assert/strict";
import {
  REQUEST,
  T,
  admissionCalls,
  assertClean,
  drafts,
  editCheckByKeyboard,
  flush,
  focused,
  preparedDraft,
  recipesReady,
  setState,
  started,
  stepRows,
  templateDraft,
  until,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS, LINT } from "./ux-m1-checks.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";

const recipeDraft = async (page, host) => (await drafts(page))[host.workspaces.A]?.recipes;
const back = async (page) => {
  await T(page, "graph-return-to-workflow").click();
  await T(page, "graph-new-run-pane").waitFor();
};
/** Replace the whole unsaved list through the Advanced raw JSON field, as a user can. */
async function editRaw(page, update) {
  const field = T(page, "graph-recipes-json");
  if (!(await field.isVisible()))
    await page.locator('details:has([data-testid="graph-recipes-json"]) > summary').click();
  const current = await field.inputValue();
  await field.fill(
    typeof update === "string" ? update : JSON.stringify(update(JSON.parse(current)), null, 2),
  );
  await flush(page);
}
const changeRows = (page) =>
  page
    .locator('[data-testid="graph-recipe-changes"] [data-testid="graph-recipe-change"]')
    .evaluateAll((items) =>
      items.map(
        (item) => `${item.getAttribute("data-change")}:${item.getAttribute("data-check-id")}`,
      ),
    );
const savedIds = async (host) => (await host.readRecipes("A")).recipes.map((recipe) => recipe.id);
const recipeSaves = (host) => started(host, "graph.recipes.save");
const noDialog = async (page) =>
  assert.equal(await page.locator('[role="dialog"], [role="alertdialog"]').count(), 0, "no dialog");

const reviewUsesSaved = {
  name: "Edit check, then Back: Back is immediate, New run keeps showing the saved check and marks it, and Review's preflight uses the saved check",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    const choices = await templateDraft(page, host);
    await editCheckByKeyboard(page, "test");
    await editRaw(page, (list) =>
      list.map((recipe) =>
        recipe.id === "test-unit"
          ? { ...recipe, name: "Unit tests (edited)", args: ["test", "--edited"] }
          : recipe,
      ),
    );
    assert.match(await T(page, "graph-return-unsaved").innerText(), /not used by the next run/);
    await T(page, "graph-return-to-workflow").click();
    // Back 立即返回：没有对话框、没有确认
    await T(page, "graph-new-run-pane").waitFor();
    await noDialog(page);
    assert.deepEqual(await templateDraft(page, host), choices, "request, context and choices kept");
    assert.ok((await recipeDraft(page, host)).text.includes("--edited"), "the check draft is kept");
    const [row] = await stepRows(page, "test");
    assert.equal(row.id, "test-unit");
    assert.match(row.text, /^Unit tests Test · Saved · not run/, "the SAVED name, not the edit");
    assert.doesNotMatch(row.text, /\(edited\)/);
    assert.equal(
      await page
        .locator(
          '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-unsaved"]',
        )
        .getAttribute("data-change"),
      "modified",
    );
    assert.match(
      await T(page, "graph-new-run-unsaved-checks").innerText(),
      /Review and the next run use the saved checks shown here/,
    );
    // Review：预检来自已保存的检查（真实检查存储），不是未保存的编辑
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    const review = await T(page, "graph-run-confirmation").evaluate((node) => node.textContent);
    assert.ok(review.includes('"id": "test-unit"'), "the review lists the selected check");
    assert.ok(review.includes("dotnet --version"), "with its SAVED command");
    assert.ok(!review.includes("--edited"), "the unsaved command is not reviewed");
    assert.equal(started(host, "wf.prepare").length, 1);
    assert.equal((await host.readRecipes("A")).recipes[2].name, "Unit tests", "nothing was saved");
    assert.equal(recipeSaves(host).length, 0);
    // 放弃编辑后标记消失
    await T(page, "graph-new-run").click(); // 离开审阅（导航会关闭它）
    await page
      .locator(
        '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-edit"]',
      )
      .click();
    await T(page, "graph-recipe-discard").click();
    await T(page, "graph-recipe-discard-confirm").click();
    await back(page);
    assert.equal(await T(page, "graph-new-run-unsaved-checks").count(), 0, "marker cleared");
    assert.equal(await T(page, "graph-selected-check-unsaved").count(), 0);
    assertClean(host);
  },
};

const saveSummary = {
  name: "Save summarizes the whole list by stable id, including edits retained from an earlier visit, and saves exactly that list",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    // 第一次进入：改名，返回
    await editCheckByKeyboard(page, "test");
    await T(page, "graph-recipe-field-2-name").fill("Unit tests v2");
    await back(page);
    // 第二次进入：新增一个检查、删除另一个
    await editCheckByKeyboard(page, "build");
    await editRaw(page, (list) => [
      ...list.filter((recipe) => recipe.id !== "lint"),
      { ...LINT, id: "smoke", name: "Smoke command" },
    ]);
    const summary = T(page, "graph-recipe-changes");
    await summary.waitFor();
    assert.deepEqual((await changeRows(page)).sort(), [
      "added:smoke",
      "modified:test-unit",
      "removed:lint",
    ]);
    const text = await summary.innerText();
    assert.match(text, /Changed: Unit tests v2 \(test-unit\)/, "the retained edit from visit 1");
    assert.match(text, /Added: Smoke command \(smoke\)/);
    assert.match(text, /Removed: Lint only \(lint\)/, "a removed check keeps its saved name");
    assert.match(text, /not used by the next run/);
    assert.match(text, /writes the whole check list.*also those made earlier/);
    assert.match(
      String(await T(page, "graph-save-recipes").getAttribute("aria-describedby")),
      /graph-recipe-changes/,
      "Save is described by its summary",
    );
    // 列表中的行内标记
    const marked = await page
      .locator('[data-testid="graph-recipe-row"][data-unsaved]')
      .evaluateAll((rows) => rows.map((row) => `${row.dataset.unsaved}:${row.dataset.checkId}`));
    assert.deepEqual(marked.sort(), ["added:smoke", "modified:test-unit"]);
    // 保存：写入的正是摘要所列的整个清单
    await T(page, "graph-save-recipes").click();
    await T(page, "graph-recipes-saved").waitFor();
    assert.deepEqual(recipeSaves(host).at(-1).recipeIds, [
      "build-main",
      "build-alt",
      "test-unit",
      "test-extra",
      "smoke",
    ]);
    assert.deepEqual(await savedIds(host), [
      "build-main",
      "build-alt",
      "test-unit",
      "test-extra",
      "smoke",
    ]);
    assert.equal((await host.readRecipes("A")).recipes[2].name, "Unit tests v2");
    await until(
      async () => (await T(page, "graph-recipe-changes").count()) === 0,
      "summary cleared",
    );
    assertClean(host);
  },
};

const discardScope = {
  name: "Discard names the whole list and needs confirmation; Keep editing changes nothing; confirming restores the saved checks",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    await editCheckByKeyboard(page, "test");
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (edited)");
    await editRaw(page, (list) =>
      list.map((recipe) =>
        recipe.id === "build-main" ? { ...recipe, name: "Build (edited)" } : recipe,
      ),
    );
    const dirty = (await recipeDraft(page, host)).text;
    assert.equal(
      await T(page, "graph-recipe-discard").innerText(),
      "Discard all unsaved check edits…",
    );
    await T(page, "graph-recipe-discard").click();
    const confirmation = T(page, "graph-recipe-discard-confirmation");
    await confirmation.waitFor();
    await noDialog(page);
    assert.match(
      await confirmation.innerText(),
      /Every check returns to the saved checks, not only the one that is open/,
    );
    assert.match(await confirmation.innerText(), /Unit tests \(edited\) \(test-unit\)/);
    assert.match(
      await confirmation.innerText(),
      /Build \(edited\) \(build-main\)/,
      "the other check is named too",
    );
    assert.equal(await focused(page), "graph-recipe-discard-cancel", "the safe choice has focus");
    await page.keyboard.press("Enter"); // Keep editing
    await until(
      async () => (await focused(page)) === "graph-recipe-discard",
      "focus returns to Discard",
    );
    assert.equal((await recipeDraft(page, host)).text, dirty, "Keep editing changed nothing");
    await T(page, "graph-recipe-discard").click();
    await T(page, "graph-recipe-discard-confirm").click();
    await T(page, "graph-recipe-discarded").waitFor();
    const clean = await recipeDraft(page, host);
    assert.equal(clean.text, clean.baseText, "the whole list is back to the saved checks");
    assert.equal(await T(page, "graph-recipe-field-2-name").inputValue(), "Unit tests");
    assert.equal(recipeSaves(host).length, 0, "discard never saves");
    // 已保存检查未加载（读取失败）时不能放弃：不把旧基线当作当前值
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (again)");
    host.fail("graph.recipes.read", "read failed");
    await T(page, "graph-template-load-recipes").click();
    await until(
      async () => (await T(page, "graph-recipe-read-state").getAttribute("data-state")) === "error",
      "read failed",
    );
    assert.equal(await T(page, "graph-recipe-discard").isDisabled(), true);
    assert.match(
      await page.locator("#graph-recipe-discard-reason").innerText(),
      /Load the saved checks before discarding/,
    );
    assert.match(
      await T(page, "graph-recipe-changes").innerText(),
      /loaded earlier; they are not loaded right now/,
    );
    host.fail("graph.recipes.read");
    // 冲突：沿用原有的冲突处理，不提供第二个放弃入口
    await host.seedRecipes(
      "A",
      ALL_CHECKS.map((recipe) =>
        recipe.id === "lint" ? { ...recipe, name: "Changed outside" } : recipe,
      ),
    );
    await T(page, "graph-template-load-recipes").click();
    await recipesReady(page);
    await T(page, "graph-recipes-use-saved").waitFor();
    assert.equal(await T(page, "graph-recipe-discard").count(), 0, "conflict keeps its own flow");
    assert.match(await T(page, "graph-recipe-changes").innerText(), /have changed since/);
    await T(page, "graph-recipes-use-saved").click();
    await until(
      async () => (await T(page, "graph-recipe-changes").count()) === 0,
      "conflict resolved",
    );
    assert.equal(
      (await host.readRecipes("A")).recipes[4].name,
      "Changed outside",
      "external edit kept",
    );
    assertClean(host);
  },
};

const unsummarizable = {
  name: "an invalid raw list cannot be summarized: the UI says so, Save is not newly enabled and still refuses, New run claims no per-row marker",
  run: async ({ page, host, url }) => {
    await preparedDraft(page, host, url);
    await editCheckByKeyboard(page, "test");
    await editRaw(page, "[{");
    const summary = T(page, "graph-recipe-changes");
    await summary.waitFor();
    assert.equal(await summary.getAttribute("data-kind"), "unsummarizable");
    assert.match(await summary.innerText(), /cannot be listed: the check list is not valid JSON/);
    assert.equal(
      await page.locator('[data-testid="graph-recipe-change"]').count(),
      0,
      "no partial list",
    );
    const enabledBefore = !(await T(page, "graph-save-recipes").isDisabled());
    assert.equal(
      enabledBefore,
      true,
      "Save's enabled state is the existing one (it validates first)",
    );
    const validations = host.calls.filter((c) => c.op === "validate" && c.phase !== "start").length;
    await T(page, "graph-save-recipes").click();
    await until(
      () =>
        host.calls.filter((c) => c.op === "validate" && c.phase !== "start").length > validations,
      "Save asked the Host to validate the list first, and the Host answered",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await flush(page);
    assert.equal(recipeSaves(host).length, 0, "an invalid list is never saved");
    // 重复 id：同样无法完整列出；New run 只给出总体说明，不做逐行声明
    await editRaw(page, JSON.stringify([...ALL_CHECKS, ALL_CHECKS[2]], null, 2));
    assert.equal(await summary.getAttribute("data-kind"), "unsummarizable");
    assert.match(await summary.innerText(), /two checks have the same id/);
    await T(page, "graph-save-recipes").click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(recipeSaves(host).length, 0, "Host validation still refuses duplicate ids");
    await back(page);
    assert.match(await T(page, "graph-new-run-unsaved-checks").innerText(), /cannot be listed/);
    assert.equal(await T(page, "graph-selected-check-unsaved").count(), 0, "no per-row claim");
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assertClean(host);
  },
};

const occupied = {
  name: "while a run is unresolved Save stays refused, but the summary, editing and a confirmed Discard still work",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun()]);
    await preparedDraft(page, host, url);
    await editCheckByKeyboard(page, "test");
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (while running)");
    assert.equal(await T(page, "graph-save-recipes").isDisabled(), true);
    assert.deepEqual(await changeRows(page), ["modified:test-unit"]);
    await T(page, "graph-recipe-discard").click();
    await T(page, "graph-recipe-discard-confirm").click();
    const clean = await recipeDraft(page, host);
    assert.equal(clean.text, clean.baseText);
    assert.equal(recipeSaves(host).length, 0);
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const chinese = {
  name: "Chinese: the summary, markers and Discard are localized; check names and ids stay verbatim",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-new-run-pane").waitFor();
    await recipesReady(page);
    await editCheckByKeyboard(page, "test");
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (edited)");
    const summary = await T(page, "graph-recipe-changes").innerText();
    assert.match(summary, /已保存的检查有未保存的更改/);
    assert.match(summary, /已更改: Unit tests \(edited\) \(test-unit\)/, "name and id verbatim");
    assert.match(await T(page, "graph-recipe-discard").innerText(), /放弃所有未保存的检查编辑/);
    assert.match(await T(page, "graph-return-unsaved").innerText(), /下一次运行不会使用/);
    await back(page);
    assert.match(
      await T(page, "graph-new-run-unsaved-checks").innerText(),
      /审阅和下一次运行使用这里显示的已保存检查/,
    );
    assert.match(await T(page, "graph-selected-check-unsaved").innerText(), /未保存编辑不会被使用/);
    assertClean(host);
  },
};

export const checksScenarios = [
  reviewUsesSaved,
  saveSummary,
  discardScope,
  unsummarizable,
  occupied,
  chinese,
];
