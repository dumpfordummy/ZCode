// UX-M1.2 browser scenarios (part 1): what the draft's workflow will use, the route to the one checks
// editor and back, and how unresolved selections behave.
import assert from "node:assert/strict";
import {
  T,
  admissionCalls,
  assertClean,
  REQUEST,
  boot,
  chooseChecks,
  chooseGeneric,
  preparedDraft,
  flush,
  inViewport,
  navigation,
  recipesReady,
  selectValue,
  started,
  stepRows,
  templateDraft,
  until,
  optionValues,
  SIZES,
} from "./ux-m1-helpers.mjs";
import { ALL_CHECKS, BUILD_ALT, BUILD_AS_COMMAND, LINT, TEST } from "./ux-m1-checks.mjs";

const refresh = async (page) => {
  await T(page, "graph-template-load-recipes").click();
  await recipesReady(page);
  await flush(page);
};
const prepared = preparedDraft;

const selectedChecks = {
  name: "the New-run pane shows the checks the chosen workflow will use, apart from the project-wide count",
  async run({ page, host, url }) {
    await host.seedRecipes("A", ALL_CHECKS);
    await boot(page, host, url);
    // 没有 Build/Test 步骤的工作流：不出现已选检查行，并且不暗示测试通过
    assert.equal(await page.locator('[data-testid^="graph-selected-checks-"]').count(), 0);
    assert.match(
      await T(page, "graph-template-verification").innerText(),
      /configured test evidence not included/,
    );
    assert.doesNotMatch(
      await T(page, "graph-new-run-pane").innerText(),
      /tests? passed|verified by tests/i,
    );
    await chooseGeneric(page);
    // 尚未选择：明确显示，并且没有替用户自动选一个
    for (const step of ["build", "test"]) {
      assert.deepEqual(await stepRows(page, step), [], `${step}: nothing selected yet`);
      assert.match(await T(page, `graph-selected-checks-${step}`).innerText(), /No check selected/);
    }
    assert.deepEqual(
      (await templateDraft(page, host))?.bindings.recipes ?? {},
      {},
      "nothing is chosen for the user",
    );
    await chooseChecks(page, { build: "build-main", test: "test-unit" });
    const [build] = await stepRows(page, "build");
    const [test] = await stepRows(page, "test");
    assert.deepEqual([build.id, build.state], ["build-main", "resolved"]);
    assert.match(build.text, /Compile solution.*Build.*Saved · not run/);
    assert.deepEqual([test.id, test.state], ["test-unit", "resolved"]);
    assert.match(test.text, /Unit tests.*Test.*Saved · not run/);
    // 草稿里存的是稳定 id
    assert.deepEqual((await templateDraft(page, host)).bindings.recipes, {
      build: "build-main",
      test: "test-unit",
    });
    // 项目范围的数量是另一件事，并且被标注为下一次运行的配置
    assert.match(await T(page, "graph-context-checks").innerText(), /5 saved · not run/);
    assert.match(await T(page, "graph-context-label").innerText(), /For the next run/);
    assert.deepEqual(admissionCalls(host), []);
    assertClean(host);
  },
};

const routeAndBack = {
  name: "Edit check opens that check in the one editor, keeps Back in view, and returns the identical draft",
  async run({ page, host, url }) {
    await page.setViewportSize(SIZES[0]);
    await prepared(page, host, url);
    const key = host.workspaces.A;
    const before = await templateDraft(page, host);
    // 键盘：聚焦 Edit check 后用 Enter 进入（不是鼠标点击）
    await page
      .locator(
        '[data-testid="graph-selected-checks-test"] [data-testid="graph-selected-check-edit"]',
      )
      .focus();
    await page.keyboard.press("Enter");
    await T(page, "graph-project-recipes").waitFor();
    const navigationState = (await navigation(page))[key];
    assert.deepEqual(
      [navigationState.mode, navigationState.returnToWorkflow, navigationState.checkId],
      ["setup", true, "test-unit"],
    );
    await T(page, "graph-guided-recipe").waitFor();
    assert.equal(await T(page, "graph-guided-recipe").getAttribute("data-recipe-id"), "test-unit");
    await until(
      () =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-testid="graph-recipes-guided"]')),
        ),
      "focus moved into the opened check",
    );
    // 编辑靠下的字段时，返回入口仍在视口里
    // 与真实应用一致：面板高度受限，滚动发生在 GraphEditor 自己的容器里。
    await page.evaluate(() => {
      const scroller = document.querySelector("[data-view]");
      scroller.scrollTop = scroller.scrollHeight;
    });
    await flush(page);
    assert.equal(await inViewport(page, "graph-return-to-workflow"), true, "Back stays reachable");
    assert.match(
      await T(page, "graph-return-note").innerText(),
      /request, context and check choices are kept/,
    );
    // 只是导航：没有保存、实例化、预检或运行
    assert.deepEqual(admissionCalls(host), []);
    assert.equal(started(host, "graph.recipes.save").length, 0);
    await T(page, "graph-return-to-workflow").focus();
    await page.keyboard.press("Enter");
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assert.deepEqual(
      await templateDraft(page, host),
      before,
      "the draft is identical after the round trip",
    );
    assert.deepEqual(
      (await stepRows(page, "test")).map((row) => [row.id, row.state]),
      [["test-unit", "resolved"]],
    );
    assert.equal((await navigation(page))[key].returnToWorkflow, false);
    assertClean(host);
  },
};

