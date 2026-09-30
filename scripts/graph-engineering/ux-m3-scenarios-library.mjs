// UX-M3.1 browser scenarios: one library dialog with clear sections, Built-in/Yours, version rows
// derived from facts, the version a run will instantiate, the design's origin, and read-only
// browsing while a run owns the workspace. The workflow library is the REAL GraphWorkflowService
// over an in-memory store (ux-m3-library-host.mjs); run records are unit-only fixtures.
import assert from "node:assert/strict";
import { assertClean, invokeHandler, setState, until } from "./ux-m1-helpers.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";
import {
  T,
  boot,
  builtinFacts,
  callsOf,
  librarySelection,
  mutationCalls,
  openAdvanced,
  openLibrary,
  openShare,
  openVersions,
  optionLabels,
  selectValue,
  versionRowsOf,
} from "./ux-m3-helpers.mjs";

const seed = (host, name = "Team release", versions = 3) =>
  host.library.seedUser(name, { base: "agent-assisted", versions });

const sections = {
  name: "the library is one dialog with Workflow, Versions, Use, Share and Advanced; there is no second modal",
  async run({ page, host, url }) {
    await seed(host);
    await boot(page, host, url);
    await openLibrary(page);
    const order = await page
      .locator(
        '[data-testid="graph-library-dialog"] [role="tabpanel"]',
      )
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")));
    // UX-M4：一个对话框，左侧是工作流列表，右侧是单层标签 Versions / Use / Share / Advanced。
    assert.deepEqual(order, [
      "graph-library-panel-versions",
      "graph-library-panel-use",
      "graph-library-share",
      "graph-library-advanced",
    ]);
    const tabs = await page
      .locator('[data-testid="graph-library-dialog"] [role="tab"]')
      .evaluateAll((items) => items.map((item) => item.textContent));
    assert.deepEqual(tabs, ["Versions", "Use", "Share", "Advanced"]);
    assert.equal(await T(page, "graph-library-list").count(), 1, "the workflow list");
    assert.equal(await T(page, "graph-library-footer").count(), 1, "the fixed footer");
    assert.equal(
      await T(page, "graph-library-manage").count(),
      0,
      "the nested Manage modal is gone",
    );
    assert.equal(await page.locator('[role="dialog"]:visible').count(), 1, "one dialog");
    assertClean(host);
  },
};

const labels = {
  name: "workflows say Built-in or Yours, before and after selection, in English and Chinese",
  async run({ page, host, url }) {
    await seed(host);
    await boot(page, host, url);
    await openLibrary(page);
    const options = await optionLabels(page, "graph-library-entry");
    assert.ok(options.includes("Sequential engineering · Built-in"), options.join(" | "));
    assert.ok(options.includes("Team release · Yours"), options.join(" | "));
    assert.match(await T(page, "graph-library-entry").innerText(), /· Built-in$/);
    await selectValue(page, "graph-library-entry", "user-workflow-1");
    assert.match(await T(page, "graph-library-entry").innerText(), /Team release · Yours$/);
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-view-design").click();
    await T(page, "graph-library-open").click();
    await T(page, "graph-library-versions").waitFor();
    const zh = await optionLabels(page, "graph-library-entry");
    assert.ok(
      zh.some((label) => label.endsWith("· 内置")),
      zh.join(" | "),
    );
    assert.ok(zh.includes("Team release · 我的"), zh.join(" | "));
    assertClean(host);
  },
};

const versions = {
  name: "version rows: Version N, Latest only when several are offered, dates only for user versions, built-ins list what the Host offers",
  async run({ page, host, url }) {
    await seed(host);
    await boot(page, host, url);
    await openLibrary(page);
    const builtin = await builtinFacts(host, "agent-assisted");
    let rows = await versionRowsOf(page);
    assert.equal(rows.length, builtin.versions.length, "exactly the versions the Host offers");
    assert.deepEqual(
      rows.map((row) => row.version),
      builtin.versions.map((item) => item.version).sort((a, b) => b - a),
    );
    assert.ok(
      rows.every((row) => !row.latest),
      "a single offered version is not labelled Latest",
    );
    assert.ok(
      rows.every((row) => !/Created/.test(row.text)),
      "no date for a built-in (stored 0)",
    );
    assert.ok(!rows.some((row) => /1970/.test(row.text)));
    await selectValue(page, "graph-library-entry", "user-workflow-1");
    rows = await versionRowsOf(page);
    assert.deepEqual(
      rows.map((row) => [row.version, row.latest]),
      [
        [3, true],
        [2, false],
        [1, false],
      ],
      "newest first, Latest on the highest",
    );
    assert.ok(
      rows.every((row) => /Created/.test(row.text)),
      "user versions show when they were created",
    );
    assert.match(rows[0].text, /^Version 3\b/);
    assert.ok(
      rows.every((row) => !row.used),
      "no provenance, no Used-by claim",
    );
    assertClean(host);
  },
};

