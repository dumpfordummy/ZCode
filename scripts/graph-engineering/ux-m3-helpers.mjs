// Shared helpers for the UX-M3 browser scenarios (library dialog, New-run version line, sharing).
import assert from "node:assert/strict";
import { T, boot, flush, selectValue } from "./ux-m1-helpers.mjs";

export { T, boot, flush, selectValue };

/** Operations that would change the library, the design or admit work. Must stay empty while a run owns the workspace. */
export const MUTATION_OPS = [
  "wf.mutate",
  "wf.instantiate",
  "graph.saveDefinition",
  "wf.prepare",
  "graph.run",
];
export const mutationCalls = (host) =>
  host.calls.filter((call) => call.phase === "start" && MUTATION_OPS.includes(call.op));
export const callsOf = (host, op) =>
  host.calls.filter((call) => call.phase === "start" && call.op === op);

/** Workflows -> Workflow library dialog, once the library has been read. */
export async function openLibrary(page) {
  await T(page, "graph-view-design").click();
  await T(page, "graph-library-open").click();
  await T(page, "graph-library-versions").waitFor();
  await flush(page);
}
export const openShare = (page) =>
  page.locator('[data-testid="graph-library-share"] > summary').click();
export const openAdvanced = (page) =>
  page.locator('[data-testid="graph-library-advanced"] > summary').click();

/** The version rows as the user reads them: number, labels and the facts behind them. */
export const versionRowsOf = (page) =>
  page.locator('[data-testid="graph-library-version-row"]').evaluateAll((rows) =>
    rows.map((row) => ({
      version: Number(row.getAttribute("data-version")),
      latest: row.getAttribute("data-latest") === "true",
      used: row.getAttribute("data-used") === "true",
      checked: row.querySelector("input").checked,
      text: row.innerText.replace(/\s+/g, " ").trim(),
    })),
  );
/** Visible labels of the options of a select (opened, read, closed with Escape). */
export async function optionLabels(page, testId) {
  await T(page, testId).click();
  const labels = await page
    .locator("[role=option][data-value]")
    .evaluateAll((items) => items.map((item) => item.innerText.trim()));
  await page.keyboard.press("Escape");
  return labels;
}
export const librarySelection = async (page, host, workspace = "A") =>
  (await page.evaluate(() => window.__harness.drafts()))[host.workspaces[workspace]]
    ?.librarySelection;

export async function builtinFacts(host, id) {
  const entry = (await host.library.service.list()).entries.find((item) => item.id === id);
  assert.ok(entry?.builtin, `${id} is a built-in`);
  return entry;
}
