// UX-M3.2 browser scenarios: separate save, export and import tasks with explicit targets and
// disclosures, results read from the returned list, and the manual JSON route under Advanced.
// REAL GraphWorkflowService over an in-memory store; the OS file dialogs are not exercised here.
import assert from "node:assert/strict";
import { assertClean, setState, until } from "./ux-m1-helpers.mjs";
import {
  T,
  boot,
  callsOf,
  librarySelection,
  mutationCalls,
  openAdvanced,
  openLibrary,
  openShare,
  optionLabels,
  selectValue,
  versionRowsOf,
} from "./ux-m3-helpers.mjs";

const seed = (host, name = "Team release", versions = 2) =>
  host.library.seedUser(name, { base: "agent-assisted", versions });
const editDesign = (page, name) =>
  page.evaluate((value) => window.__harness.editDesignName("A", value), name);
const listed = async (host) => (await host.library.service.list()).entries;
const entryOf = async (host, id) => (await listed(host)).find((item) => item.id === id);

/** Instantiate a library workflow into the design from New run, then land on Workflows with a pinned design. */
async function pinDesign(page, host, entryId, version) {
  await selectValue(page, "graph-library-entry", entryId);
  if (version !== undefined)
    await selectValue(page, "graph-new-run-version-select", String(version));
  await T(page, "graph-template-parameter-request").fill("Tidy the release notes");
  await T(page, "graph-library-instantiate").click();
  await until(() => host.graph.A.definition.template, "the design is pinned");
  await T(page, "graph-design-origin").waitFor();
}

const defaultTarget = {
  name: "saving the design defaults to the workflow it came from, not to the Workflow dropdown, and the new version is selected from the returned list",
  async run({ page, host, url }) {
    const team = await seed(host, "Team release", 2);
    const other = await seed(host, "Other flow", 1);
    await boot(page, host, url);
    await pinDesign(page, host, team.id, 1);
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", other.id); // 下拉框指向别的工作流
    await openShare(page);
    assert.equal(await T(page, "graph-save-target").innerText(), "New version of Team release");
    assert.equal(
      await T(page, "graph-save-unsaved").count(),
      0,
      "a saved design needs no disclosure",
    );
    // 名称与描述默认取目标已有的值
    assert.equal(await T(page, "graph-library-name").inputValue(), "Team release");
    assert.equal(
      await T(page, "graph-library-description").inputValue(),
      "Team release: version 2",
    );
    assert.equal(
      await T(page, "graph-save-confirm").isDisabled(),
      true,
      "nothing to save before the review",
    );
    await T(page, "graph-library-capture").click();
    await T(page, "graph-save-preview-result").waitFor();
    await T(page, "graph-save-reviewed").click();
    assert.match(
      await T(page, "graph-save-summary").innerText(),
      /adds a new version to “Team release”/,
    );
    assert.equal(
      await T(page, "graph-save-rename").count(),
      0,
      "an untouched form renames nothing",
    );
    await T(page, "graph-save-confirm").click();
    await until(() => callsOf(host, "wf.mutate").length === 1, "the mutation");
    const after = await entryOf(host, team.id);
    assert.deepEqual(
      after.versions.map((item) => item.version),
      [1, 2, 3],
    );
    assert.equal(
      (await entryOf(host, other.id)).versions.length,
      1,
      "the dropdown's workflow was not touched",
    );
    await T(page, "graph-library-result").waitFor();
    assert.equal(
      await T(page, "graph-library-result").innerText(),
      "Saved: Team release · Version 3 is now selected.",
    );
    assert.deepEqual(await librarySelection(page, host), { id: team.id, version: 3 });
    assert.equal(await T(page, "graph-library-entry").innerText(), "Team release · Yours");
    const rows = await versionRowsOf(page);
    assert.deepEqual(
      rows.map((row) => [row.version, row.checked, row.used]),
      [
        [3, true, false],
        [2, false, false],
        [1, false, true],
      ],
    );
    assertClean(host);
  },
};