const advanced = {
  name: "digest and library revision live under Advanced and match the Host; nothing else shows them",
  async run({ page, host, url }) {
    await seed(host);
    await boot(page, host, url);
    await openLibrary(page);
    const builtin = await builtinFacts(host, "agent-assisted");
    assert.equal(await T(page, "graph-library-digest").isVisible(), false, "collapsed by default");
    assert.equal(await T(page, "graph-library-revision").isVisible(), false);
    await openAdvanced(page);
    assert.equal(await T(page, "graph-library-digest").innerText(), builtin.versions[0].digest);
    assert.equal(
      await T(page, "graph-library-revision").innerText(),
      String((await host.library.service.list()).revision),
    );
    const dialogText = await T(page, "graph-library-dialog").innerText();
    assert.equal(
      dialogText.split(builtin.versions[0].digest).length - 1,
      1,
      "the digest appears once, in Advanced",
    );
    await selectValue(page, "graph-library-entry", "user-workflow-1");
    const userDigest = (await host.library.service.list()).entries
      .find((item) => item.id === "user-workflow-1")
      .versions.at(-1).digest;
    assert.equal(
      await T(page, "graph-library-digest").innerText(),
      userDigest,
      "follows the selected version",
    );
    assertClean(host);
  },
};

const exactUse = {
  name: "a chosen user version is exactly what New run shows and what the Host instantiates; the design's origin and Used-by follow from that fact",
  async run({ page, host, url }) {
    const entry = await seed(host);
    await boot(page, host, url);
    // 全新工作区：没有来源
    await T(page, "graph-view-design").click();
    assert.equal(await T(page, "graph-design-origin").count(), 0, "no pin, no origin");
    await T(page, "graph-library-open").click();
    await T(page, "graph-library-versions").waitFor();
    await selectValue(page, "graph-library-entry", entry.id);
    await page.locator('[data-testid="graph-library-version-row"][data-version="2"] input').check();
    assert.deepEqual(await librarySelection(page, host), { id: entry.id, version: 2 });
    await page.keyboard.press("Escape");
    await T(page, "graph-view-runs").click();
    await T(page, "graph-new-run-version-line").waitFor();
    assert.equal(
      await T(page, "graph-new-run-version-line").innerText(),
      "This run will use Team release · Version 2 · Yours",
    );
    // 行内也能明确改选版本
    await selectValue(page, "graph-new-run-version-select", "3");
    assert.match(await T(page, "graph-new-run-version-line").innerText(), /Version 3/);
    assert.deepEqual(await librarySelection(page, host), { id: entry.id, version: 3 });
    await selectValue(page, "graph-new-run-version-select", "2");
    await T(page, "graph-template-parameter-request").fill("Tidy the release notes");
    await T(page, "graph-library-instantiate").click();
    await until(() => callsOf(host, "wf.instantiate").length === 1, "instantiate");
    const call = callsOf(host, "wf.instantiate")[0];
    assert.equal(call.templateId, entry.id);
    assert.equal(call.version, 2, "exactly the shown version");
    await until(() => host.graph.A.definition.template, "the saved design has a pin");
    const listed = (await host.library.service.list()).entries.find((item) => item.id === entry.id);
    const chosen = listed.versions.find((item) => item.version === 2);
    assert.deepEqual(
      [
        host.graph.A.definition.template.id,
        host.graph.A.definition.template.version,
        host.graph.A.definition.template.digest,
      ],
      [entry.id, 2, chosen.digest],
    );
    // Workflows：来源与 Used-by 都来自设计里存的 pin
    await T(page, "graph-view-design").click();
    assert.equal(
      await T(page, "graph-design-origin").innerText(),
      "Started from Team release · Version 2",
    );
    await T(page, "graph-library-open").click();
    await T(page, "graph-library-versions").waitFor();
    const rows = await versionRowsOf(page);
    assert.deepEqual(
      rows.map((row) => [row.version, row.used]),
      [
        [3, false],
        [2, true],
        [1, false],
      ],
    );
    assertClean(host);
  },
};

const newRunBuiltin = {
  name: "New run names the built-in workflow and the version the Host offers, without a version picker for a single version",
  async run({ page, host, url }) {
    await boot(page, host, url);
    await builtinFacts(host, "agent-assisted");
    await T(page, "graph-new-run-version-line").waitFor();
    assert.equal(
      await T(page, "graph-new-run-version-line").innerText(),
      `This run will use Agent-assisted task · Version ${host.library.versionOf("agent-assisted")} · Built-in`,
    );
    assert.equal(
      await T(page, "graph-new-run-version-select").count(),
      0,
      "one offered version: nothing to choose",
    );
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-new-run-version-line").waitFor();
    assert.match(
      await T(page, "graph-new-run-version-line").innerText(),
      /^本次运行将使用 .*版本 \d+ · 内置$/,
    );
    assertClean(host);
  },
};

