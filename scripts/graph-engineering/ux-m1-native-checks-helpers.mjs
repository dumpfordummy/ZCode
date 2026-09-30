// Shared pieces of the native "checks" journey (kept apart so each module stays under the line limit).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { T, chipValue, flush, sha256 } from "./ux-m1-native-common.mjs";

export const REQUEST_C = "Checks journey: tidy docs/Notes.md";
export const stepRows = (window, which) =>
  window
    .locator(`[data-testid="graph-selected-checks-${which}"] [data-testid="graph-selected-check"]`)
    .evaluateAll((items) =>
      items.map((item) => ({
        id: item.getAttribute("data-check-id"),
        state: item.getAttribute("data-state"),
        text: item.innerText.replace(/\s+/g, " ").trim(),
      })),
    );
export const pickRecipe = async (window, testId, value) => {
  await T(window, testId).click();
  await window.locator(`[role="option"][data-value="${value}"]`).click();
  await flush(window);
};
export const optionValues = async (window, testId) => {
  await T(window, testId).click();
  const values = await window
    .locator('[role="option"][data-value]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-value")));
  await window.keyboard.press("Escape");
  return values;
};
export const back = async (window) => {
  await T(window, "graph-return-to-workflow").click();
  await T(window, "graph-template-parameter-request").waitFor();
};
export const configPath = (workspace) => path.join(workspace, ".zcode/config.json");
export const readConfig = async (workspace) =>
  JSON.parse(await readFile(configPath(workspace), "utf8"));
export const configDigest = async (workspace) => sha256(await readFile(configPath(workspace)));
export const alertWith = (window, pattern) =>
  window.getByRole("alert").filter({ hasText: pattern }).first();
/** Draft facts as the user sees them (the draft store itself is renderer memory). */
export const draftView = async (window) => ({
  request: await T(window, "graph-template-parameter-request").inputValue(),
  instructions: await chipValue(window, "instructions").catch(() => null),
  build: await stepRows(window, "build"),
  test: await stepRows(window, "test"),
});
export async function editCheck(window, which) {
  const edit = window.locator(
    `[data-testid="graph-selected-checks-${which}"] [data-testid="graph-selected-check-edit"]`,
  );
  await edit.focus();
  await window.keyboard.press("Enter");
  await T(window, "graph-guided-recipe").waitFor();
}
export const recipeFieldName = async (window) => {
  const id = await T(window, "graph-guided-recipe").getAttribute("data-recipe-id");
  const list = (await readConfigFromUi(window)).findIndex((recipe) => recipe.id === id);
  return { id, name: T(window, `graph-recipe-field-${list}-name`) };
};
export const readConfigFromUi = async (window) => {
  await T(window, "graph-recipes-json").evaluate((element) => {
    const disclosure = element.closest("details");
    if (disclosure) disclosure.open = true;
  });
  return JSON.parse(await T(window, "graph-recipes-json").inputValue());
};