const dirtyDisclosure = {
  name: "unsaved design edits are disclosed before saving, for a version and for a new workflow, and the preview is built from that design",
  async run({ page, host, url }) {
    const team = await seed(host);
    await boot(page, host, url);
    await pinDesign(page, host, team.id, 2);
    await editDesign(page, "Edited on the canvas");
    await openLibrary(page);
    await openShare(page);
    assert.equal(
      await T(page, "graph-save-unsaved").innerText(),
      "This version includes your current unsaved design edits.",
    );
    await selectValue(page, "graph-save-target", "new");
    assert.equal(
      await T(page, "graph-save-unsaved").innerText(),
      "This workflow includes your current unsaved design edits.",
    );
    assert.equal(await T(page, "graph-library-name").inputValue(), "Edited on the canvas");
    await T(page, "graph-library-capture").click();
    await T(page, "graph-save-preview-result").waitFor();
    assert.equal(
      JSON.parse(await T(page, "graph-save-json").inputValue()).name,
      "Edited on the canvas",
    );
    assert.equal(callsOf(host, "wf.mutate").length, 0, "previewing saved nothing");
    assertClean(host);
  },
};

const renameDisclosure = {
  name: "a version whose name differs from the workflow's says so before confirming; the service's derived name is unchanged",
  async run({ page, host, url }) {
    const team = await seed(host);
    await boot(page, host, url);
    await pinDesign(page, host, team.id, 2);
    await openLibrary(page);
    await openShare(page);
    await T(page, "graph-library-name").fill("Renamed flow");
    await T(page, "graph-library-capture").click();
    await T(page, "graph-save-preview-result").waitFor();
    await T(page, "graph-save-reviewed").click();
    assert.equal(
      await T(page, "graph-save-rename").innerText(),
      "The workflow will be renamed from “Team release” to “Renamed flow”.",
    );
    // 预览之后再改名：预览与审阅勾选失效，不能提交一个没被审阅的模板
    await T(page, "graph-library-name").fill("Renamed flow 2");
    assert.equal(await T(page, "graph-save-preview-result").count(), 0);
    assert.equal(await T(page, "graph-save-confirm").isDisabled(), true);
    await T(page, "graph-library-capture").click();
    await T(page, "graph-save-reviewed").click();
    await T(page, "graph-save-confirm").click();
    await T(page, "graph-library-result").waitFor();
    assert.equal(
      (await entryOf(host, team.id)).name,
      "Renamed flow 2",
      "existing service semantics",
    );
    assertClean(host);
  },
};

const builtinOrigin = {
  name: "a design that came from a built-in explains that built-ins take no versions and defaults to a new workflow; Duplicate to edit selects the copy",
  async run({ page, host, url }) {
    await boot(page, host, url);
    await pinDesign(page, host, "agent-assisted");
    await openLibrary(page);
    await openShare(page);
    await T(page, "graph-save-builtin-origin").waitFor();
    assert.equal(await T(page, "graph-save-target").innerText(), "A new workflow");
    assert.equal(await T(page, "graph-library-duplicate").innerText(), "Duplicate to edit");
    assert.equal(await T(page, "graph-library-archive").isDisabled(), true);
    assert.equal(await T(page, "graph-library-builtin-note").count(), 1);
    await T(page, "graph-library-duplicate-name").fill("My copy");
    await T(page, "graph-library-duplicate").click();
    await T(page, "graph-library-result").waitFor();
    assert.equal(
      await T(page, "graph-library-result").innerText(),
      "Saved: My copy · Version 1 is now selected.",
    );
    const copy = (await listed(host)).find((item) => item.name === "My copy");
    assert.deepEqual(await librarySelection(page, host), { id: copy.id, version: 1 });
    assert.equal(await T(page, "graph-library-entry").innerText(), "My copy · Yours");
    assertClean(host);
  },
};

