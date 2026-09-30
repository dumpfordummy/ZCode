// Shared helpers for the UX-M1 browser scenarios. Assertions target the draft store, the Host call
// log, focus and ARIA, not only visible text.
import assert from "node:assert/strict";
import path from "node:path";
import { addByKeyboard } from "./context-picker-helpers.mjs";
import { ALL_CHECKS } from "./ux-m1-checks.mjs";

export const T = (page, id) => page.getByTestId(id);
export const SIZES = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
const ALLOWED_OPS = new Set([
  "graph.getWorkspace",
  "graph.saveDefinition",
  "graph.validateDefinition",
  "graph.recipes.read",
  "graph.recipes.save",
  "validate",
  "graph.run",
  "wf.list",
  "wf.instantiate",
  "wf.prepare",
  "reference-catalog",
  "validate-reference",
  "searchWorkspaceFiles",
  "selectFile",
  "openConversation",
]);

export async function until(check, what, timeout = 8000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
export const flush = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
export const setState = (page, patch) =>
  page.evaluate((value) => window.__harness.set(value), patch);
export const drafts = (page) => page.evaluate(() => window.__harness.drafts());
export const navigation = (page) => page.evaluate(() => window.__harness.navigation());
export const focused = (page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
  );

/** Calls that reached the fixture Host, by operation. */
export const started = (host, name) =>
  host.calls.filter((call) => call.op === name && call.phase === "start");
export const finished = (host, name) =>
  host.calls.filter((call) => call.op === name && call.phase === "done");
/** Operations that would instantiate, save, prepare or admit work (the guarded set). */
export const ADMISSION_OPS = ["wf.instantiate", "graph.saveDefinition", "wf.prepare", "graph.run"];
export const admissionCalls = (host) =>
  host.calls.filter((call) => call.phase === "start" && ADMISSION_OPS.includes(call.op));

export async function boot(page, host, url, patch) {
  await page.goto(url);
  await page.waitForFunction(() => window.__harness?.ready === true);
  if (patch) await setState(page, patch);
  await T(page, "graph-new-run-pane").waitFor();
  await T(page, "graph-template-parameter-request").waitFor();
  await flush(page);
}

/** Every scenario ends here: nothing forbidden was touched, only known operations were used. */
export function assertClean(host) {
  assert.deepEqual(
    host.calls.filter((call) => call.op === "FORBIDDEN"),
    [],
    "no forbidden service or platform member may be touched",
  );
  for (const call of host.calls)
    assert.ok(
      ALLOWED_OPS.has(call.op) || call.op === "FORBIDDEN",
      `unexpected operation ${call.op}`,
    );
}

export async function shot(page, dir, name, viewport) {
  if (!dir) return;
  await page.setViewportSize(viewport);
  await flush(page);
  await page.screenshot({
    path: path.join(dir, `${name}-${viewport.width}x${viewport.height}.png`),
  });
}

/** Pick an option of a Radix select by its `data-value` (same approach as the native scripts). */
export async function selectValue(page, testId, value) {
  await T(page, testId).click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
  await flush(page);
}
/** Option values currently offered by a select (opened, read, closed with Escape). */
export async function optionValues(page, testId) {
  await T(page, testId).click();
  const values = await page
    .locator('[role="option"][data-value]')
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-value")));
  await page.keyboard.press("Escape");
  return values;
}

export const GENERIC_KEY = "generic:1";
/** The retained draft of one template in one workspace (draft-store fact, not page text). */
export const templateDraft = async (page, host, workspace = "A", key = GENERIC_KEY) =>
  (await drafts(page))[host.workspaces[workspace]]?.templates[key];
export const recipesReady = (page) =>
  until(
    async () => (await T(page, "graph-recipe-read-state").getAttribute("data-state")) === "ready",
    "saved checks read",
  );
/** Choose the Verified (Build/Test) workflow and wait for its saved checks. */
export async function chooseGeneric(page) {
  await selectValue(page, "graph-library-entry", "generic");
  await T(page, "graph-template-recipe-build").waitFor();
  await recipesReady(page);
}
export const chooseChecks = async (page, { build, test }) => {
  if (build) await selectValue(page, "graph-template-recipe-build", build);
  if (test) await selectValue(page, "graph-template-recipe-test", test);
};
/** What the New-run pane shows for one step, read from the DOM. */
export const stepRows = (page, step) =>
  page
    .locator(`[data-testid="graph-selected-checks-${step}"] [data-testid="graph-selected-check"]`)
    .evaluateAll((items) =>
      items.map((item) => ({
        id: item.getAttribute("data-check-id"),
        state: item.getAttribute("data-state"),
        text: item.innerText.replace(/\s+/g, " ").trim(),
      })),
    );
export const inViewport = async (page, testId) => {
  const box = await T(page, testId).boundingBox();
  const size = page.viewportSize();
  return Boolean(box) && box.y >= 0 && box.y + box.height <= size.height;
};

export const REQUEST = "Fix the request parser";
/** A prepared draft: Verified workflow, request, one context reference and both checks chosen. */
export async function preparedDraft(page, host, url, seeded = ALL_CHECKS) {
  await host.seedRecipes("A", seeded);
  await boot(page, host, url);
  await chooseGeneric(page);
  await T(page, "graph-template-parameter-request").fill(REQUEST);
  await addByKeyboard(page, "Context", "instructions");
  await chooseChecks(page, { build: "build-main", test: "test-unit" });
}
/** Open the Checks editor on one selected check with the keyboard (focus, then Enter). */
export async function editCheckByKeyboard(page, step) {
  await page
    .locator(
      `[data-testid="graph-selected-checks-${step}"] [data-testid="graph-selected-check-edit"]`,
    )
    .focus();
  await page.keyboard.press("Enter");
  await T(page, "graph-guided-recipe").waitFor();
}
/** Invoke a control's React onClick directly, as any alternate control or script would. */
export const invokeHandler = (page, testId) =>
  page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    const key = Object.keys(element).find((name) => name.startsWith("__reactProps"));
    element[key].onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: element });
  }, testId);
