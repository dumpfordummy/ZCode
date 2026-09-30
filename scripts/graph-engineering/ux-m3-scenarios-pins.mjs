// UX-M3.3 browser scenarios: Open in Runs, and historical pins the library no longer offers.
// REAL GraphWorkflowService over an in-memory store. The pinned run records are fixtures (a run
// record is not a library version: the library only offers what the service publishes).
import assert from "node:assert/strict";
import { assertClean, drafts, setState, until } from "./ux-m1-helpers.mjs";
import { ALL_CHECKS } from "./ux-m1-checks.mjs";
import { permissionWaitRun } from "./ux-m1-runs.mjs";
import {
  T,
  boot,
  builtinFacts,
  librarySelection,
  mutationCalls,
  openLibrary,
  selectValue,
} from "./ux-m3-helpers.mjs";
import { HISTORICAL_DIGEST, pinnedRun } from "./ux-m3-pins.mjs";

const RUN_ID = "run-historical";
const REQUEST = "Historical request from the captured run";
const runAgain = async (page) => {
  await page.locator(`[data-testid="graph-run"][data-run-id="${RUN_ID}"]`).click();
  await T(page, "graph-run-again").click();
  await T(page, "graph-new-run-pane").waitFor();
};
const templates = async (page, host) => (await drafts(page))[host.workspaces.A].templates;
const pinStatusOf = (page) => T(page, "graph-historical-pin").getAttribute("data-status");

const openInRuns = {
  name: "Open in Runs opens New run with the selected workflow and version and does nothing else, also while a run owns the workspace",
  async run({ page, host, url }) {
    const team = await host.library.seedUser("Team release", {
      base: "agent-assisted",
      versions: 2,
    });
    await boot(page, host, url);
    await openLibrary(page);
    await selectValue(page, "graph-library-entry", team.id);
    await page.locator('[data-testid="graph-library-version-row"][data-version="1"] input').check();
    await T(page, "graph-library-open-runs").click();
    await T(page, "graph-new-run-pane").waitFor();
    assert.equal(await page.locator('[role="dialog"]:visible').count(), 0, "the dialog is closed");
    assert.equal(
      await T(page, "graph-new-run-version-line").innerText(),
      "This run will use Team release · Version 1 · Yours",
    );
    assert.equal(await T(page, "graph-run-confirmation").count(), 0, "nothing was reviewed");
    assert.deepEqual(
      mutationCalls(host),
      [],
      "nothing was instantiated, saved, prepared or started",
    );
    // 运行占用时也可用：它只是导航
    host.setRuns("A", [permissionWaitRun("run-waiting")]);
    await openLibrary(page);
    assert.equal(await T(page, "graph-library-open-runs").isDisabled(), false);
    await T(page, "graph-library-open-runs").click();
    await T(page, "graph-new-run-version-line").waitFor();
    assert.equal(
      await T(page, "graph-review-run").isDisabled(),
      true,
      "Review stays the user's explicit step",
    );
    assert.deepEqual(mutationCalls(host), []);
    assertClean(host);
  },
};

const versionMissing = {
  name: "Run again on a run pinned to a built-in version that is no longer offered says so, changes nothing on its own, and Continue carries the request to the offered version",
  async run({ page, host, url }) {
    const offered = host.library.versionOf("agent-assisted");
    host.setRuns("A", [pinnedRun(RUN_ID)]);
    const before = structuredClone(host.graph.A.runs);
    await boot(page, host, url);
    await runAgain(page);
    await T(page, "graph-historical-pin").waitFor();
    assert.equal(await pinStatusOf(page), "version-missing");
    assert.equal(
      await T(page, "graph-historical-pin")
        .innerText()
        .then((text) => text.split("\n")[0]),
      `Version 1 used by this run is no longer offered. Version ${offered} is available.`,
    );
    // 选择没有被悄悄改成别的版本；别的版本的表单也没有顶替显示
    assert.deepEqual(await librarySelection(page, host), { id: "agent-assisted", version: 1 });
    assert.equal(
      await T(page, "graph-template-parameter-request").count(),
      0,
      "no form for another version",
    );
    assert.equal(await T(page, "graph-new-run-version-line").count(), 0);
    assert.equal(await T(page, "graph-review-run").count(), 0, "nothing to review");
    assert.deepEqual(mutationCalls(host), []);
    // 明确继续
    await T(page, "graph-historical-pin-continue").click();
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(await T(page, "graph-historical-pin").count(), 0);
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assert.deepEqual(await librarySelection(page, host), {
      id: "agent-assisted",
      version: offered,
    });
    assert.match(
      await T(page, "graph-carry-carried").innerText(),
      /Carried over: parameter request/,
    );
    assert.equal(await T(page, "graph-carry-not-carried").count(), 0);
    assert.equal(
      await T(page, "graph-new-run-version-line").innerText(),
      `This run will use Agent-assisted task · Version ${offered} · Built-in`,
    );
    assert.deepEqual(
      host.graph.A.runs,
      before,
      "the historical run and its evidence are untouched",
    );
    assert.deepEqual(mutationCalls(host), [], "Continue starts nothing");
    await T(page, "graph-carry-report-dismiss").click();
    assert.equal(await T(page, "graph-carry-report").count(), 0);
    assert.equal(
      await T(page, "graph-template-parameter-request").inputValue(),
      REQUEST,
      "Dismiss keeps the values",
    );
    assertClean(host);
  },
};

