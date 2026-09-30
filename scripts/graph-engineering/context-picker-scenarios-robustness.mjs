// Context picker 浏览器场景（二）：迟到回执、加载/空/错误态、Advanced、禁用、本地化与截图。
import assert from "node:assert/strict";
import {
  SIZES,
  T,
  addByKeyboard,
  assertClean,
  boot,
  draft,
  finished,
  flush,
  openPicker,
  optionCount,
  pickByKeyboard,
  references,
  search,
  setState,
  shot,
  started,
  statusOf,
  until,
} from "./context-picker-helpers.mjs";

export const robustnessScenarios = [
  {
    name: "late validation replies are ignored after workspace switch, template change, close, slot change or another writer",
    async run({ page, host, url }) {
      const startHeldSelection = async (query = "Context") => {
        host.hold("validate-reference");
        await openPicker(page);
        await search(page, query);
        await until(async () => (await optionCount(page)) > 0, "results");
        await pickByKeyboard(page, 0);
        await until(() => host.waiting("validate-reference") === 1, "validation held at the Host");
      };
      const settle = async () => {
        host.release("validate-reference");
        await until(() => finished(host, "validate-reference").length >= 1, "late reply delivered");
        await flush(page);
      };
      const stateOf = async () => ({
        a: await references(page, "A"),
        b: await references(page, "B"),
        aRequired: await references(page, "A", "required"),
      });

      // 1) 切换工作区
      await boot(page, host, url);
      await startHeldSelection();
      await setState(page, { workspace: "B" });
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      await settle();
      assert.deepEqual(await stateOf(), { a: {}, b: {}, aRequired: {} }, "workspace switch");
      assert.equal(
        await T(page, "graph-context-chips").count(),
        0,
        "no chip leaked into workspace B",
      );
      // 正向对照：B 仍可正常选择，且用的是 B 自己的文件
      host.reset();
      await addByKeyboard(page, "Context", "instructions");
      assert.deepEqual((await stateOf()).b, { instructions: "docs/Context.md" });
      assert.equal(started(host, "validate-reference").at(-1).workspace, "B");
      await setState(page, { workspace: "A" });
      await flush(page);
      assert.deepEqual((await stateOf()).a, {}, "A untouched by B's selection");

      // 2) 切换模板
      host.reset();
      await boot(page, host, url);
      await startHeldSelection();
      await setState(page, { template: "required" });
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      await settle();
      assert.deepEqual(await stateOf(), { a: {}, b: {}, aRequired: {} }, "template change");

      // 3) 关闭选择器
      host.reset();
      await boot(page, host, url);
      await startHeldSelection();
      await page.keyboard.press("Escape");
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      await settle();
      assert.deepEqual(await stateOf(), { a: {}, b: {}, aRequired: {} }, "closed picker");

      // 4) 切换槽位（验证进行中改选另一个槽位）
      host.reset();
      await boot(page, host, url);
      await startHeldSelection();
      await T(page, "graph-context-slot-skill").check();
      await settle();
      assert.deepEqual(await stateOf(), { a: {}, b: {}, aRequired: {} }, "slot change");

      // 5) 另一个写入者在验证期间移除/替换了该槽位（Advanced 输入、其他窗口等价物）
      host.reset();
      await boot(page, host, url);
      await addByKeyboard(page, "Context", "instructions");
      host.reset();
      host.hold("validate-reference");
      await T(page, "graph-context-replace-instructions").click();
      await search(page, "Extra");
      await until(async () => (await optionCount(page)) > 0, "results");
      await pickByKeyboard(page, 0);
      await until(() => host.waiting("validate-reference") === 1, "validation held");
      await page.evaluate(() => {
        const current = window.__harness.draft("A", "agent-assisted");
        window.__harness.seedDraft("A", "agent-assisted", {
          ...current,
          bindings: { ...current.bindings, references: { instructions: "docs/Other.md" } },
        });
      });
      await settle();
      assert.equal(
        (await references(page, "A")).instructions,
        "docs/Other.md",
        "the newer writer wins",
      );
      assertClean(host);
    },
  },
  {
    name: "late search replies never replace newer results or survive closing the picker",
    async run({ page, host, url }) {
      await boot(page, host, url);
      host.hold("searchWorkspaceFiles");
      await openPicker(page);
      await search(page, "Context");
      await until(() => host.waiting("searchWorkspaceFiles") === 1, "first search held");
      await search(page, "Extra");
      await until(() => host.waiting("searchWorkspaceFiles") === 2, "second search held");
      assert.match(await T(page, "graph-context-popover").innerText(), /Reading…/);
      // 较新的请求先返回，较旧的请求后到：旧结果不得覆盖。
      host.releaseOne("searchWorkspaceFiles", 1);
      await until(async () => (await optionCount(page)) === 1, "newer results");
      assert.equal(
        await T(page, "graph-context-option-0").getAttribute("data-value"),
        "docs/Extra.md",
      );
      host.releaseOne("searchWorkspaceFiles", 0);
      await until(
        () => finished(host, "searchWorkspaceFiles").length === 2,
        "stale reply delivered",
      );
      await flush(page);
      assert.equal(await optionCount(page), 1);
      assert.equal(
        await T(page, "graph-context-option-0").getAttribute("data-value"),
        "docs/Extra.md",
      );

      // 关闭后到达的搜索结果不会出现在重新打开的选择器里
      host.hold("searchWorkspaceFiles");
      await search(page, "Context");
      await until(() => host.waiting("searchWorkspaceFiles") === 1, "search held");
      await page.keyboard.press("Escape");
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      host.release("searchWorkspaceFiles");
      await until(
        () => finished(host, "searchWorkspaceFiles").length === 3,
        "late reply delivered",
      );
      await openPicker(page);
      await flush(page);
      // 目录里的原生指令条目在空查询时本来就会列出；迟到的文件搜索结果不得出现。
      assert.equal(await page.locator('[data-group="file"]').count(), 0);
      assert.equal(await page.locator('[data-value="docs/Context.md"]').count(), 0);
      assertClean(host);
    },
  },
  {
    name: "loading, empty, search error, catalogue error with retry, and unsupported are shown honestly",
    async run({ page, host, url }) {
      await boot(page, host, url);
      host.hold("searchWorkspaceFiles");
      await openPicker(page);
      await search(page, "Context");
      await until(() => host.waiting("searchWorkspaceFiles") === 1, "held");
      assert.match(await T(page, "graph-context-popover").innerText(), /Reading…/);
      host.release("searchWorkspaceFiles");
      await search(page, "zzzz-nothing");
      await T(page, "graph-context-empty").waitFor();
      assert.match(await T(page, "graph-context-empty").innerText(), /No matches\./);
      host.fail("searchWorkspaceFiles", "Fixture: search backend offline");
      await search(page, "Context");
      await T(page, "graph-context-search-error").waitFor();
      assert.match(
        await T(page, "graph-context-search-error").innerText(),
        /search backend offline/,
      );
      assert.deepEqual(await references(page), {});
      await page.keyboard.press("Escape");

      // 目录读取失败 → 明确错误 + 重试；恢复后技能可选
      host.reset();
      host.fail("reference-catalog", "Fixture: catalogue offline");
      await boot(page, host, url);
      await openPicker(page);
      await T(page, "graph-context-slot-skill").check();
      await T(page, "graph-context-catalog-error").waitFor();
      assert.match(await T(page, "graph-context-catalog-error").innerText(), /catalogue offline/);
      assert.equal(await optionCount(page), 0);
      host.fail("reference-catalog", null);
      await T(page, "graph-context-catalog-error").getByRole("button").click();
      await until(async () => (await optionCount(page)) === 3, "skills after retry");

      // 工作区不支持
      host.reset();
      await boot(page, host, url, { unsupported: true });
      assert.equal(await T(page, "graph-context-add").isDisabled(), true);
      assertClean(host);
    },
  },
  {
    name: "advanced route: raw fields keep their ids, drive the same payload, and show every value",
    async run({ page, host, url }) {
      await boot(page, host, url);
      const advanced = T(page, "graph-context-advanced");
      assert.equal(await advanced.evaluate((element) => element.open), false);
      await advanced.locator("summary").click();
      await T(page, "graph-template-reference-instructions").fill("Context.md");
      await T(page, "graph-context-chip-instructions").waitFor();
      assert.equal(
        await statusOf(page, "instructions"),
        "not-checked",
        "raw values are not claimed as validated",
      );
      let bindings = (await draft(page)).bindings;
      assert.deepEqual(bindings.references, { instructions: "Context.md" });
      assert.equal("referencePolicy" in bindings, false, "raw entry does not set the policy");
      await T(page, "graph-template-reference-skill").fill("glm:workspace:fixture-guidance");
      await T(page, "graph-context-chip-skill").waitFor();
      assert.equal(started(host, "validate-reference").length, 0);
      await T(page, "graph-template-reference-instructions").fill("   ");
      await T(page, "graph-context-chip-instructions").waitFor({ state: "detached" });
      bindings = (await draft(page)).bindings;
      assert.equal("instructions" in bindings.references, false, "blank means unset");
      // 选择器无法表示的值（未声明的 role）不被静默丢弃
      await page.evaluate(() => {
        const current = window.__harness.draft("A", "agent-assisted");
        window.__harness.seedDraft("A", "agent-assisted", {
          ...current,
          bindings: {
            ...current.bindings,
            references: { ...current.bindings.references, retired: "old.md" },
          },
        });
      });
      await T(page, "graph-context-chip-retired").waitFor();
      assert.equal(await statusOf(page, "retired"), "orphan");
      assert.equal(await T(page, "graph-context-replace-retired").count(), 0);
      await T(page, "graph-context-remove-retired").click();
      await T(page, "graph-context-chip-retired").waitFor({ state: "detached" });
      assert.equal("retired" in (await references(page)), false);
      assertClean(host);
    },
  },
  {
    name: "disabled while a run is unresolved: no control can change context",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await addByKeyboard(page, "Context", "instructions");
      await setState(page, { disabled: true });
      await flush(page);
      for (const id of [
        "graph-context-add",
        "graph-context-replace-instructions",
        "graph-context-remove-instructions",
        "graph-template-reference-instructions",
      ])
        assert.equal(await T(page, id).isDisabled(), true, `${id} is disabled`);
      assertClean(host);
    },
  },
  {
    name: "Simplified Chinese: UI-owned labels are localized; stored paths, ids and Host text are untouched",
    async run({ page, host, url }) {
      await boot(page, host, url, { locale: "zh-CN" });
      assert.match(await T(page, "graph-context-add").innerText(), /添加上下文/);
      await addByKeyboard(page, "AGENTS", "instructions");
      const section = await T(page, "graph-reference-bindings").innerText();
      assert.match(section, /上下文/);
      assert.match(section, /供 .* 使用/);
      assert.match(section, /已作为原生指令提供/);
      assert.match(section, /AGENTS\.md/, "the stored path is shown exactly");
      assert.doesNotMatch(
        section,
        /\b(Add context|Replace|Remove|Used by|Not checked yet|Required)\b/,
      );
      await T(page, "graph-context-replace-instructions").click();
      const picker = await T(page, "graph-context-popover").innerText();
      assert.match(picker, /添加到|当前为|选择结果会替换/);
      assert.match(picker, /AGENTS\.md/);
      assert.doesNotMatch(picker, /\b(Add to|Selecting a result|Type to search)\b/);
      await page.keyboard.press("Escape");
      assertClean(host);
    },
  },
  {
    name: "screenshots: selected context, search results, required reference removed (1280x720 and 1920x1080)",
    async run({ page, host, url, shotsDir }) {
      if (!shotsDir) return;
      const showSection = () =>
        T(page, "graph-reference-bindings").evaluate((element) =>
          element.scrollIntoView({ block: "start" }),
        );
      await boot(page, host, url);
      await T(page, "graph-template-parameter-request").fill("Document the retry policy");
      await addByKeyboard(page, "Context", "instructions");
      await openPicker(page);
      await T(page, "graph-context-slot-skill").check();
      await until(async () => (await optionCount(page)) === 3, "skills");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await T(page, "graph-context-chip-skill").waitFor();
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await showSection();
        await shot(page, shotsDir, "selected-context", size);
      }
      // 搜索结果（活动项高亮）
      await T(page, "graph-context-replace-instructions").click();
      await search(page, "docs");
      await until(async () => (await optionCount(page)) > 1, "results");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await showSection();
        await shot(page, shotsDir, "search-results", size);
      }
      await page.keyboard.press("Escape");

      // 必填引用被移除
      await setState(page, { template: "required" });
      await T(page, "graph-context-missing-gameDoc").waitFor();
      await T(page, "graph-template-parameter-request").fill("Document the retry policy");
      await T(page, "graph-context-choose-gameDoc").click();
      await search(page, "GameDoc");
      await until(async () => (await optionCount(page)) > 0, "results");
      await pickByKeyboard(page, 0);
      await T(page, "graph-context-chip-gameDoc").waitFor();
      await T(page, "graph-context-remove-gameDoc").click();
      await T(page, "graph-context-missing-gameDoc").waitFor();
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await showSection();
        await shot(page, shotsDir, "required-removed", size);
      }
      // 补充：简体中文 + 浅色
      await setState(page, { locale: "zh-CN", theme: "zai-light" });
      await page.setViewportSize(SIZES[0]);
      await showSection();
      await shot(page, shotsDir, "required-removed-zh-CN-light", SIZES[0]);
      assertClean(host);
    },
  },
];