const exportTask = {
  name: "export names the exact workflow and version, ignores the unsaved canvas, saves exactly the reviewed JSON, and treats a cancelled dialog as neither success nor failure",
  async run({ page, host, url }) {
    const team = await seed(host, "Team release", 2);
    await boot(page, host, url);
    await pinDesign(page, host, team.id, 2);
    await editDesign(page, "Canvas edit that must not be exported");
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", team.id);
    await page.locator('[data-testid="graph-library-version-row"][data-version="1"] input').check();
    await openShare(page);
    assert.equal(await T(page, "graph-export-subject").innerText(), "Team release · Version 1");
    await T(page, "graph-library-export").click();
    await T(page, "graph-export-preview-result").waitFor();
    const shown = await T(page, "graph-export-json").inputValue();
    const expected = (
      await host.library.service.preview({ action: "export", id: team.id, version: 1 })
    ).json;
    assert.equal(shown, expected, "exactly the stored version");
    assert.ok(!shown.includes("Canvas edit that must not be exported"));
    assert.equal(await T(page, "graph-template-export-file").count(), 0, "not before the review");
    await T(page, "graph-export-reviewed").click();
    host.setSaveResult({ success: false, canceled: true });
    await T(page, "graph-template-export-file").click();
    await until(() => host.saves.length === 1, "the save dialog was reached");
    await flushPromises();
    assert.equal(await T(page, "graph-template-file-saved").count(), 0, "cancel is not success");
    assert.equal(await T(page, "graph-export-file-error").count(), 0, "cancel is not a failure");
    host.setSaveResult({ success: true, filePath: "x.json" });
    await T(page, "graph-template-export-file").click();
    await T(page, "graph-template-file-saved").waitFor();
    assert.equal(
      await T(page, "graph-template-file-saved").innerText(),
      "Saved Team release · Version 1 to a file.",
    );
    assert.equal(
      host.saves[1].text,
      expected,
      "the bytes handed to the dialog are the reviewed JSON",
    );
    assert.equal(host.saves[1].suggestedName, "workflow.zcode-workflow.json");
    assert.deepEqual(
      mutationCalls(host).filter((call) => call.op === "wf.mutate"),
      [],
    );
    assertClean(host);
  },
};
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 150));

const importTask = {
  name: "import is three steps: choosing and previewing mutate nothing, saving is an explicit choice of target with the reviewed gate",
  async run({ page, host, url }) {
    const team = await seed(host, "Team release", 1);
    await boot(page, host, url);
    await openLibrary(page);
    await openShare(page);
    const good = await host.writeTemp(
      "good.json",
      JSON.stringify(host.library.template("agent-assisted", "Imported flow", "From a file")),
    );
    host.setPickedFile(good);
    await T(page, "graph-template-import-file").click();
    await T(page, "graph-import-preview-result").waitFor();
    assert.ok(callsOf(host, "wf.preview").some((call) => call.action === "import"));
    assert.equal(callsOf(host, "wf.mutate").length, 0, "choosing and previewing saved nothing");
    assert.equal(await T(page, "graph-import-confirm").isDisabled(), true, "review first");
    assert.equal(await T(page, "graph-import-target").innerText(), "A new workflow");
    await T(page, "graph-import-reviewed").click();
    assert.match(
      await T(page, "graph-import-summary").innerText(),
      /creates a new workflow named “Imported flow”/,
    );
    await T(page, "graph-import-confirm").click();
    await T(page, "graph-library-result").waitFor();
    assert.equal(
      await T(page, "graph-library-result").innerText(),
      "Saved: Imported flow · Version 1 is now selected.",
    );
    const imported = (await listed(host)).find((item) => item.name === "Imported flow");
    assert.deepEqual(await librarySelection(page, host), { id: imported.id, version: 1 });
    // 作为某个工作流的新版本导入，并披露改名
    host.setPickedFile(good);
    await T(page, "graph-template-import-file").click();
    await T(page, "graph-import-preview-result").waitFor();
    await selectValue(page, "graph-import-target", `version:${team.id}`);
    await T(page, "graph-template-import-file").click();
    await T(page, "graph-import-reviewed").waitFor();
    await T(page, "graph-import-reviewed").click();
    assert.match(
      await T(page, "graph-import-rename").innerText(),
      /renamed from “Team release” to “Imported flow”/,
    );
    // 无效文件：预览给出错误，不能保存
    const bad = await host.writeTemp("bad.json", "{ not json");
    host.setPickedFile(bad);
    await T(page, "graph-template-import-file").click();
    await T(page, "graph-import-preview-result").locator('[role="alert"]').first().waitFor();
    assert.equal(await T(page, "graph-import-confirm").isDisabled(), true);
    assert.equal(
      await T(page, "graph-import-reviewed").count(),
      0,
      "no review gate for an invalid file",
    );
    assert.equal(callsOf(host, "wf.mutate").length, 1, "only the one explicit save");
    assertClean(host);
  },
};

