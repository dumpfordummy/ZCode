import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE_PATHS, BUILD_PATHS, FRAMEWORK } from "./pre-z8-dotnet-source.mjs";
import { readGraphRecord, selectValue, waitForSaved } from "./z2-native-helpers.mjs";
import { captureU1 as captureNativeCheckpoint } from "./pre-z8-u1-ui.mjs";
import { assertU2NoExecution } from "./pre-z8-u2-proof.mjs";
import { withU2OwnedMutation } from "./pre-z8-u2-fault.mjs";

export { captureNativeCheckpoint };
export const U2_SAVED_DESIGN = "PRE_Z8_U2_PRESERVED_SAVED_DESIGN";
export const U2_DIRTY_DESIGN = "PRE_Z8_U2_PRESERVED_UNSAVED_DESIGN";
export const U2_EXISTING_CHECK = {
  id: "preserved-custom-check",
  name: "Unselected existing synthetic check",
  executable: "dotnet",
  args: ["--version"],
  cwd: ".",
  timeoutMs: 30000,
  sourcePaths: [],
  expectedOutputs: [],
  redactEnvironmentVariables: ["PRE_Z8_SYNTHETIC_ONLY"],
  verifier: { kind: "command" },
};
export const U2_CONFIG = {
  graphRecipes: [U2_EXISTING_CHECK],
  preZ8SyntheticSentinel: "preserve-unrelated-configuration",
};

export async function openU2Details(locator) {
  if ((await locator.getAttribute("open")) === null)
    await locator.locator(":scope > summary").click();
}

export async function preserveU2Design(isolation, window) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-name").fill(U2_SAVED_DESIGN);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  const baseline = await readGraphRecord(isolation);
  assert.equal(baseline.definition.name, U2_SAVED_DESIGN);
  assert.deepEqual(baseline.runs, []);
  await window.getByTestId("graph-name").fill(U2_DIRTY_DESIGN);
  return baseline;
}

export async function configureU2Checks(isolation, window, summary, baseline, scenario) {
  await window.getByTestId("graph-view-setup").click();
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  await window.getByTestId("graph-project-scan").click();
  await window.locator('[data-testid="graph-project-discovery"][data-state="complete"]').waitFor();
  const candidates = window.getByTestId("graph-project-candidate");
  assert.ok(
    (await candidates.count()) >= 2,
    "Both genuine project and adapter candidates must remain visible.",
  );
  const candidate = window.locator(
    '[data-testid="graph-project-candidate"][data-path="Fixture.Tests.csproj"]',
  );
  assert.match(await candidate.innerText(), /unknown.*unsupported|unsupported/is);
  assert.match(await candidate.innerText(), /dynamic|properties|imports/i);
  assert.equal(await candidate.getByTestId("graph-project-use-build").isDisabled(), true);
  assert.equal(await candidate.getByTestId("graph-project-add-test").isDisabled(), true);
  await assertU2NoExecution(isolation, baseline, "genuine fixture metadata scan");
  await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-discovery-uncertainty");
  await openU2Details(window.getByTestId("graph-dotnet-preset"));
  assert.equal(
    await window.getByTestId("graph-dotnet-build-project").inputValue(),
    "",
    "Discovery must not auto-select a project.",
  );
  for (const [name, value] of Object.entries({
    idPrefix: "native-u2",
    executable: "dotnet",
    cwd: ".",
    timeoutMs: "120000",
    "build-project": "Fixture.Tests.csproj",
    configuration: "Release",
    framework: FRAMEWORK,
    "source-paths": SOURCE_PATHS.join("\n"),
    "expected-outputs": BUILD_PATHS.join("\n"),
  }))
    await window.getByTestId(`graph-dotnet-${name}`).fill(value);
  await window.getByTestId("graph-dotnet-add-test").click();
  for (const [name, value] of Object.entries({
    project: "Fixture.Tests.csproj",
    configuration: "Release",
    framework: FRAMEWORK,
    assembly: `bin/Release/${FRAMEWORK}/Fixture.Tests.dll`,
    minimumTests: "1",
    expectedTests: scenario === "zero" ? "" : ["skipped", "multi"].includes(scenario) ? "1" : "4",
    filter:
      scenario === "zero"
        ? "FullyQualifiedName=PreZ8Fixture.Cases.DoesNotExist"
        : scenario === "skipped"
          ? "FullyQualifiedName=PreZ8Fixture.Cases.Disabled"
          : scenario === "multi"
            ? "FullyQualifiedName=PreZ8Fixture.Cases.AddPositive"
            : "",
  }))
    await window.getByTestId(`graph-dotnet-test-${name}-0`).fill(value);
  if (scenario === "multi") {
    await window.getByTestId("graph-dotnet-add-test").click();
    for (const [name, value] of Object.entries({
      project: "Fixture.Tests.csproj",
      configuration: "Release",
      framework: FRAMEWORK,
      assembly: `bin/Release/${FRAMEWORK}/Fixture.Tests.dll`,
      minimumTests: "1",
      expectedTests: "1",
      filter: "FullyQualifiedName=PreZ8Fixture.Cases.AddNegative",
    }))
      await window.getByTestId(`graph-dotnet-test-${name}-1`).fill(value);
  }
  if (scenario === "missing-required") {
    await window.getByTestId("graph-dotnet-test-required-0-add").click();
    await window
      .getByTestId("graph-dotnet-test-required-0-0")
      .fill("pre-z8-u2-required-identity-not-discovered");
  }
  assert.equal(await window.getByTestId("graph-dotnet-generate").isDisabled(), true);
  await window.getByTestId("graph-dotnet-review-manifest").setChecked(true);
  await window.getByTestId("graph-dotnet-generate").click();
  const proposal = window.getByTestId("graph-dotnet-proposal");
  await proposal.waitFor();
  assert.equal(await proposal.getByRole("alert").count(), 0, await proposal.innerText());
  const generated = JSON.parse(await proposal.locator("pre").textContent());
  assert.equal(generated.length, scenario === "multi" ? 3 : 2);
  assert.ok(generated[0].args.includes("--no-restore") && generated[0].args.includes("-t:Rebuild"));
  assert.ok(generated[1].args.includes("--no-build") && generated[1].args.includes("--no-restore"));
  assert.deepEqual(generated[0].sourcePaths, SOURCE_PATHS);
  assert.deepEqual(generated[0].expectedOutputs, BUILD_PATHS);
  await assertU2NoExecution(isolation, baseline, "guided preset compilation");
  await captureNativeCheckpoint(
    isolation,
    window,
    summary,
    "pre-z8-u2-reviewed-manifest",
    [1920, 1080],
  );
  await window.getByTestId("graph-dotnet-apply").click();
  const raw = window.getByTestId("graph-recipes-json");
  await openU2Details(raw.locator("xpath=ancestor::details[1]"));
  const draft = JSON.parse(await raw.inputValue());
  assert.deepEqual(draft, [U2_EXISTING_CHECK, ...generated]);
  await window.getByTestId("graph-recipes-validate").click();
  await window.locator('[data-testid="graph-recipes-validation"][data-state="ready"]').waitFor();
  await window.getByTestId("graph-save-recipes").click();
  await window.getByTestId("graph-recipes-saved").waitFor();
  const configuration = await readFile(
    path.join(isolation.workspace, ".zcode/config.json"),
    "utf8",
  );
  const saved = JSON.parse(configuration);
  assert.equal(saved.preZ8SyntheticSentinel, U2_CONFIG.preZ8SyntheticSentinel);
  assert.deepEqual(saved.graphRecipes, draft);
  assert.equal(saved.graphRecipes[2].verifier.buildNodeId, "build");
  if (scenario === "multi") assert.equal(saved.graphRecipes[3].verifier.buildNodeId, "build");
  await assertU2NoExecution(isolation, baseline, "static validation and explicit profile save");
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), U2_DIRTY_DESIGN);
  await window.getByTestId("graph-view-setup").click();
  summary.assertions.push(
    "Scan retains genuine SDK-reference uncertainty; explicit reviewed preset/static validation/save preserve independent assertions, existing custom checks, unrelated config and both saved/unsaved design with zero execution.",
  );
  summary.savedRecipes = draft;
  return { configuration, generated };
}

