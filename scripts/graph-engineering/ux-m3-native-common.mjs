// UX-M3 Windows acceptance: shared pieces of the native journeys. Real Electron app, real Graph Host,
// the real library file store (`workflow-library.json`), real native sessions, a loopback controlled
// provider and a disposable workspace. Builds on the UX-M1 / UX-M2 native harness.
import assert from "node:assert/strict";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";
import {
  T,
  driveOsDialog,
  flush,
  launchUx as launchM2,
  pickRecipe,
  readGraphRecord,
  snapshot,
  waitRecord,
} from "./ux-m2-native-common.mjs";
import { selectValue } from "./z2-native-helpers.mjs";

export * from "./ux-m2-native-common.mjs";
export { selectValue };

/** Launch as UX-M2 does; raw evidence goes to the gitignored `.tmp/m3-evidence`. */
export async function launchUx(journey, options = {}) {
  const launched = await launchM2(journey, options);
  await rm(launched.receipt.evidenceDir, { recursive: true, force: true });
  launched.receipt.evidenceDir = path.join(
    root,
    ".tmp/m3-evidence",
    `${journey}-${path.basename(launched.isolation.home)}`,
  );
  await mkdir(launched.receipt.evidenceDir, { recursive: true });
  return launched;
}

export const libraryPath = (isolation) =>
  path.join(isolation.home, "data/.zcode/v2/graph-engineering/workflow-library.json");
// The library file is created by the first mutation; before that "no file" is the fact to compare.
export const libraryBytes = (isolation) =>
  readFile(libraryPath(isolation)).catch((error) => {
    if (error.code === "ENOENT") return Buffer.from("(no library file yet)");
    throw error;
  });
export const readLibrary = async (isolation) => {
  const bytes = await libraryBytes(isolation);
  return bytes.toString().startsWith("(no library")
    ? { entries: [] }
    : JSON.parse(bytes.toString("utf8"));
};

/** Workflows -> Workflow library (the one dialog). */
export async function openLibrary(window) {
  if (!(await T(window, "graph-engineering-panel").isVisible()))
    await T(window, "graph-engineering-open").click();
  await T(window, "graph-view-design").click();
  await T(window, "graph-library-open").click();
  await T(window, "graph-library-versions").waitFor({ timeout: 30000 });
  await flush(window);
}
export async function closeLibrary(window) {
  await window.keyboard.press("Escape");
  await T(window, "graph-library-dialog").waitFor({ state: "hidden" });
}
/** UX-M4: Versions / Use / Share / Advanced are single-level tabs (panels stay mounted, hidden when inactive). */
export const openTab = (window, name) => T(window, `graph-library-tab-${name}`).click();
export const openVersions = (window) => openTab(window, "versions");
export const openUse = (window) => openTab(window, "use");
export const openShare = (window) => openTab(window, "share");
export const openAdvanced = (window) => openTab(window, "advanced");

export const versionRows = (window) =>
  window.locator('[data-testid="graph-library-version-row"]').evaluateAll((rows) =>
    rows.map((row) => ({
      version: Number(row.getAttribute("data-version")),
      latest: row.getAttribute("data-latest") === "true",
      used: row.getAttribute("data-used") === "true",
      checked: row.querySelector("input").checked,
      text: row.innerText.replace(/\s+/g, " ").trim(),
    })),
  );
export const chooseEntry = (window, id) => selectValue(window, "graph-library-entry", id);
export const chooseVersion = async (window, version) => {
  await openVersions(window);
  await window
    .locator(`[data-testid="graph-library-version-row"][data-version="${version}"] input`)
    .check();
};

/** What the Host and the user's files hold, compared before and after a refused or read-only action. */
export async function libraryFacts(isolation) {
  const record = await readGraphRecord(isolation).catch(() => null);
  return {
    library: (await libraryBytes(isolation)).toString("base64"),
    record: JSON.stringify(record),
    snapshot: await snapshot(isolation),
  };
}
export function assertFactsUnchanged(before, after, what) {
  assert.equal(after.library, before.library, `${what}: the library file is byte-identical`);
  assert.equal(after.record, before.record, `${what}: the Graph record is byte-identical`);
  assert.equal(after.snapshot.runCount, before.snapshot.runCount, `${what}: no run`);
  assert.deepEqual(after.snapshot.ledger, before.snapshot.ledger, `${what}: no native input`);
  assert.equal(after.snapshot.models, before.snapshot.models, `${what}: no model request`);
}

/** Duplicate a workflow (built-in: "Duplicate to edit") from the open dialog; returns the new entry id. */
export async function duplicateWorkflow(window, isolation, sourceId, name) {
  await chooseEntry(window, sourceId);
  await openVersions(window);
  const before = new Set((await readLibrary(isolation)).entries.map((entry) => entry.id));
  await T(window, "graph-library-duplicate-name").fill(name);
  await T(window, "graph-library-duplicate").click();
  await T(window, "graph-library-result").waitFor({ timeout: 30000 });
  const created = (await readLibrary(isolation)).entries.find((entry) => !before.has(entry.id));
  assert.ok(created, "the library file holds the duplicate");
  return created;
}

/** New run with the chosen workflow, then "Save as workflow only": pins the design to that workflow and version. */
export async function pinDesign(window, isolation, entryId, { version, request } = {}) {
  await T(window, "graph-view-runs").click();
  await T(window, "graph-new-run").click();
  await T(window, "graph-template-parameter-request").waitFor();
  await chooseEntry(window, entryId);
  if (version !== undefined)
    await selectValue(window, "graph-new-run-version-select", String(version));
  await T(window, "graph-template-parameter-request").fill(
    request ?? "Modify zz-demo.txt file content to after",
  );
  if (await T(window, "graph-template-recipe-build").count()) {
    await pickRecipe(window, "graph-template-recipe-build", "reviewer-build");
    await pickRecipe(window, "graph-template-recipe-test", "reviewer-test");
  }
  await T(window, "graph-library-instantiate").click();
  // A design with unsaved edits asks before it is replaced (the explicit replace dialog): discard them.
  const outcome = await Promise.race([
    T(window, "graph-replace-dialog")
      .waitFor({ timeout: 30000 })
      .then(() => "replace"),
    waitRecord(
      isolation,
      (record) => record.definition?.template?.id === entryId,
      "the design to be pinned",
      30000,
    ).then(() => "pinned"),
  ]);
  if (outcome === "replace") await T(window, "graph-replace-discard").click();
  await T(window, "graph-view-design").click();
  await T(window, "graph-design-origin").waitFor({ timeout: 30000 });
}

/** Rename helper for evidence: an external edit of the library file that keeps it valid. */
export async function externalLibraryChange(isolation) {
  const file = libraryPath(isolation);
  const library = JSON.parse(await readFile(file, "utf8"));
  const source = library.entries.find((entry) => !entry.builtin) ?? library.entries[0];
  const clone = structuredClone(source);
  clone.id = `external-${Date.now()}`;
  clone.name = "Added outside the app";
  library.entries.push(clone);
  // The store's revision is a counter inside the file: another writer bumps it, which the app must detect.
  library.revision += 1;
  await writeFile(file, JSON.stringify(library, null, 2));
  return clone;
}
export { driveOsDialog, rename };