const contentChanged = {
  name: "the same version number with a different definition is not the version the run used",
  async run({ page, host, url }) {
    const offered = host.library.versionOf("agent-assisted");
    host.setRuns("A", [pinnedRun(RUN_ID, { version: offered, digest: HISTORICAL_DIGEST })]);
    await boot(page, host, url);
    await runAgain(page);
    await T(page, "graph-historical-pin").waitFor();
    assert.equal(await pinStatusOf(page), "content-changed");
    assert.match(await T(page, "graph-historical-pin").innerText(), /has changed since it ran/);
    assert.equal(await T(page, "graph-template-parameter-request").count(), 0);
    await T(page, "graph-historical-pin-continue").click();
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assertClean(host);
  },
};

const workflowMissing = {
  name: "a run whose workflow is no longer in the library says so and offers no version to continue with",
  async run({ page, host, url }) {
    host.setRuns("A", [pinnedRun(RUN_ID, { templateId: "gone-flow", name: "Gone flow" })]);
    await boot(page, host, url);
    await runAgain(page);
    await T(page, "graph-historical-pin").waitFor();
    assert.equal(await pinStatusOf(page), "workflow-missing");
    assert.match(await T(page, "graph-historical-pin").innerText(), /no longer in the library/);
    assert.equal(await T(page, "graph-historical-pin-continue").count(), 0);
    assert.equal(await T(page, "graph-library-entry").innerText(), "Choose a workflow");
    await selectValue(page, "graph-library-entry", "agent-assisted");
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(
      await T(page, "graph-historical-pin").count(),
      0,
      "choosing another workflow is the other way out",
    );
    assertClean(host);
  },
};

const exactlyOffered = {
  name: "a pin that is exactly offered (built-in current version, or a user version) seeds the form at once, as before",
  async run({ page, host, url }) {
    const builtin = await builtinFacts(host, "agent-assisted");
    host.setRuns("A", [
      pinnedRun(RUN_ID, {
        version: builtin.versions[0].version,
        digest: builtin.versions[0].digest,
      }),
    ]);
    await boot(page, host, url);
    await runAgain(page);
    assert.equal(await T(page, "graph-historical-pin").count(), 0);
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), REQUEST);
    assert.equal(await T(page, "graph-carry-report").count(), 0);
    // 用户自己的版本：每个版本都精确可选
    const team = await host.library.seedUser("Team release", {
      base: "agent-assisted",
      versions: 2,
    });
    const v1 = team.versions.find((item) => item.version === 1);
    host.setRuns("A", [
      pinnedRun("run-team", {
        templateId: team.id,
        name: "Team release",
        version: 1,
        digest: v1.digest,
      }),
    ]);
    await page.locator('[data-testid="graph-run"][data-run-id="run-team"]').click();
    await T(page, "graph-run-again").click();
    await T(page, "graph-new-run-version-line").waitFor();
    assert.equal(
      await T(page, "graph-new-run-version-line").innerText(),
      "This run will use Team release · Version 1 · Yours",
    );
    assert.equal(await T(page, "graph-historical-pin").count(), 0);
    assertClean(host);
  },
};

