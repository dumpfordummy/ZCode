// UX-M2.2 native acceptance, late steps: an active real run (Save refused, Discard renderer-only) and a
// real digest conflict (one framed error near Save, the established conflict flow is the only discard path).
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  T,
  assertUnchanged,
  cancelRun,
  flush,
  invokeHandler,
  observe,
  pendingPermission,
  shot,
  snapshot,
  startFromNewRun,
  step,
  waitRecord,
  waitUntil,
} from "./ux-m2-native-common.mjs";
import {
  alertWith,
  back,
  configDigest,
  configPath,
  editCheck,
  readConfig,
  recipeFieldName,
} from "./ux-m1-native-checks-helpers.mjs";
import { changeRows, rename } from "./ux-m2-native-checks-helpers.mjs";

export async function lateSteps({ isolation, window, receipt }) {
  const ws = isolation.workspace;
  let runId;
  await step(
    receipt,
    "K5",
    "E. While a real run owns the workspace: editing works, Save is refused, Discard is renderer-only",
    async () => {
      const run = await startFromNewRun(isolation, window);
      runId = run.id;
      await waitRecord(isolation, pendingPermission, "the run's native permission wait");
      await T(window, "graph-new-run").click();
      await T(window, "graph-selected-check-edit").first().waitFor();
      await editCheck(window, "build");
      await (await recipeFieldName(window)).name.fill("Edited while a run is active");
      assert.equal(await T(window, "graph-save-recipes").isDisabled(), true, "Save refused");
      observe(
        receipt,
        "Save refusal reason",
        await window
          .locator("#graph-recipes-save-reason, [data-testid=graph-recipes-save-reason]")
          .first()
          .innerText()
          .catch(() => "(reason element not found by id)"),
      );
      const digest = await configDigest(ws);
      const before = await snapshot(isolation);
      assert.equal(await invokeHandler(window, "graph-save-recipes"), "invoked");
      await flush(window);
      assert.equal(await configDigest(ws), digest, "the handler wrote nothing");
      assert.deepEqual(
        await changeRows(window),
        ["modified:reviewer-build"],
        "the summary still works",
      );
      await T(window, "graph-recipe-discard").click();
      await T(window, "graph-recipe-discard-confirm").click();
      await T(window, "graph-recipe-discarded").waitFor();
      assert.equal(await configDigest(ws), digest);
      assertUnchanged(
        before,
        await snapshot(isolation),
        "Discard while a run is active touches only the renderer",
      );
      await shot(isolation, window, receipt, "k-active-run-save-refused", [1280, 720]);
      await back(window).catch(() => {});
      await T(window, "graph-view-current-run")
        .click()
        .catch(() => {});
      await cancelRun(isolation, window, runId);
    },
  );

  await step(
    receipt,
    "K6",
    "F. A real digest conflict: Save is refused once near Save, edits kept; the conflict flow is the only discard path",
    async () => {
      await T(window, "graph-new-run").click();
      await rename(window, "test", "Conflict probe edit");
      const external = await readConfig(ws);
      external.graphRecipes.find((recipe) => recipe.id === "reviewer-build").name =
        "Changed outside";
      await writeFile(configPath(ws), JSON.stringify(external));
      const externalDigest = await configDigest(ws);
      await T(window, "graph-save-recipes").click();
      await T(window, "graph-recipes-save-error").waitFor({ timeout: 30000 });
      const text = await T(window, "graph-recipes-save-error").innerText();
      observe(receipt, "Save failure text", text);
      assert.match(text, /The saved checks were not changed\. Your unsaved edits are kept\./);
      assert.match(text, /configuration changed/i, "Host diagnostic verbatim");
      const copies = await window
        .locator('[role="alert"]')
        .evaluateAll(
          (items) => items.filter((item) => /configuration changed/i.test(item.textContent)).length,
        );
      assert.equal(copies, 1, "the error is shown once");
      assert.equal(await configDigest(ws), externalDigest, "the external edit was not overwritten");
      assert.ok(
        (await T(window, "graph-recipes-json").inputValue()).includes("Conflict probe edit"),
        "unsaved edits remain",
      );
      await shot(isolation, window, receipt, "k-save-conflict-framed", [1280, 720]);
      await T(window, "graph-template-load-recipes")
        .click()
        .catch(() => {});
      const useSaved = T(window, "graph-recipes-use-saved");
      await useSaved.waitFor({ timeout: 15000 });
      assert.equal(
        await T(window, "graph-recipe-discard").count(),
        0,
        "no second discard path in a conflict",
      );
      assert.match(await T(window, "graph-recipe-changes").innerText(), /have changed since/);
      await shot(isolation, window, receipt, "k-conflict-flow", [1280, 720]);
      await useSaved.click();
      await waitUntil(
        window,
        () => !document.querySelector('[data-testid="graph-recipe-changes"]'),
        undefined,
        "conflict resolved",
      );
      assert.equal(await configDigest(ws), externalDigest, "the external edit was kept");
      await back(window);
      assert.equal(
        await T(window, "graph-new-run-error").count(),
        0,
        "no Review error for a checks failure",
      );
      assert.ok((await alertWith(window, /configuration changed/i).count()) === 0);
      assert.equal(
        JSON.parse(await readFile(configPath(ws), "utf8")).graphRecipes.find(
          (recipe) => recipe.id === "reviewer-build",
        ).name,
        "Changed outside",
      );
    },
  );
}
