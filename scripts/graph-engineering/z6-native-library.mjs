import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareZ5Fixture } from "./z5-fixture.mjs";
import { instantiateNativeTemplate } from "./z6-native-ui.mjs";
import { capture, ledger, modelCount, readGraphRecord } from "./z5-native-observe.mjs";
import { selectValue } from "./z2-native-helpers.mjs";

const isolation = await createIsolation({ noProvider: true });
const summary = {
  scenario: "library",
  home: isolation.home,
  workspace: isolation.workspace,
  screenshots: [],
  assertions: [],
};
console.error(`Z6 library isolated profile: ${isolation.home}`);
const libraryPath = path.join(
  isolation.home,
  "data/.zcode/v2/graph-engineering/workflow-library.json",
);
const library = async () => JSON.parse(await readFile(libraryPath, "utf8"));
let window, failure;
async function choose(id, version) {
  await selectValue(window, "graph-library-entry", id);
  await selectValue(window, "graph-library-version", String(version));
}
async function transfer() {
  const panel = window.getByTestId("graph-template-transfer");
  if ((await panel.getAttribute("open")) === null) await panel.locator(":scope > summary").click();
}
async function bind() {
  await window
    .getByTestId("graph-template-parameter-request")
    .fill("PRIVATE_RUN_DATA_123: verify independent synthetic fixture only.");
  await window.getByTestId("graph-template-load-recipes").click();
  await selectValue(window, "graph-template-recipe-build", "fixture-build");
  await selectValue(window, "graph-template-recipe-test", "fixture-test");
}
async function closeLibrary() {
  await window.keyboard.press("Escape");
  await window.getByTestId("graph-library-dialog").waitFor({ state: "hidden" });
}
async function screenshot(name) {
  await window.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some(
          (animation) =>
            animation.playState === "running" &&
            Number.isFinite(animation.effect?.getComputedTiming().endTime),
        ),
  );
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await capture(isolation, window, summary, name);
}
try {
  await prepareZ5Fixture(isolation);
  window = await isolation.launch();
  await instantiateNativeTemplate(isolation, window, summary, "generic");
  await window.getByTestId("graph-library-open").click();
  await transfer();
  await window.getByTestId("graph-library-name").fill("Captured synthetic design");
  await window
    .getByTestId("graph-library-description")
    .fill("Reviewed portable design; local data excluded.");
  await window.getByTestId("graph-library-capture").click();
  await window.getByTestId("graph-template-reviewed").waitFor();
  await window.getByTestId("graph-template-reviewed").setChecked(true);
  await window.getByTestId("graph-library-create").click();
  await window.getByTestId("graph-template-saved").waitFor();
  const created = (await library()).entries.find(
    (entry) => entry.name === "Captured synthetic design",
  );
  assert.ok(created);
  assert.equal(created.versions.length, 1);
  assert.equal(created.versions[0].template.graph.template, undefined);
  summary.assertions.push(
    "Create from a reviewed current-design preview stores a portable immutable first version and strips local template bindings.",
  );
  await choose("generic", 1);
  assert.equal(await window.getByTestId("graph-library-archive").isDisabled(), true);
  await window.getByTestId("graph-library-duplicate-name").fill("Saved synthetic engineering");
  await window.getByTestId("graph-library-duplicate").click();
  await window.getByTestId("graph-library-duplicate").waitFor({ state: "visible" });
  await window.waitForFunction(
    () => !document.querySelector('[data-testid="graph-library-entry"]').disabled,
  );
  let saved = (await library()).entries.find(
    (entry) => entry.name === "Saved synthetic engineering",
  );
  assert.ok(saved);
  const firstVersion = structuredClone(saved.versions[0]);
  await choose(saved.id, 1);
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  await bind();
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-library-dialog").waitFor({ state: "hidden" });
  const pinned = await readGraphRecord(isolation);
  assert.equal(pinned.definition.template.id, saved.id);
  assert.equal(pinned.definition.template.version, 1);

  await window.getByTestId("graph-library-open").click();
  await choose(saved.id, 1);
  await transfer();
  await window.getByTestId("graph-library-export").click();
  await window.getByTestId("graph-template-reviewed").waitFor();
  const portableText = await window.getByTestId("graph-template-json").inputValue();
  assert.ok(!portableText.includes(isolation.workspace));
  assert.ok(!portableText.includes("PRIVATE_RUN_DATA_123"));
  assert.ok(!portableText.includes("fixture-build"));
  assert.ok(!portableText.includes("fixture-test"));
  assert.ok(!portableText.includes("operationalDecision"));
  await window.getByTestId("graph-template-reviewed").setChecked(true);
  await screenshot("z6-reviewed-portable-export");
  await writeFile(path.join(isolation.home, "reviewed-portable.json"), portableText);
  const changed = JSON.parse(portableText);
  changed.name = "Saved synthetic engineering v2";
  changed.graph.name = changed.name;
  changed.graph.nodes.find((node) => node.type === "task").instructions +=
    "\nVersion two explicitly reviewed note.";
  await window.getByTestId("graph-template-json").fill(JSON.stringify(changed));
  assert.equal(await window.getByTestId("graph-library-save-version").isDisabled(), true);
  await window.getByTestId("graph-template-preview").click();
  await window.getByTestId("graph-template-reviewed").setChecked(true);
  await window.getByTestId("graph-library-save-version").click();
  await window.getByTestId("graph-template-saved").waitFor();
  saved = (await library()).entries.find((entry) => entry.id === saved.id);
  assert.deepEqual(saved.versions[0], firstVersion);
  assert.equal(saved.versions[1].version, 2);
  assert.deepEqual(await readGraphRecord(isolation), pinned);
  await screenshot("z6-immutable-version-history");
  summary.assertions.push(
    "Duplicate/new version preserve version one bytes and the already instantiated graph pin; no live template mutation occurs.",
  );

  await closeLibrary();
  await window.getByTestId("graph-name").fill("UNSAVED_DRAFT_SENTINEL");
  await window.getByTestId("graph-library-open").click();
  await choose(saved.id, 2);
  await transfer();
  for (const [label, input] of [
    ["malformed", "{broken"],
    ["unsupported", JSON.stringify({ ...changed, version: 99 })],
    [
      "secret",
      JSON.stringify({ ...changed, description: "api_key=SYNTHETIC_SECRET_NEVER_EXPORT" }),
    ],
    [
      "private-path",
      JSON.stringify({ ...changed, description: "C:\\Users\\PrivateFixture\\confidential.txt" }),
    ],
  ]) {
    await window.getByTestId("graph-template-json").fill(input);
    await window.getByTestId("graph-template-preview").click();
    await window.getByTestId("graph-template-preview-result").getByRole("alert").first().waitFor();
    assert.equal(await window.getByTestId("graph-library-create").isDisabled(), true);
    assert.deepEqual(await readGraphRecord(isolation), pinned);
    await screenshot(`z6-dry-preview-${label}-rejected`);
  }
  await closeLibrary();
  assert.equal(await window.getByTestId("graph-name").inputValue(), "UNSAVED_DRAFT_SENTINEL");
  await window.getByTestId("graph-library-open").click();
  await choose(saved.id, 2);
  await bind();
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  await screenshot("z6-dirty-draft-explicit-replacement");
  await window.getByTestId("graph-template-replace-draft").setChecked(true);
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-library-dialog").waitFor({ state: "hidden" });
  const second = await readGraphRecord(isolation);
  assert.equal(second.definition.template.version, 2);
  assert.equal(second.definition.template.digest, saved.versions[1].digest);
  summary.assertions.push(
    "Malformed, unsupported, secret and private-path packages stay dry errors; current saved and unsaved drafts are preserved. A selected newer version replaces the draft only after explicit acknowledgment.",
  );

  await window.getByTestId("graph-library-open").click();
  await choose(saved.id, 2);
  await window.getByTestId("graph-library-archive").click();
  await window.getByRole("button", { name: "Restore", exact: true }).waitFor();
  assert.equal((await library()).entries.find((entry) => entry.id === saved.id).archived, true);
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  await screenshot("z6-archived-library-retains-versions");
  await window.getByTestId("graph-library-archive").click();
  await window.getByRole("button", { name: "Archive", exact: true }).waitFor();
  assert.deepEqual(await readGraphRecord(isolation), second);
  await closeLibrary();
  summary.assertions.push(
    "Archive/restore retains immutable versions and the instantiated graph; built-in versions cannot be archived or edited directly.",
  );

  await window.getByTestId("login-trigger").click();
  await window.getByRole("menuitem", { name: "App theme", exact: true }).hover();
  await window.getByRole("menuitemradio", { name: "Light theme", exact: true }).click();
  await window.waitForFunction(() => document.documentElement.className.includes("light"));
  await isolation.stopApp();
  const settingsPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  await writeFile(
    settingsPath,
    JSON.stringify({ ...settings, localePreference: "zh-CN", locale: "zh-CN" }),
  );
  window = await isolation.launch();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-design").click();
  const handle = await isolation.app.browserWindow(window);
  try {
    await handle.evaluate((owned) => {
      owned.setMinimumSize(0, 0);
      owned.setSize(760, 1000);
    });
  } finally {
    await handle.dispose();
  }
  await window.getByTestId("graph-library-open").click();
  await choose("slot", 1);
  assert.equal(
    await window.getByTestId("graph-template-parameter-normal").getAttribute("data-state"),
    "indeterminate",
  );
  assert.ok((await window.getByTestId("graph-template-bindings").innerText()).includes("未选择"));
  await screenshot("z6-chinese-light-narrow-library");
  const normalChoice = window.getByTestId("graph-template-parameter-normal");
  await normalChoice.setChecked(true);
  assert.equal(await normalChoice.getAttribute("data-state"), "checked");
  await normalChoice.setChecked(false);
  assert.equal(await normalChoice.getAttribute("data-state"), "unchecked");
  assert.equal(
    await window.getByTestId("graph-template-parameter-free").getAttribute("data-state"),
    "indeterminate",
  );
  summary.assertions.push(
    "An unset required boolean is visibly indeterminate/Not selected; explicit include and exclude choices become checked and unchecked without changing other unset choices.",
  );
  await window.getByTestId("graph-template-reference-gameDoc").scrollIntoViewIfNeeded();
  await screenshot("z6-chinese-light-narrow-bindings");
  summary.viewport = await window.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    theme: document.documentElement.className,
  }));
  assert.equal(summary.viewport.width, 760);
  assert.ok(summary.viewport.theme.includes("light"));
  assert.ok(summary.viewport.scrollWidth <= summary.viewport.clientWidth);
  assert.deepEqual(await readGraphRecord(isolation), second);
  assert.equal((await ledger(isolation)).length, 0);
  assert.equal(modelCount(isolation), 0);
  summary.assertions.push(
    "All library, import/export, binding, archive, restart and Chinese/light narrow presentation actions produce zero native inputs, model requests or tool processes. These are desktop fixture checks, not mobile/company/live-provider acceptance.",
  );
  summary.library = await library();
} catch (error) {
  failure = error;
  summary.error = error instanceof Error ? error.stack : String(error);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window) await screenshot("z6-library-failure").catch(() => {});
  process.exitCode = 1;
}
summary.status = failure ? "FAIL" : "PASS";
summary.record = await readGraphRecord(isolation).catch(() => null);
summary.nativeLedger = await ledger(isolation);
summary.modelRequests = modelCount(isolation);
await writeFile(
  path.join(isolation.home, "z6-library-summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
await isolation.close();