const structural = {
  name: "Continue carries only structurally compatible values by stable identity, lists the rest with reasons, and leaves missing required values blocking Review",
  async run({ page, host, url }) {
    await host.seedRecipes("A", ALL_CHECKS);
    host.setRuns("A", [
      pinnedRun(RUN_ID, {
        templateId: "generic",
        name: "Sequential engineering",
        parameters: { request: REQUEST, oldFlag: true },
        bindings: {
          referencePolicy: "native-aware-v1",
          references: {
            instructions: "docs/Context.md",
            skill: "docs/Skill.md",
            notes: "docs/Notes.md",
          },
          recipes: { build: "build-main", test: "test-unit", lint: "lint-main" },
          recipeGroups: { test: ["test-unit", "test-extra"] },
          buildMappings: { test: "build" },
          sourcePaths: ["src"],
        },
        references: [
          { id: "instructions", kind: "instruction", nodeIds: [] },
          { id: "skill", kind: "document", nodeIds: [] }, // 种类与目标版本不同
          { id: "notes", kind: "document", nodeIds: [] }, // 目标版本没有这个角色
        ],
      }),
    ]);
    await boot(page, host, url);
    await runAgain(page);
    await T(page, "graph-historical-pin").waitFor();
    await T(page, "graph-historical-pin-continue").click();
    await T(page, "graph-carry-report").waitFor();
    const offered = host.library.versionOf("generic");
    const form = (await templates(page, host))[`generic:${offered}`];
    assert.equal(form.parameters.request, REQUEST);
    assert.equal("oldFlag" in form.parameters, false, "an undeclared parameter is not carried");
    assert.deepEqual(form.bindings.references, { instructions: "docs/Context.md" });
    assert.equal(form.bindings.referencePolicy, "native-aware-v1");
    assert.deepEqual(form.bindings.recipes, { build: "build-main", test: "test-unit" });
    assert.deepEqual(form.bindings.recipeGroups, { test: ["test-unit", "test-extra"] });
    assert.deepEqual(form.bindings.buildMappings, { test: "build" });
    assert.deepEqual(form.bindings.sourcePaths, [], "no repair region is recorded for this run");
    const listed = await T(page, "graph-carry-not-carried").innerText();
    for (const expected of [
      /parameter\s+oldFlag/,
      /context\s+skill/,
      /context\s+notes/,
      /check\s+lint/,
      /repair source paths/,
    ])
      assert.match(listed, expected);
    assert.match(listed, /not declared in this version/);
    assert.match(listed, /a different kind in this version/);
    assert.match(listed, /its step or region is not in this version/);
    assert.match(
      await T(page, "graph-carry-carried").innerText(),
      /parameter request, context instructions, check build, check test/,
    );
    assertClean(host);
  },
};

const requiredMissing = {
  name: "a required value the historical form never had stays missing after Continue and Review stays blocked",
  async run({ page, host, url }) {
    await host.seedRecipes("A", ALL_CHECKS);
    host.setRuns("A", [
      pinnedRun(RUN_ID, { templateId: "generic", name: "Sequential engineering", parameters: {} }),
    ]);
    await boot(page, host, url);
    await runAgain(page);
    await T(page, "graph-historical-pin-continue").click();
    await T(page, "graph-template-parameter-request").waitFor();
    assert.equal(await T(page, "graph-template-parameter-request").inputValue(), "");
    assert.equal(await T(page, "graph-review-run").isDisabled(), true);
    assert.match(await T(page, "graph-new-run-blocked").innerText(), /[Ff]ield/);
    assert.match(
      await T(page, "graph-carry-report").innerText(),
      /Required values that were not carried over are still missing/,
    );
    assertClean(host);
  },
};

const chinese = {
  name: "the historical-pin notice and the carry report read in Simplified Chinese",
  async run({ page, host, url }) {
    const offered = host.library.versionOf("agent-assisted");
    host.setRuns("A", [pinnedRun(RUN_ID, { parameters: { request: REQUEST, oldFlag: true } })]);
    await boot(page, host, url);
    await setState(page, { locale: "zh-CN" });
    await T(page, "graph-new-run-pane").waitFor();
    await runAgain(page);
    await T(page, "graph-historical-pin").waitFor();
    assert.match(
      await T(page, "graph-historical-pin").innerText(),
      new RegExp(`该运行使用的版本 1 已不再提供。可用的是版本 ${offered}。`),
    );
    await T(page, "graph-historical-pin-continue").click();
    await until(async () => (await T(page, "graph-carry-report").count()) === 1, "report");
    assert.match(
      await T(page, "graph-carry-not-carried").innerText(),
      /参数\s+oldFlag — 此版本未声明/,
    );
    assertClean(host);
  },
};

export const pinScenarios = [
  openInRuns,
  versionMissing,
  contentChanged,
  workflowMissing,
  exactlyOffered,
  structural,
  requiredMissing,
  chinese,
];
