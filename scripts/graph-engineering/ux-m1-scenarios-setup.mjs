// UX-M1.2 browser scenarios (part 2): saving checks, failures and cancel, an occupying run, late replies
// and Simplified Chinese. Saves go through the real recipe store over a real temporary workspace.
import assert from "node:assert/strict";
import {
  REQUEST,
  T,
  admissionCalls,
  assertClean,
  boot,
  chooseChecks,
  chooseGeneric,
  drafts,
  editCheckByKeyboard,
  flush,
  invokeHandler,
  navigation,
  preparedDraft,
  setState,
  started,
  stepRows,
  templateDraft,
  until,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS, BUILD, BUILD_ALT, LINT, TEST, TEST_EXTRA } from "./ux-m1-checks.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";

const save = async (page) => {
  await T(page, "graph-save-recipes").click();
};
const alertWith = (page, pattern) => page.getByRole("alert").filter({ hasText: pattern }).first();
const back = async (page) => {
  await T(page, "graph-return-to-workflow").click();
  await T(page, "graph-template-parameter-request").waitFor();
};
const names = async (host) => (await host.readRecipes("A")).recipes.map((recipe) => recipe.name);

const explicitSaves = {
  name: "a rename keeps the selection; a removal turns it unresolved and is not replaced (real saves through the real recipe store)",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    const key = host.workspaces.A;
    const before = await templateDraft(page, host);
    await editCheckByKeyboard(page, "build");
    await T(page, "graph-recipe-field-0-name").fill("Compile solution (release)");
    await save(page);
    await T(page, "graph-recipes-saved").waitFor();
    const [payload] = started(host, "graph.recipes.save");
    assert.deepEqual(
      payload.recipeIds,
      ALL_CHECKS.map((check) => check.id),
    );
    assert.match(payload.expectedDigest, /^[0-9a-f]{64}$/);
    assert.ok(
      (await names(host)).includes("Compile solution (release)"),
      "the real store was written",
    );
    await back(page);
    const [build] = await stepRows(page, "build");
    assert.deepEqual(
      [build.id, build.state],
      ["build-main", "resolved"],
      "the selection survives a rename",
    );
    assert.match(build.text, /Compile solution \(release\)/);
    assert.deepEqual(await templateDraft(page, host), before, "the draft never changed");
    assert.equal(await T(page, "graph-review-run").isDisabled(), false);
    // 通过 Advanced 的原始 JSON 删除该检查并显式保存
    await editCheckByKeyboard(page, "test");
    const json = JSON.parse(await T(page, "graph-recipes-json").inputValue());
    await T(page, "graph-recipes-json").evaluate((element) => {
      const disclosure = element.closest("details");
      if (disclosure) disclosure.open = true;
    });
    await T(page, "graph-recipes-json").fill(
      JSON.stringify(json.filter((check) => check.id !== "build-main")),
    );
    await until(
      async () => (await T(page, "graph-recipes-saved").count()) === 0,
      "saved notice cleared by the edit",
    );
    await save(page);
    await T(page, "graph-recipes-saved").waitFor();
    assert.equal(started(host, "graph.recipes.save").length, 2);
    await back(page);
    const [missing] = await stepRows(page, "build");
    assert.deepEqual([missing.id, missing.state], ["build-main", "missing"]);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.equal(
      (await templateDraft(page, host)).bindings.recipes.build,
      "build-main",
      "not replaced by build-alt",
    );
    assert.equal((await navigation(page))[key].returnToWorkflow, false);
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const failuresKeepDraft = {
  name: "cancel, a failed save and a digest conflict leave the request, workflow, references and check choices untouched",
  async run({ page, host, url }) {
    await preparedDraft(page, host, url);
    const before = await templateDraft(page, host);
    const original = await names(host);
    await editCheckByKeyboard(page, "build");
    await T(page, "graph-recipe-field-0-name").fill("Compile solution (edited)");
    await back(page); // 取消：没有保存
    assert.deepEqual(await templateDraft(page, host), before);
    assert.deepEqual(await names(host), original, "cancel wrote nothing");
    assert.match((await stepRows(page, "build"))[0].text, /Compile solution Build/);
    // 重新进入：未保存的检查编辑被保留（既有行为），仍未保存
    await editCheckByKeyboard(page, "build");
    assert.equal(
      await T(page, "graph-recipe-field-0-name").inputValue(),
      "Compile solution (edited)",
    );
    // 保存失败
    host.fail("graph.recipes.save", "disk full");
    await save(page);
    await alertWith(page, /disk full/).waitFor();
    assert.equal(await T(page, "graph-recipes-saved").count(), 0);
    assert.deepEqual(await names(host), original, "a failed save wrote nothing");
    host.fail("graph.recipes.save");
    // 外部修改造成摘要冲突（真实的检查存储拒绝覆盖）
    await host.seedRecipes("A", [
      { ...BUILD, name: "Changed outside" },
      BUILD_ALT,
      TEST,
      TEST_EXTRA,
      LINT,
    ]);
    await save(page);
    await alertWith(page, /configuration changed/i).waitFor();
    assert.equal(
      (await names(host))[0],
      "Changed outside",
      "the external edit was not overwritten",
    );
    await back(page);
    assert.deepEqual(
      await templateDraft(page, host),
      before,
      "request, references and choices are unchanged",
    );
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    // UX-M1.4（Windows 原生验收发现）：检查保存失败的原因属于 Checks 编辑器，
    // 返回新运行后不能显示在「Review and run」旁边，好像是 Review 失败了。
    assert.equal(
      await T(page, "graph-new-run-error").count(),
      0,
      "a failed check save is not shown beside Review and run after Back to new run",
    );
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const occupied = {
  name: "while a run is unresolved the draft and the checks editor stay usable, but saving checks is refused on every path",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun()]);
    await preparedDraft(page, host, url);
    const before = await templateDraft(page, host);
    await editCheckByKeyboard(page, "test"); // 跳转不是变更：占用期间仍可用
    assert.equal(await T(page, "graph-save-recipes").isDisabled(), true);
    assert.match(
      await page.locator("#graph-recipe-save-reason").innerText(),
      /blocked while a run is unresolved/,
    );
    await T(page, "graph-recipe-field-2-name").fill("Unit tests (edited)"); // 编辑仍被允许
    // UX-M2.2：未保存编辑的披露改为 Save 旁的变更摘要（按稳定 id 列出）。
    assert.match(
      await T(page, "graph-recipe-changes").innerText(),
      /Unsaved changes to saved checks/,
    );
    assert.equal(
      await page
        .locator('[data-testid="graph-recipe-change"][data-change="modified"]')
        .getAttribute("data-check-id"),
      "test-unit",
    );
    await invokeHandler(page, "graph-save-recipes"); // 备用控件：处理函数自身拒绝
    await flush(page);
    await until(() => page.evaluate(() => Boolean(window.__probe?.view)), "probe view loaded");
    const returned = await page.evaluate(
      async () => (await window.__probe.saveRecipes([], "d".repeat(64))) ?? null,
    );
    assert.equal(returned, null, "the hook refuses without any button");
    await until(
      async () =>
        /Graph admission is blocked: run run-permission is still unresolved/.test(
          String(await page.evaluate(() => window.__probe.error)),
        ),
      "refused by the admission guard",
    );
    assert.equal(started(host, "graph.recipes.save").length, 0, "no save reached the Host");
    assert.equal(started(host, "validate").length, 0);
    await back(page);
    assert.deepEqual(await templateDraft(page, host), before);
    await T(page, "graph-view-current-run").waitFor();
    // 运行结束后：显式保存才会写入，选择按稳定 id 保持
    host.resolveRuns("A");
    await editCheckByKeyboard(page, "test");
    await until(
      async () => !(await T(page, "graph-save-recipes").isDisabled()),
      "save allowed once resolved",
    );
    assert.equal(started(host, "graph.recipes.save").length, 0, "nothing was saved automatically");
    await save(page);
    await T(page, "graph-recipes-saved").waitFor();
    assert.equal(started(host, "graph.recipes.save").length, 1);
    assert.ok((await names(host)).includes("Unit tests (edited)"));
    await back(page);
    assert.deepEqual(
      (await stepRows(page, "test")).map((row) => [row.id, row.state]),
      [["test-unit", "resolved"]],
    );
    assertClean(host);
  },
};

