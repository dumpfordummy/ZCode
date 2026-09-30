// Context picker 浏览器场景（一）：添加 / 交付事实 / 技能 / 替换 / 移除 / 取消 / 验证失败。
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
  focused,
  instantiations,
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

export const coreScenarios = [
  {
    name: "keyboard: add a file; nothing is active until the user moves; Enter never starts the workflow",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await openPicker(page);
      assert.equal(
        await T(page, "graph-context-picker").getAttribute("data-slot-id"),
        "instructions",
      );
      await search(page, "Context");
      await until(async () => (await optionCount(page)) > 0, "results");
      assert.equal(
        await T(page, "graph-context-option-0").getAttribute("data-value"),
        "docs/Context.md",
      );
      const combobox = T(page, "graph-context-search");
      assert.equal(
        await combobox.getAttribute("aria-activedescendant"),
        null,
        "no option is active",
      );
      // 没有活动项时 Enter 什么也不做：不选择、不关闭、不提交、不评审。
      await page.keyboard.press("Enter");
      await flush(page);
      assert.deepEqual(await references(page), {});
      await T(page, "graph-context-popover").waitFor();
      await page.keyboard.press("ArrowDown");
      assert.notEqual(await combobox.getAttribute("aria-activedescendant"), null);
      assert.equal(await T(page, "graph-context-option-0").getAttribute("aria-selected"), "true");
      await page.keyboard.press("Enter");
      await T(page, "graph-context-chip-instructions").waitFor();
      // 负载（草稿 store）而不是 chip 文案
      const bindings = (await draft(page)).bindings;
      assert.deepEqual(bindings.references, { instructions: "docs/Context.md" });
      assert.equal(bindings.referencePolicy, "native-aware-v1");
      assert.equal(await statusOf(page, "instructions"), "explicit-read");
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      assert.equal(await focused(page), "graph-context-add", "focus returns to the opener");
      assert.equal(started(host, "validate-reference").length, 1);
      assert.equal(started(host, "validate-reference")[0].path, "docs/Context.md");
      assertClean(host);
    },
  },
  {
    name: "native delivery comes only from the Host: AGENTS.md is native-instructions, unknown stays unknown",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await openPicker(page);
      await search(page, "AGENTS");
      await until(async () => (await optionCount(page)) > 0, "results");
      assert.equal(
        await T(page, "graph-context-option-0").getAttribute("data-group"),
        "instruction",
      );
      assert.equal(await optionCount(page), 1, "the same file is not offered twice");
      await pickByKeyboard(page, 0);
      await T(page, "graph-context-chip-instructions").waitFor();
      assert.equal(await statusOf(page, "instructions"), "native-instructions");
      assert.match(
        await T(page, "graph-context-status-instructions").innerText(),
        /Already delivered as native instructions/,
      );

      // 环境未知：Host 只能给出 explicit-read 和它自己的说明；UI 不得声称已交付。
      host.reset();
      host.setEnvironment("unknown");
      await boot(page, host, url);
      await openPicker(page);
      await T(page, "graph-context-catalog-unknown").waitFor();
      assert.match(
        await T(page, "graph-context-catalog-unknown").innerText(),
        /no native runtime has been initialized/,
      );
      await search(page, "AGENTS");
      await until(async () => (await optionCount(page)) > 0, "results");
      assert.equal(await T(page, "graph-context-option-0").getAttribute("data-group"), "file");
      await pickByKeyboard(page, 0);
      await T(page, "graph-context-chip-instructions").waitFor();
      assert.equal(await statusOf(page, "instructions"), "explicit-read");
      assert.match(
        await T(page, "graph-context-chip-instructions").innerText(),
        /Native instruction delivery is Unknown/,
      );
      assert.doesNotMatch(await T(page, "graph-reference-bindings").innerText(), /inherit/i);
      assertClean(host);
    },
  },
  {
    name: "skills: identity and enablement from the catalogue; disabled skills are listed but cannot be selected",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await openPicker(page);
      await T(page, "graph-context-slot-skill").check();
      await until(async () => (await optionCount(page)) === 3, "three catalogue skills");
      assert.equal(await T(page, "graph-context-option-1").getAttribute("aria-disabled"), "true");
      assert.equal(await T(page, "graph-context-option-2").getAttribute("aria-disabled"), "true");
      await T(page, "graph-context-search").focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await flush(page);
      assert.deepEqual(await references(page), {}, "a disabled skill cannot be chosen with Enter");
      // Playwright 拒绝点击 aria-disabled 元素；真实用户可以点，所以强制点击来证明它同样无效。
      await T(page, "graph-context-option-1").click({ force: true });
      await flush(page);
      assert.deepEqual(await references(page), {}, "nor with the mouse");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await T(page, "graph-context-chip-skill").waitFor();
      const bindings = (await draft(page)).bindings;
      assert.deepEqual(bindings.references, { skill: "glm:workspace:fixture-guidance" });
      assert.equal(await statusOf(page, "skill"), "skill-available");
      const chip = await T(page, "graph-context-chip-skill").innerText();
      assert.match(chip, /Fixture guidance/);
      assert.match(chip, /glm:workspace:fixture-guidance · workspace/);
      assert.equal(
        started(host, "validate-reference").length,
        0,
        "skills use the catalogue, not file validation",
      );
      assertClean(host);
    },
  },
  {
    name: "replace is explicit, touches only that role, and there is never a second chip for a role",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await addByKeyboard(page, "Context", "instructions");
      await T(page, "graph-context-replace-instructions").click();
      await T(page, "graph-context-search").waitFor();
      assert.equal(
        await T(page, "graph-context-picker").getAttribute("data-slot-id"),
        "instructions",
      );
      assert.match(
        await T(page, "graph-context-replace-notice").innerText(),
        /replaces docs\/Context\.md/,
      );
      await search(page, "Extra");
      await until(async () => (await optionCount(page)) > 0, "results");
      await pickByKeyboard(page, 0);
      await until(
        async () => (await references(page)).instructions === "docs/Extra.md",
        "replacement",
      );
      assert.equal(await T(page, "graph-context-chip-instructions").count(), 1);
      assert.match(await T(page, "graph-context-value-instructions").innerText(), /Extra\.md/);
      assert.match(await T(page, "graph-context-live").innerText(), /replaced docs\/Context\.md/);
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      assert.equal(await focused(page), "graph-context-replace-instructions");
      assert.deepEqual(Object.keys(await references(page)), ["instructions"]);
      assertClean(host);
    },
  },
  {
    name: "remove: an optional reference is deleted; a required one becomes missing, blocks Review, and is never optional",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await addByKeyboard(page, "Context", "instructions");
      const before = (await draft(page)).bindings;
      await T(page, "graph-context-remove-instructions").click();
      await T(page, "graph-context-chip-instructions").waitFor({ state: "detached" });
      const after = (await draft(page)).bindings;
      assert.equal("instructions" in after.references, false, "the key is deleted");
      assert.equal(after.referencePolicy, before.referencePolicy, "policy untouched");
      assert.deepEqual(
        { ...after, references: 0 },
        { ...before, references: 0 },
        "every other field identical",
      );
      assert.equal(await focused(page), "graph-context-add");
      assert.match(await T(page, "graph-context-live").innerText(), /Removed docs\/Context\.md/);

      // 必填：派生模板多一个必填文档 role
      await setState(page, { template: "required" });
      await T(page, "graph-context-missing-gameDoc").waitFor();
      await T(page, "graph-template-parameter-request").fill("Fix the thing");
      assert.equal(
        await T(page, "graph-review-run").isDisabled(),
        true,
        "required reference missing blocks Review",
      );
      await T(page, "graph-context-choose-gameDoc").click();
      await T(page, "graph-context-search").waitFor();
      assert.equal(await T(page, "graph-context-picker").getAttribute("data-slot-id"), "gameDoc");
      await search(page, "GameDoc");
      await until(async () => (await optionCount(page)) > 0, "results");
      await pickByKeyboard(page, 0);
      await T(page, "graph-context-chip-gameDoc").waitFor();
      await until(
        async () => !(await T(page, "graph-review-run").isDisabled()),
        "Review enabled once satisfied",
      );
      await T(page, "graph-context-remove-gameDoc").click();
      await T(page, "graph-context-missing-gameDoc").waitFor();
      assert.match(
        await T(page, "graph-context-missing-gameDoc").innerText(),
        /Authoritative GameDoc is required/,
      );
      assert.equal(await T(page, "graph-review-run").isDisabled(), true);
      assert.match(await T(page, "graph-template-unresolved").innerText(), /Authoritative GameDoc/);
      assert.equal("gameDoc" in (await references(page, "A", "required")), false);
      assert.match(await T(page, "graph-context-summary").innerText(), /1 required missing/);
      // 再次满足后，评审得到的负载就是草稿里的 bindings
      await T(page, "graph-context-choose-gameDoc").click();
      await search(page, "GameDoc");
      await until(async () => (await optionCount(page)) > 0, "results");
      await pickByKeyboard(page, 0);
      await until(
        async () => !(await T(page, "graph-review-run").isDisabled()),
        "Review enabled again",
      );
      assert.equal(instantiations(host).length, 0, "nothing started while editing context");
      await T(page, "graph-review-run").click();
      await until(() => instantiations(host).length === 1, "explicit Review click");
      const sent = instantiations(host)[0];
      assert.equal(sent.continuation, "review");
      assert.deepEqual(sent.bindings, (await draft(page, "A", "required")).bindings);
      assert.equal(sent.bindings.references.gameDoc, "docs/GameDoc.md");
      assertClean(host, 1);
    },
  },
  {
    name: "escape and cancel restore focus and keep the previous binding; Enter in the picker never submits",
    async run({ page, host, url }) {
      await boot(page, host, url);
      await openPicker(page);
      await search(page, "Context");
      await until(async () => (await optionCount(page)) > 0, "results");
      await page.keyboard.press("Escape");
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      assert.equal(await focused(page), "graph-context-add");
      assert.deepEqual(await references(page), {});
      await addByKeyboard(page, "Context", "instructions");
      const stored = (await draft(page)).bindings;
      await T(page, "graph-context-replace-instructions").focus();
      await page.keyboard.press("Enter");
      await T(page, "graph-context-search").waitFor();
      await page.keyboard.press("Escape");
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      assert.equal(
        await focused(page),
        "graph-context-replace-instructions",
        "focus returns to the control that opened it",
      );
      assert.deepEqual((await draft(page)).bindings, stored);
      // 反复在搜索框里按 Enter（有/无活动项）都不会评审
      await openPicker(page);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await flush(page);
      assertClean(host, 0);
    },
  },
  {
    name: "failed validation and cancelled chooser keep the previous binding; the Host error stays beside the slot",
    async run({ page, host, url, shotsDir }) {
      await boot(page, host, url);
      await addByKeyboard(page, "Context", "instructions");
      const stored = (await draft(page)).bindings;
      await T(page, "graph-context-replace-instructions").click();
      await search(page, "empty");
      await until(async () => (await optionCount(page)) > 0, "results");
      await T(page, "graph-context-option-0").click();
      await T(page, "graph-context-validation-error").waitFor();
      const message = await T(page, "graph-context-validation-error").innerText();
      // UX-M2.3：说明点名被保留的原选择（此处槽位原本持有 docs/Context.md）。
      assert.match(
        message,
        /Could not use empty\.md\. The previous selection docs\/Context\.md was kept\./,
      );
      assert.match(message, /Reference must be a nonempty UTF-8 text file\./);
      assert.deepEqual((await draft(page)).bindings, stored, "validation failure changes nothing");
      await T(page, "graph-context-popover").waitFor();
      assert.match(await T(page, "graph-context-chip-instructions").innerText(), /Context\.md/);
      for (const size of shotsDir ? SIZES : [])
        await shot(page, shotsDir, "validation-error", size);
      await page.setViewportSize(SIZES[0]);

      await search(page, "big");
      await until(async () => (await optionCount(page)) > 0, "results");
      await T(page, "graph-context-option-0").click();
      await until(
        async () =>
          /102400-byte limit/.test(
            await T(page, "graph-context-validation-error")
              .innerText()
              .catch(() => ""),
          ),
        "size error",
      );
      // 原生选择器：工作区之外的文件由真实 Host 拒绝；取消则完全无变化。
      host.setPickedFile(host.outside);
      await T(page, "graph-context-native-picker").click();
      await until(
        async () =>
          /Unsafe workspace-relative path/.test(
            await T(page, "graph-context-validation-error")
              .innerText()
              .catch(() => ""),
          ),
        "outside-workspace rejection",
      );
      host.setPickedFile(null);
      const validations = started(host, "validate-reference").length;
      await T(page, "graph-context-native-picker").click();
      await until(() => finished(host, "selectFile").length === 2, "cancelled chooser");
      await flush(page);
      assert.equal(
        started(host, "validate-reference").length,
        validations,
        "a cancelled chooser validates nothing",
      );
      assert.deepEqual((await draft(page)).bindings, stored);
      await page.keyboard.press("Escape");
      await T(page, "graph-context-popover").waitFor({ state: "hidden" });
      assert.deepEqual((await draft(page)).bindings, stored);
      assertClean(host);
    },
  },
];