const unresolved = {
  name: "missing, incompatible and unselected steps are explicit, block Review, and are never replaced",
  async run({ page, host, url }) {
    await prepared(page, host, url);
    assert.equal(
      await T(page, "graph-review-run").isDisabled(),
      false,
      "a complete draft can be reviewed",
    );
    // 已保存的检查被外部改成命令类型：同一 id 仍在，但不能再用于 Build
    await host.seedRecipes("A", [BUILD_AS_COMMAND, BUILD_ALT, TEST, LINT]);
    await refresh(page);
    const [incompatible] = await stepRows(page, "build");
    assert.deepEqual([incompatible.id, incompatible.state], ["build-main", "incompatible"]);
    assert.match(incompatible.text, /build-main is saved but cannot be used for this step/);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    // 外部删除了它：缺失。另有一个兼容的检查（build-alt），也不会被自动选中
    await host.seedRecipes("A", [BUILD_ALT, TEST, LINT]);
    await refresh(page);
    const [missing] = await stepRows(page, "build");
    assert.deepEqual([missing.id, missing.state], ["build-main", "missing"]);
    assert.match(missing.text, /build-main is no longer in the saved checks/);
    assert.match(await T(page, "graph-template-unresolved").innerText(), /Build/);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.equal(
      (await templateDraft(page, host)).bindings.recipes.build,
      "build-main",
      "the stored choice is not replaced",
    );
    assert.ok(
      (await optionValues(page, "graph-template-recipe-build")).includes("build-alt"),
      "a compatible check exists",
    );
    assert.equal(
      (await stepRows(page, "build"))[0].id,
      "build-main",
      "and still is not chosen for the user",
    );
    // Open Checks（缺失项没有可编辑对象，不带 checkId）
    await T(page, "graph-selected-check-open").click();
    await T(page, "graph-project-recipes").waitFor();
    const key = host.workspaces.A;
    assert.equal((await navigation(page))[key].checkId, undefined);
    assert.equal((await navigation(page))[key].returnToWorkflow, true);
    await T(page, "graph-return-to-workflow").click();
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    // 只有用户显式选择才会改变，之后恢复可审阅
    await selectValue(page, "graph-template-recipe-build", "build-alt");
    assert.deepEqual(
      (await stepRows(page, "build")).map((row) => [row.id, row.state]),
      [["build-alt", "resolved"]],
    );
    await until(
      async () => !(await T(page, "graph-review-run").isDisabled()),
      "Review available after an explicit choice",
    );
    // 没有选择的步骤：明确阻止，不猜测
    await selectValue(page, "graph-template-recipe-test", "unbound");
    assert.match(await T(page, "graph-selected-checks-test").innerText(), /No check selected/);
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.deepEqual(admissionCalls(host), [], "no instantiate, preflight or run happened");
    assertClean(host);
  },
};

const payloadMatches = {
  name: "instantiate and preflight use exactly the checks shown, and the review lists the same checks",
  async run({ page, host, url }) {
    await prepared(page, host, url);
    await selectValue(page, "graph-template-recipe-test", "test-extra");
    const shown = Object.fromEntries(
      await Promise.all(
        ["build", "test"].map(async (step) => [
          step,
          (await stepRows(page, step)).map((row) => row.id),
        ]),
      ),
    );
    assert.deepEqual(shown, { build: ["build-main"], test: ["test-extra"] });
    assert.match((await stepRows(page, "test"))[0].text, /Integration tests/);
    await T(page, "graph-review-run").click();
    await T(page, "graph-run-confirmation").waitFor();
    const [instantiate] = started(host, "wf.instantiate");
    assert.deepEqual(instantiate.bindings.recipes, { build: "build-main", test: "test-extra" });
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(instantiate.bindings.recipes).map(([node, id]) => [node, [id]]),
      ),
      shown,
      "payload equals the visible choices",
    );
    assert.equal(instantiate.parameters.request, REQUEST);
    assert.equal(started(host, "wf.prepare").length, 1);
    const review = await T(page, "graph-run-confirmation").evaluate(
      (element) => element.textContent,
    );
    for (const id of ["build-main", "test-extra"])
      assert.match(review, new RegExp(id), `${id} is in the review`);
    for (const id of ["build-alt", "test-unit", "lint"])
      assert.doesNotMatch(review, new RegExp(`"${id}"`), `${id} is not`);
    assert.equal(started(host, "graph.run").length, 0, "nothing starts before the explicit Start");
    assertClean(host);
  },
};

export const checkScenarios = [selectedChecks, routeAndBack, unresolved, payloadMatches];
