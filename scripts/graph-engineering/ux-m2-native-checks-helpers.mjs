// Shared pieces of the UX-M2.2 native checks journey (kept apart so each module stays under the line limit).
import assert from "node:assert/strict";
import { T, flush } from "./ux-m2-native-common.mjs";
import { editCheck, readConfig, recipeFieldName } from "./ux-m1-native-checks-helpers.mjs";

export const noDialog = async (window) =>
  assert.equal(
    await window.locator('[role="dialog"], [role="alertdialog"]').count(),
    0,
    "no dialog",
  );
export const changeRows = (window) =>
  window
    .locator('[data-testid="graph-recipe-changes"] [data-testid="graph-recipe-change"]')
    .evaluateAll((items) =>
      items
        .map((item) => `${item.getAttribute("data-change")}:${item.getAttribute("data-check-id")}`)
        .sort(),
    );
/** Replace the whole unsaved list through the Advanced raw JSON field, as a user can. */
export async function editRaw(window, update) {
  const field = T(window, "graph-recipes-json");
  await field.evaluate((element) => {
    const disclosure = element.closest("details");
    if (disclosure) disclosure.open = true;
  });
  await field.fill(JSON.stringify(update(JSON.parse(await field.inputValue())), null, 2));
  await flush(window);
}
export const rename = async (window, which, name) => {
  await editCheck(window, which);
  await (await recipeFieldName(window)).name.fill(name);
};
export const savedOnDisk = async (workspace) => (await readConfig(workspace)).graphRecipes;