const readOnly = {
  name: "while a run owns the workspace the library can be browsed and previewed, every mutation is refused with a reason, and export to disk is blocked",
  async run({ page, host, url }) {
    const entry = await seed(host);
    host.setRuns("A", [permissionWaitRun("run-waiting")]);
    await boot(page, host, url);
    await openLibrary(page);
    const blocked = T(page, "graph-library-blocked");
    await blocked.waitFor();
    assert.match(
      await blocked.innerText(),
      /A run still owns this workspace\. You can browse workflows, inspect versions and preview/,
    );
    await T(page, "graph-library-view-current-run").waitFor();
    // 浏览与检查
    await selectValue(page, "graph-library-entry", entry.id);
    await page.locator('[data-testid="graph-library-version-row"][data-version="1"] input').check();
    assert.deepEqual(await librarySelection(page, host), { id: entry.id, version: 1 });
    // 预览是只读的：导出预览与手动 JSON 的干预览都可用
    await openShare(page);
    await T(page, "graph-library-export").click();
    await T(page, "graph-export-preview-result").waitFor();
    assert.equal(callsOf(host, "wf.preview").filter((call) => call.action === "export").length, 1);
    await T(page, "graph-export-reviewed").click();
    const exportFile = T(page, "graph-template-export-file");
    assert.equal(await exportFile.isDisabled(), true, "export to disk is blocked");
    assert.match(
      await T(page, "graph-template-export-blocked").innerText(),
      /save dialog could write inside it/,
    );
    assert.equal(
      await exportFile.getAttribute("aria-describedby"),
      "graph-template-export-blocked",
    );
    await invokeHandler(page, "graph-template-export-file");
    assert.equal(host.saves.length, 0, "the save dialog was never reached");
    const json = JSON.stringify(host.library.template("agent-assisted", "Preview only"));
    await openAdvanced(page);
    await T(page, "graph-manual-json").fill(json);
    await T(page, "graph-manual-preview").click();
    await until(
      () => callsOf(host, "wf.preview").some((call) => call.action === "import"),
      "import preview",
    );
    await T(page, "graph-manual-reviewed").click();
    // 每个修改都被拒绝（按钮禁用、原因可读、处理函数本身也拒绝）
    const reasonId = "graph-library-blocked-reason";
    for (const id of ["graph-manual-confirm", "graph-save-confirm"]) {
      assert.equal(await T(page, id).isDisabled(), true, id);
      assert.equal(await T(page, id).getAttribute("aria-describedby"), reasonId);
      await invokeHandler(page, id);
    }
    await T(page, "graph-library-duplicate-name").isDisabled();
    assert.equal(await T(page, "graph-library-duplicate-name").isDisabled(), true);
    for (const id of [
      "graph-library-duplicate",
      "graph-library-archive",
      "graph-library-instantiate",
    ]) {
      assert.equal(await T(page, id).isDisabled(), true, id);
      await invokeHandler(page, id);
    }
    assert.deepEqual(mutationCalls(host), [], "no mutation reached the Host");
    assert.ok(callsOf(host, "wf.list").length >= 1);
    assert.equal(host.saves.length, 0);
    // 运行结束后，同样的控件恢复可用；什么都不会自动发生
    host.resolveRuns("A");
    await until(
      async () => (await T(page, "graph-library-blocked").count()) === 0,
      "the notice goes",
    );
    assert.equal(await T(page, "graph-manual-confirm").isDisabled(), false);
    await openVersions(page);
    await T(page, "graph-library-duplicate-name").fill("Copy");
    assert.equal(await T(page, "graph-library-duplicate").isDisabled(), false);
    assert.deepEqual(mutationCalls(host), [], "nothing happened by itself");
    assertClean(host);
  },
};

const conflict = {
  name: "a library revision conflict shows its error with Refresh right beside it; Refresh clears it and shows the other window's change",
  async run({ page, host, url }) {
    const entry = await seed(host, "Team release", 1);
    await boot(page, host, url);
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", entry.id);
    await host.library.externalChange(); // 另一窗口改了资料库
    await openVersions(page);
    await T(page, "graph-library-duplicate-name").fill("Team release copy");
    await T(page, "graph-library-duplicate").click();
    const error = T(page, "graph-library-error");
    await error.waitFor();
    assert.match(
      await error.innerText(),
      /Workflow library revision changed; refresh before saving\./,
    );
    const refresh = error.locator('[data-testid="graph-library-error-refresh"]');
    assert.equal(await refresh.count(), 1, "Refresh is inside the error block");
    await refresh.click();
    await until(async () => (await T(page, "graph-library-error").count()) === 0, "error cleared");
    const options = await optionLabels(page, "graph-library-entry");
    assert.ok(
      options.some((label) => label.startsWith("External workflow")),
      options.join(" | "),
    );
    assert.equal(
      callsOf(host, "wf.mutate").length,
      1,
      "the stale write reached the real service once and was refused there",
    );
    assertClean(host);
  },
};

export const libraryScenarios = [
  sections,
  labels,
  versions,
  advanced,
  exactUse,
  newRunBuiltin,
  readOnly,
  conflict,
];