const lateReplies = {
  name: "a saved-checks reply that arrives after a workspace switch does not change the other workspace or any draft",
  async run({ page, host, url }) {
    await host.seedRecipes("A", ALL_CHECKS);
    await host.seedRecipes("B", [BUILD]);
    host.hold("graph.recipes.read");
    await boot(page, host, url);
    await T(page, "graph-template-parameter-request").fill("Draft A");
    const OP = "graph.recipes.read";
    const settle = () => new Promise((resolve) => setTimeout(resolve, 500));
    // 开发模式（StrictMode）下同一编辑器可能发起不止一次读取；它们都停在 Host，且较旧的读取不得覆盖较新的。
    await until(() => host.waiting(OP) >= 1, "A's read is held");
    await settle();
    const fromA = host.waiting(OP);
    await setState(page, { workspace: "B" });
    await T(page, "graph-template-parameter-request").waitFor();
    await T(page, "graph-template-parameter-request").fill("Draft B");
    await until(() => host.waiting(OP) > fromA, "B's read is held");
    await settle();
    const doneBefore = host.calls.filter((call) => call.op === OP && call.phase === "done").length;
    for (let index = 0; index < fromA; index += 1) host.releaseOne(OP, 0); // A 的回执晚到
    await until(
      () =>
        host.calls.filter((call) => call.op === OP && call.phase === "done").length ===
        doneBefore + fromA,
      "A's late replies were delivered",
    );
    await flush(page);
    assert.match(
      await T(page, "graph-context-checks").innerText(),
      /loading/,
      "B still waits for its own reply",
    );
    host.release(OP);
    await until(
      async () => /1 saved/.test(await T(page, "graph-context-checks").innerText()),
      "B shows its own count",
    );
    await setState(page, { workspace: "A" });
    await until(
      async () => /5 saved/.test(await T(page, "graph-context-checks").innerText()),
      "A shows its own count",
    );
    const all = await drafts(page);
    assert.equal(
      all[host.workspaces.A].templates[host.library.key("agent-assisted")].parameters.request,
      "Draft A",
    );
    assert.equal(
      all[host.workspaces.B].templates[host.library.key("agent-assisted")].parameters.request,
      "Draft B",
    );
    const reads = started(host, "graph.recipes.read").map((call) => call.workspace);
    assert.equal(reads[0], "A", "A's read was the older one");
    assert.ok(reads.includes("B") && reads.indexOf("B") > 0, "B's read started after A's");
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const chinese = {
  name: "Simplified Chinese: new labels are localized; check names, ids and paths are not translated",
  async run({ page, host, url }) {
    host.setRuns("A", [permissionWaitRun()]);
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url, { locale: "zh-CN" });
    await chooseGeneric(page);
    await T(page, "graph-template-parameter-request").fill(REQUEST);
    await chooseChecks(page, { build: "build-main", test: "test-unit" });
    assert.match(await T(page, "graph-context-label").innerText(), /用于下一次运行/);
    const [build] = await stepRows(page, "build");
    assert.match(build.text, /Compile solution.*构建.*已保存 · 未运行/);
    assert.equal(
      await page
        .locator(
          '[data-testid="graph-selected-checks-build"] [data-testid="graph-selected-check-edit"]',
        )
        .getAttribute("aria-label"),
      "编辑检查 Compile solution",
    );
    assert.match(await T(page, "graph-new-run-blocked").innerText(), /当前运行仍占用此工作区/);
    await editCheckByKeyboard(page, "test");
    assert.match(await T(page, "graph-return-note").innerText(), /请求、上下文和检查选择都会保留/);
    assert.match(
      await page.locator("#graph-recipe-save-reason").innerText(),
      /运行尚未结束时不能保存检查/,
    );
    assert.equal(
      await T(page, "graph-recipe-field-2-name").inputValue(),
      "Unit tests",
      "the check name is untouched",
    );
    await back(page);
    await host.seedRecipes("A", [BUILD_ALT, TEST, LINT]);
    await T(page, "graph-template-load-recipes").click();
    await until(
      async () => (await stepRows(page, "build"))[0]?.state === "missing",
      "missing after refresh",
    );
    assert.match((await stepRows(page, "build"))[0].text, /已保存的检查中不再有 build-main/);
    assertClean(host);
  },
};
export const setupScenarios = [explicitSaves, failuresKeepDraft, occupied, lateReplies, chinese];