export async function selectU2Checks(window, mode = "recipes", scenario) {
  await selectValue(window, "graph-check-mode", mode);
  if (mode === "recipes") {
    await window.getByTestId("graph-check-select-native-u2-build").setChecked(true);
    await window.getByTestId("graph-check-select-native-u2-test-1").setChecked(true);
    await selectValue(window, "graph-check-build-native-u2-test-1", "native-u2-build");
    if (scenario === "multi") {
      await window.getByTestId("graph-check-select-native-u2-test-2").setChecked(true);
      await selectValue(window, "graph-check-build-native-u2-test-2", "native-u2-build");
    }
  }
}

export async function prepareU2Review(isolation, window, summary, baseline, name) {
  await window.getByTestId("graph-check-availability").click();
  const availability = window.locator(
    '[data-testid="graph-check-availability-state"][data-state="ready"]',
  );
  await availability.waitFor();
  assert.match(await availability.innerText(), /does not establish SDK version|Unknown/i);
  await assertU2NoExecution(isolation, baseline, "native executable metadata availability");
  await window.getByTestId("graph-check-prepare").click();
  const review = window.getByTestId("graph-check-preview");
  await review.waitFor();
  const snapshot = JSON.parse(
    await window.getByTestId("graph-check-preview-snapshot").textContent(),
  );
  assert.equal(snapshot.kind, "checks-preview");
  assert.equal(snapshot.definition.version, 4);
  assert.equal(
    snapshot.definition.nodes.some((node) => node.type === "task" || node.type === "approval"),
    false,
  );
  assert.equal(await window.getByTestId("graph-check-ack").isChecked(), false);
  assert.equal(await window.getByTestId("graph-check-confirm").isDisabled(), true);
  await assertU2NoExecution(isolation, baseline, "captured checks review before acknowledgment");
  await captureNativeCheckpoint(isolation, window, summary, name);
  return snapshot;
}

export async function rejectU2StaleReview(isolation, window, summary, baseline) {
  const fault = await withU2OwnedMutation(isolation, "source", async () => {
    await window.getByTestId("graph-check-ack").setChecked(true);
    await window.getByTestId("graph-check-confirm").click();
    await window.getByTestId("graph-check-preview-error").waitFor();
    await assertU2NoExecution(isolation, baseline, "source changed after captured review");
    await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-stale-review-rejected");
  });
  summary.staleReviewRestoration = fault.receipt;
  await window.keyboard.press("Escape");
  await window.getByTestId("graph-check-preview").waitFor({ state: "hidden" });
}
