import { openRawChecks } from "./ux-m1-native-nav.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { selectValue, waitForRecord } from "./z2-native-helpers.mjs";
import { ledger, modelCount } from "./z3-native-helpers.mjs";
import { REQUEST } from "./pre-z8-u1-responses.mjs";
import {
  verifyFailedSaveReplacement,
  verifyWorkspaceDraftRetention,
} from "./pre-z8-u1-boundaries.mjs";

const VERIFIED_REQUEST =
  "Retain this verified-workflow task while configuring missing project checks.";
const COMMAND_RECIPE = {
  id: "u1-command",
  name: "Fixture command only",
  executable: "dotnet",
  args: ["--version"],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: [],
  expectedOutputs: [],
  verifier: { kind: "command" },
};
const BUILD_RECIPE = {
  ...COMMAND_RECIPE,
  id: "u1-build",
  name: "Fixture Build configuration",
  sourcePaths: ["fixture.mjs"],
  expectedOutputs: ["fixture-build.txt"],
  verifier: { kind: "build" },
};
const TEST_RECIPE = {
  ...COMMAND_RECIPE,
  id: "u1-test",
  name: "Fixture Test configuration",
  sourcePaths: ["fixture.mjs"],
  verifier: {
    kind: "test",
    format: "zcode-json-v1",
    reportPath: "fixture-report.json",
    minimumTests: 1,
    requiredTests: ["synthetic-required"],
    buildNodeId: "build",
  },
};

export async function assertNoNativeWork(isolation, label) {
  assert.deepEqual(await ledger(isolation), [], `${label}: unexpected native Agent input.`);
  assert.equal(modelCount(isolation), 0, `${label}: unexpected model request.`);
  assert.deepEqual(isolation.fixture.toolResults, [], `${label}: unexpected native tool result.`);
}
export async function captureU1(
  isolation,
  window,
  summary,
  name,
  size = [1280, 720],
  contentSize = false,
) {
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    await nativeWindow.evaluate(
      (browserWindow, { size: [width, height], contentSize }) =>
        contentSize
          ? browserWindow.setContentSize(width, height)
          : browserWindow.setSize(width, height),
      { size, contentSize },
    );
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
    const file = path.join(isolation.home, `${name}.png`);
    const png = await nativeWindow.evaluate(async (browserWindow) =>
      (await browserWindow.capturePage()).toPNG().toString("base64"),
    );
    await writeFile(file, Buffer.from(png, "base64"));
    summary.screenshots.push(file);
    (summary.viewportEvidence ??= []).push({
      name,
      requested: size,
      actual: await window.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
      })),
    });
  } finally {
    await nativeWindow.dispose();
  }
}
async function recipeState(window, state) {
  await window.locator(`[data-testid="graph-recipe-read-state"][data-state="${state}"]`).waitFor();
}
async function choices(window, testId) {
  await window.getByTestId(testId).click();
  const values = await window
    .locator('[role="option"][data-value]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-value")));
  await window.keyboard.press("Escape");
  return values;
}
async function seedConfig(isolation, value) {
  const folder = path.join(isolation.workspace, ".zcode");
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, "config.json"),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
}