const manualJson = {
  name: "manual JSON lives under Advanced; editing it drops the preview and the review, so only a reviewed preview can be saved",
  async run({ page, host, url }) {
    await boot(page, host, url);
    await openLibrary(page);
    assert.equal(
      await T(page, "graph-manual-json").isVisible(),
      false,
      "not part of the everyday path",
    );
    await openAdvanced(page);
    const json = JSON.stringify(host.library.template("agent-assisted", "Pasted flow"));
    await T(page, "graph-manual-json").fill(json);
    assert.equal(await T(page, "graph-manual-confirm").count(), 0, "no save step before a preview");
    await T(page, "graph-manual-preview").click();
    await T(page, "graph-manual-reviewed").click();
    assert.equal(await T(page, "graph-manual-confirm").isDisabled(), false);
    await T(page, "graph-manual-json").fill(json.replace("Pasted flow", "Pasted flow edited"));
    assert.equal(await T(page, "graph-manual-preview-result").count(), 0, "the preview is stale");
    assert.equal(await T(page, "graph-manual-confirm").count(), 0);
    await T(page, "graph-manual-preview").click();
    assert.equal(await T(page, "graph-manual-reviewed").isChecked(), false, "review restarts");
    assert.equal(await T(page, "graph-manual-confirm").isDisabled(), true);
    await T(page, "graph-manual-reviewed").click();
    await T(page, "graph-manual-confirm").click();
    await T(page, "graph-library-result").waitFor();
    assert.ok((await listed(host)).some((item) => item.name === "Pasted flow edited"));
    assertClean(host);
  },
};

const conflictRetry = {
  name: "after a library revision conflict the reviewed preview survives Refresh and the explicit retry succeeds",
  async run({ page, host, url }) {
    await boot(page, host, url);
    await openLibrary(page);
    await openAdvanced(page);
    const json = JSON.stringify(host.library.template("agent-assisted", "Retried flow"));
    await T(page, "graph-manual-json").fill(json);
    await T(page, "graph-manual-preview").click();
    await T(page, "graph-manual-reviewed").click();
    await host.library.externalChange();
    await T(page, "graph-manual-confirm").click();
    await T(page, "graph-library-error").waitFor();
    assert.match(
      await T(page, "graph-library-error").innerText(),
      /revision changed; refresh before saving/,
    );
    await T(page, "graph-library-error-refresh").click();
    await until(async () => (await T(page, "graph-library-error").count()) === 0, "refreshed");
    assert.equal(await T(page, "graph-manual-reviewed").isChecked(), true, "the review is kept");
    await T(page, "graph-manual-confirm").click();
    await T(page, "graph-library-result").waitFor();
    assert.equal(callsOf(host, "wf.mutate").length, 2, "refused once, then saved");
    assert.ok((await listed(host)).some((item) => item.name === "Retried flow"));
    assertClean(host);
  },
};

const chineseLabels = {
  name: "the Share tasks, disclosures and results read in Simplified Chinese",
  async run({ page, host, url }) {
    const team = await seed(host);
    await boot(page, host, url);
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-new-run-pane").waitFor();
    await pinDesign(page, host, team.id, 2);
    await editDesign(page, "改过的设计");
    await openLibrary(page);
    await openShare(page);
    assert.equal(
      await T(page, "graph-save-unsaved").innerText(),
      "此版本包含你当前尚未保存的设计修改。",
    );
    assert.match(await T(page, "graph-save-target").innerText(), /Team release 的新版本/);
    const labels = await optionLabels(page, "graph-save-target");
    assert.ok(labels.includes("一个新工作流"), labels.join(" | "));
    assertClean(host);
  },
};

export const shareScenarios = [
  defaultTarget,
  dirtyDisclosure,
  renameDisclosure,
  builtinOrigin,
  exportTask,
  importTask,
  manualJson,
  conflictRetry,
  chineseLabels,
];
