// Shared pieces of the native Context-picker journey (kept apart so each module stays under the line limit).
import assert from "node:assert/strict";
import { openPicker, search, until, optionCount } from "./context-picker-helpers.mjs";
import { T } from "./ux-m1-native-common.mjs";

export const optionValues = (window) =>
  window
    .locator('[data-testid^="graph-context-option-"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-value")));

/** Open the picker, choose a slot when there is one to choose, search, and pick a result by keyboard. */
export async function pickByValue(window, { slot, query, includes }) {
  await openPicker(window);
  if (slot && (await T(window, `graph-context-slot-${slot}`).count()))
    await T(window, `graph-context-slot-${slot}`).check();
  await search(window, query);
  await until(async () => (await optionCount(window)) > 0, `results for "${query}"`);
  const values = await optionValues(window);
  const index = values.findIndex((value) => value?.includes(includes));
  assert.ok(index >= 0, `no result contains ${includes}: ${JSON.stringify(values)}`);
  for (let count = 0; count <= index; count += 1) await window.keyboard.press("ArrowDown");
  await window.keyboard.press("Enter");
  return values;
}
export const popoverClosed = (window) =>
  T(window, "graph-context-popover").waitFor({ state: "hidden" });
export const chipStatus = (window, role) =>
  T(window, `graph-context-chip-${role}`).getAttribute("data-status");