export async function verifyRecipeStates(isolation, window, summary) {
  await window.getByTestId("graph-engineering-open").click();
  // UX 审计后 Workflows 标签只剩设计画布；旧的“Workflows”页签内容现在是 Runs → New run。
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  await selectValue(window, "graph-library-entry", "generic");
  await window.getByTestId("graph-template-parameter-request").fill(VERIFIED_REQUEST);
  await recipeState(window, "ready");
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  assert.deepEqual(await choices(window, "graph-template-recipe-build"), ["unbound"]);
  assert.equal(await window.getByTestId("graph-template-setup-checks").isVisible(), true);
  await assertNoNativeWork(isolation, "empty recipes");
  await captureU1(isolation, window, summary, "pre-z8-u1-empty-recipes");
  await window.getByTestId("graph-template-setup-checks").click();
  await window.getByTestId("graph-return-to-workflow").click();
  assert.equal(
    await window.getByTestId("graph-template-parameter-request").inputValue(),
    VERIFIED_REQUEST,
  );

  const malformed = '{"graphRecipes":';
  await writeFile(path.join(isolation.home, "pre-z8-u1-malformed-config.txt"), malformed);
  await seedConfig(isolation, malformed);
  await window.getByTestId("graph-template-load-recipes").click();
  await recipeState(window, "error");
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  assert.equal(
    await window.getByTestId("graph-template-parameter-request").inputValue(),
    VERIFIED_REQUEST,
  );
  await assertNoNativeWork(isolation, "failed recipe read");
  await captureU1(isolation, window, summary, "pre-z8-u1-read-failed");

  await seedConfig(isolation, { graphRecipes: [COMMAND_RECIPE] });
  await window.getByTestId("graph-template-load-recipes").click();
  await recipeState(window, "ready");
  for (const slot of ["build", "test"])
    assert.deepEqual(await choices(window, `graph-template-recipe-${slot}`), ["unbound"]);
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  await assertNoNativeWork(isolation, "incompatible recipe kind");
  await captureU1(isolation, window, summary, "pre-z8-u1-incompatible-recipes");

  await window.getByTestId("graph-template-setup-checks").click();
  const project = window.getByTestId("graph-project-recipes");
  if (
    (await project.evaluate((element) => element.tagName)) === "DETAILS" &&
    (await project.getAttribute("open")) === null
  )
    await project.locator(":scope > summary").click();
  await openRawChecks(window);
  await window.getByTestId("graph-load-recipes").click();
  await recipeState(window, "ready");
  const configured = [COMMAND_RECIPE, BUILD_RECIPE, TEST_RECIPE];
  const typedConfiguration = JSON.stringify(configured, null, 2);
  await window.getByTestId("graph-recipes-json").fill(typedConfiguration);
  const externalRecipes = [{ ...COMMAND_RECIPE, name: "Externally changed synthetic check" }];
  await seedConfig(isolation, { graphRecipes: externalRecipes });
  await window.getByTestId("graph-save-recipes").click();
  await project
    .getByRole("alert")
    .filter({ hasText: /configuration changed/i })
    .waitFor();
  assert.equal(await window.getByTestId("graph-recipes-json").inputValue(), typedConfiguration);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"))
      .graphRecipes,
    externalRecipes,
  );
  await assertNoNativeWork(isolation, "actual recipe digest conflict");
  await captureU1(isolation, window, summary, "pre-z8-u1-config-save-conflict");
  await openRawChecks(window);
  await window.getByTestId("graph-load-recipes").click();
  await recipeState(window, "ready");
  await window.getByTestId("graph-recipes-use-saved").waitFor();
  assert.equal(await window.getByTestId("graph-save-recipes").isDisabled(), true);
  assert.equal(await window.getByTestId("graph-recipes-json").inputValue(), typedConfiguration);
  await window.getByTestId("graph-recipes-use-saved").click();
  assert.equal(
    await window.getByTestId("graph-recipes-json").inputValue(),
    JSON.stringify(externalRecipes, null, 2),
  );
  await window.getByTestId("graph-recipes-json").fill(typedConfiguration);
  await window.getByTestId("graph-save-recipes").click();
  await window.getByTestId("graph-recipes-saved").waitFor();
  assert.deepEqual(
    JSON.parse(await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"))
      .graphRecipes,
    configured,
  );
  await window.getByTestId("graph-return-to-workflow").click();
  assert.equal(
    await window.getByTestId("graph-template-parameter-request").inputValue(),
    VERIFIED_REQUEST,
  );
  await window.getByTestId("graph-template-load-recipes").click();
  await recipeState(window, "ready");
  assert.deepEqual(await choices(window, "graph-template-recipe-build"), ["unbound", "u1-build"]);
  assert.deepEqual(await choices(window, "graph-template-recipe-test"), ["unbound", "u1-test"]);
  await selectValue(window, "graph-template-recipe-build", "u1-build");
  await selectValue(window, "graph-template-recipe-test", "u1-test");
  assert.equal(await window.getByTestId("graph-library-instantiate").isEnabled(), true);
  await assertNoNativeWork(isolation, "saved compatible recipe configuration");
  await captureU1(isolation, window, summary, "pre-z8-u1-compatible-recipes");
  await seedConfig(isolation, { graphRecipes: [] });
  await window.getByTestId("graph-template-load-recipes").click();
  await recipeState(window, "ready");
  summary.assertions.push(
    "Empty, read-failed, wrong-kind and compatible saved recipe states are distinct; actual configuration compare-and-swap failure retains typed JSON until explicit Use saved. Retry and Setup/back retain the typed task with zero native/model/check execution.",
  );
}

