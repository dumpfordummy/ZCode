import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { selectValue } from "./z2-native-helpers.mjs";
import {
  capture,
  ledger,
  modelCount,
  readGraphRecord,
  showGraph,
  waitRun,
} from "./z5-native-observe.mjs";
import { fixtureRecipes } from "./z4-recipes.mjs";
import { SOURCE_PATHS } from "./z4-fixture.mjs";
import { slotRecipes } from "./z6-fixture.mjs";

async function captureDialog(isolation, window, summary, name) {
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
  (summary.dialogPresentation ??= []).push(
    await window.locator('[role="dialog"]:visible').evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        testId: element.getAttribute("data-testid"),
        opacity: style.opacity,
        background: style.backgroundColor,
        position: style.position,
        zIndex: style.zIndex,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
    }),
  );
  await capture(isolation, window, summary, name);
}
export async function instantiateNativeTemplate(isolation, window, summary, scenario) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-upgrade").click();
  await window.getByTestId("graph-upgrade-routing").click();
  const recipes = scenario === "slot" ? slotRecipes() : fixtureRecipes("build");
  const details = window.getByTestId("graph-project-recipes");
  await details.locator(":scope > summary").click();
  await window.getByTestId("graph-load-recipes").click();
  await window.getByTestId("graph-recipes-json").fill(JSON.stringify(recipes, null, 2));
  await window.getByTestId("graph-save-recipes").click();
  await window.getByTestId("graph-recipes-saved").waitFor();
  assert.deepEqual(
    JSON.parse(await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"))
      .graphRecipes,
    recipes,
  );
  await details.locator(":scope > summary").click();
  const before = await ledger(isolation),
    models = modelCount(isolation);
  await window.getByTestId("graph-library-open").click();
  await selectValue(window, "graph-library-entry", scenario);
  await selectValue(window, "graph-library-version", "1");
  await window
    .getByTestId("graph-template-parameter-request")
    .fill(
      scenario === "slot"
        ? "Refine only Normal and Free to implement supplied GameDoc.md R1–R5. Preserve Runner.cs and source authority; Bonus and Respin excluded; RTP N/A."
        : scenario === "bugfix"
          ? "Controlled synthetic staged bug fix: first apply the supplied initial MathOps.Add candidate (left + right + 1), then use actual failed-test feedback for bounded repairs. Preserve Runner.cs. This deliberately tests rejection of false success."
          : "Fix MathOps.Add to return left + right. Analyze actual source/tests and preserve Runner.cs; real Build/Test is required.",
    );
  if (scenario === "slot") {
    await window
      .getByTestId("graph-template-parameter-targetEngine")
      .fill("Selected synthetic C# Z6Slot.csproj / SlotRules.cs");
    await window
      .getByTestId("graph-template-parameter-criteria")
      .fill(
        "All 13 unchanged Runner.cs edge cases linked to GameDoc.md R1–R5; exact native source/build/report provenance; no RTP comparison.",
      );
    for (const id of ["normal", "free"])
      await window.getByTestId(`graph-template-parameter-${id}`).setChecked(true);
    for (const id of ["bonus", "respin"]) {
      const checkbox = window.getByTestId(`graph-template-parameter-${id}`);
      await checkbox.setChecked(true);
      await checkbox.setChecked(false);
    }
    await window.getByTestId("graph-template-reference-gameDoc").fill("GameDoc.md");
  }
  if (scenario === "generic") {
    await window.getByTestId("graph-template-reference-instructions").fill("ExtraInstructions.md");
    await window
      .getByTestId("graph-template-reference-skill")
      .fill(
        `glm:workspace:${path.join(isolation.workspace, ".agents/skills/fixture-guidance/SKILL.md")}`,
      );
  }
  await window.getByTestId("graph-template-load-recipes").click();
  await selectValue(
    window,
    "graph-template-recipe-build",
    scenario === "slot" ? "slot-build" : "fixture-build",
  );
  await selectValue(
    window,
    "graph-template-recipe-test",
    scenario === "slot" ? "slot-test" : "fixture-test",
  );
  if (scenario === "bugfix")
    await window.getByTestId("graph-template-source-paths").fill(SOURCE_PATHS.join("\n"));
  if (await window.getByTestId("graph-template-replace-draft").isVisible())
    await window.getByTestId("graph-template-replace-draft").setChecked(true);
  await captureDialog(isolation, window, summary, "z6-explicit-template-bindings");
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-library-dialog").waitFor({ state: "hidden", timeout: 30000 });
  const record = await readGraphRecord(isolation);
  assert.equal(record.definition.template.id, scenario);
  assert.equal(record.definition.template.version, 1);
  assert.deepEqual(await ledger(isolation), before);
  assert.equal(modelCount(isolation), models);
  if (scenario === "slot") {
    assert.deepEqual(record.definition.template.excluded.map((item) => item.nodeId).sort(), [
      "bonus",
      "respin",
    ]);
    assert.equal(
      record.definition.nodes.some((node) => ["bonus", "respin"].includes(node.id)),
      false,
    );
  }
  summary.instantiatedDefinition = record.definition;
  summary.assertions.push(
    "Actual native library instantiation pins chosen version, explicit parameters and local bindings with zero native inputs/model requests.",
  );
  await capture(isolation, window, summary, "z6-instantiated-native-template");
}
export async function startNativeTemplate(isolation, window, summary) {
  const before = await ledger(isolation),
    models = modelCount(isolation);
  await window.getByTestId("graph-run-button").click();
  await window.getByTestId("graph-run-confirmation").waitFor({ timeout: 30000 });
  const snapshot = JSON.parse(
    await window.getByTestId("graph-confirmation-definition").locator("pre").textContent(),
  );
  assert.ok(snapshot.provenance?.digest);
  assert.equal(snapshot.provenance.template.digest, snapshot.definition.template.digest);
  assert.equal(await window.getByTestId("graph-confirm-run").isDisabled(), true);
  assert.deepEqual(await ledger(isolation), before);
  assert.equal(modelCount(isolation), models);
  summary.confirmedSnapshot = snapshot;
  await captureDialog(isolation, window, summary, "z6-native-preflight-destinations");
  const refs = window
    .getByTestId("graph-workflow-provenance")
    .locator("details")
    .filter({ has: window.locator("summary", { hasText: "references" }) });
  if (await refs.count()) await refs.first().locator("summary").click();
  await window.getByTestId("graph-preflight-ack").setChecked(true);
  await window.getByTestId("graph-confirm-run").click();
  await showGraph(window);
  const run = await waitRun(isolation, (item) => Boolean(item.provenance));
  assert.deepEqual(run.definition, snapshot.definition);
  const { operationalDecision, ...captured } = run.provenance;
  assert.deepEqual(captured, snapshot.provenance);
  assert.equal(operationalDecision?.acknowledgedUnknowns, true);
  assert.equal(typeof operationalDecision?.acceptedAt, "number");
  return run;
}
