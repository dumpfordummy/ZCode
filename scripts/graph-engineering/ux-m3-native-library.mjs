// UX-M3.4: native-driver helpers for the single library dialog (Workflow, Versions, Use, Share,
// Advanced). They map the operations the historical z6/u1/u5 drivers perform onto the final UI;
// they assert nothing the drivers did not already assert, except that a built-in's version is READ
// from what the Host offers instead of being a constant (exact-version semantics are unchanged).
import assert from "node:assert/strict";
import { selectValue } from "./z2-native-helpers.mjs";

const T = (window, id) => window.getByTestId(id);

/** Version rows of the selected workflow, as the user reads them. */
export const offeredVersions = (window) =>
  window.locator('[data-testid="graph-library-version-row"]').evaluateAll((rows) =>
    rows.map((row) => ({
      version: Number(row.getAttribute("data-version")),
      checked: row.querySelector("input").checked,
      latest: row.getAttribute("data-latest") === "true",
    })),
  );

/** UX-M4: Versions / Use / Share / Advanced are single-level tabs (panels stay mounted, hidden when inactive). */
export const openTab = (window, name) => T(window, `graph-library-tab-${name}`).click();
export const openVersions = (window) => openTab(window, "versions");
export const openUse = (window) => openTab(window, "use");
export const openShare = (window) => openTab(window, "share");
export const openAdvanced = (window) => openTab(window, "advanced");

/** Select a workflow in the Workflow section. */
export const chooseEntry = (window, id) => selectValue(window, "graph-library-entry", id);
/** Select exactly one version row of the selected workflow. */
export async function chooseVersion(window, version) {
  await window
    .locator(`[data-testid="graph-library-version-row"][data-version="${version}"] input`)
    .check();
}
/** Workflow and, when given, version. */
export async function choose(window, id, version) {
  await chooseEntry(window, id);
  if (version !== undefined) await chooseVersion(window, version);
}

/**
 * Selects a built-in workflow and reads the version the Host offers for it (the checked row) and its
 * digest (Advanced). Nothing is hard-coded: a built-in offers exactly the versions `list()` returned,
 * and a driver that selects a NEW built-in instance expects that version to be pinned.
 */
export async function offeredBuiltin(window, id) {
  await chooseEntry(window, id);
  await T(window, "graph-library-versions").waitFor();
  const rows = await offeredVersions(window);
  assert.ok(rows.length > 0, `built-in ${id} offers no version`);
  const checked = rows.filter((row) => row.checked);
  assert.equal(checked.length, 1, `exactly one offered version of ${id} is selected by default`);
  assert.equal(
    (await T(window, "graph-library-entry").innerText()).endsWith("Built-in") ||
      (await T(window, "graph-library-entry").innerText()).endsWith("内置"),
    true,
    `${id} is labelled Built-in`,
  );
  await openAdvanced(window);
  const digest = (await T(window, "graph-library-digest").innerText()).trim();
  assert.match(digest, /^[a-f0-9]{64}$/);
  return { id, version: checked[0].version, digest, versions: rows.map((row) => row.version) };
}

/** What a run of a built-in pinned must equal: the version and digest the dialog showed. */
export function assertPinnedToOffered(template, offered) {
  assert.equal(template.id, offered.id);
  assert.equal(template.version, offered.version, "the instance pins the offered version");
  assert.equal(template.digest, offered.digest, "the instance pins the offered definition");
}