export async function instantiateU1(isolation, window, summary) {
  await selectValue(window, "graph-library-entry", "agent-assisted");
  // UX 审计后内联的新运行表单不再重复显示工作区路径；同一事实由面板头部的工作区行给出。
  assert.equal(await window.getByTestId("graph-workspace").innerText(), isolation.workspace);
  const request = window.getByTestId("graph-template-parameter-request");
  await request.fill("   ");
  assert.equal(await window.getByTestId("graph-library-instantiate").isDisabled(), true);
  await request.fill(REQUEST);
  assert.equal(await window.getByTestId("graph-library-instantiate").isEnabled(), true);
  assert.match(
    await window.getByTestId("graph-template-verification").innerText(),
    /agent|not configured|not included/i,
  );
  assert.equal(await window.locator('[data-testid^="graph-template-recipe-"]').count(), 0);
  await selectValue(window, "graph-library-entry", "generic");
  assert.equal(await request.inputValue(), VERIFIED_REQUEST);
  await selectValue(window, "graph-library-entry", "agent-assisted");
  assert.equal(await request.inputValue(), REQUEST);
  await captureU1(isolation, window, summary, "pre-z8-u1-agent-assisted-creation");

  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-library-open").click();
  await window.getByTestId("graph-library-dialog").waitFor();
  assert.equal(await request.inputValue(), REQUEST);
  await window.keyboard.press("Escape");
  await window.getByTestId("graph-library-dialog").waitFor({ state: "hidden" });
  await window.getByTestId("graph-library-open").click();
  assert.equal(await request.inputValue(), REQUEST);
  await window.keyboard.press("Escape");
  await window.getByTestId("graph-library-dialog").waitFor({ state: "hidden" });
  await window.getByTestId("graph-name").fill("PRE_Z8_U1_SAVED_BASELINE");
  await window.getByTestId("graph-save").click();
  await waitForRecord(isolation, (value) => value.definition.name === "PRE_Z8_U1_SAVED_BASELINE");
  await window.getByTestId("graph-name").fill("PRE_Z8_U1_UNSAVED_DESIGN");
  const boundaryOptions = {
    request: REQUEST,
    name: "PRE_Z8_U1_UNSAVED_DESIGN",
    capture: (name) => captureU1(isolation, window, summary, name),
    idle: (label) => assertNoNativeWork(isolation, label),
  };
  await verifyWorkspaceDraftRetention(isolation, window, summary, boundaryOptions);
  // UX 审计后 Workflows 标签只剩设计画布；旧的“Workflows”页签内容现在是 Runs → New run。
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-replace-dialog").waitFor();
  await window.getByTestId("graph-replace-cancel").click();
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), "PRE_Z8_U1_UNSAVED_DESIGN");
  // UX 审计后 Workflows 标签只剩设计画布；旧的“Workflows”页签内容现在是 Runs → New run。
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  assert.equal(await request.inputValue(), REQUEST);
  await assertNoNativeWork(
    isolation,
    "template switching, dialog reopen and cancelled replacement",
  );
  await captureU1(isolation, window, summary, "pre-z8-u1-retained-task-and-draft");
  await verifyFailedSaveReplacement(isolation, window, summary, boundaryOptions);
  // UX-M3：新运行页直接写出本次将实例化的工作流版本；内置版本读取 Host 实际提供的，不写死。
  const offeredLine = await window.getByTestId("graph-new-run-version-line").innerText();
  const offered = Number(/(?:Version|版本)\s+(\d+)/.exec(offeredLine)?.[1]);
  assert.ok(Number.isInteger(offered) && offered >= 1, `no offered version in: ${offeredLine}`);
  assert.match(offeredLine, /Built-in|内置/);
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-replace-dialog").waitFor();
  await window.getByTestId("graph-replace-discard").click();
  const record = await waitForRecord(
    isolation,
    (value) => value.definition.template?.id === "agent-assisted",
  );
  assert.equal(
    record.definition.template.version,
    offered,
    "the instance pins the version the page said it would use",
  );
  assert.deepEqual(
    record.definition.nodes.map((node) => node.id),
    ["start", "analyze", "implement", "review", "final-gate", "end"],
  );
  assert.equal(
    record.definition.nodes.some((node) => node.type === "tool"),
    false,
  );
  assert.equal(record.definition.nodes.find((node) => node.type === "end").outputNodeId, "review");
  assert.equal(record.definition.routing.region, undefined);
  assert.equal(record.definition.template.parameters.request, REQUEST);
  assert.equal(
    record.definition.nodes.find((node) => node.id === "start").request.split(REQUEST).length - 1,
    1,
  );
  await assertNoNativeWork(isolation, "agent-assisted template instantiation");
  summary.instantiatedDefinition = record.definition;
  summary.assertions.push(
    "Agent-assisted (the offered built-in version) pins the existing v5 semantics without recipes/JSON; task and dirty draft survive navigation/cancel, and only explicit discard replaces the draft.",
  );
  await window.getByTestId("graph-view-design").click();
}
