// UX-M3.2 Windows acceptance: Save current design, Export and Import as separate tasks over the REAL
// library file, the REAL Windows Save and Open dialogs (driven through UI Automation, no controlled
// dialog intent), and a real library revision conflict made by editing the library file on disk.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  T,
  chooseEntry,
  chooseVersion,
  closeLibrary,
  driveOsDialog,
  duplicateWorkflow,
  externalLibraryChange,
  finishReceipt,
  launchUx,
  libraryBytes,
  observe,
  openAdvanced,
  openLibrary,
  openShare,
  pinDesign,
  readLibrary,
  selectValue,
  shot,
  step,
  versionRows,
} from "./ux-m3-native-common.mjs";

const sameBytes = async (isolation, before, what) =>
  assert.equal(
    (await libraryBytes(isolation)).toString("base64"),
    before,
    `${what}: library file unchanged`,
  );
const snap = async (isolation) => (await libraryBytes(isolation)).toString("base64");
const entryOf = async (isolation, id) =>
  (await readLibrary(isolation)).entries.find((entry) => entry.id === id);

export async function shareJourney() {
  const { isolation, window, receipt } = await launchUx("share", {
    dialog: true,
    scenario: "pass",
  });
  const home = path.join(isolation.home, "home");
  let error;
  let mine;
  let exported;
  try {
    await step(
      receipt,
      "S0",
      "A Yours workflow with one version, pinned as the current design",
      async () => {
        await openLibrary(window);
        mine = await duplicateWorkflow(window, isolation, "generic", "Share flow");
        await closeLibrary(window);
        await pinDesign(window, isolation, mine.id);
      },
    );

    await step(
      receipt,
      "S1",
      "Save current design: default target, unsaved edits and renames disclosed BEFORE confirming; preview mutates nothing",
      async () => {
        await T(window, "graph-name").fill("Edited on the canvas");
        const before = await snap(isolation);
        await openLibrary(window);
        await chooseEntry(window, "generic"); // the dropdown points elsewhere; it is not the target
        await openShare(window);
        assert.equal(await T(window, "graph-save-target").innerText(), "New version of Share flow");
        assert.equal(
          await T(window, "graph-save-unsaved").innerText(),
          "This version includes your current unsaved design edits.",
        );
        await selectValue(window, "graph-save-target", "new");
        assert.equal(
          await T(window, "graph-save-unsaved").innerText(),
          "This workflow includes your current unsaved design edits.",
        );
        await selectValue(window, "graph-save-target", `version:${mine.id}`);
        assert.equal(
          await T(window, "graph-library-name").inputValue(),
          "Share flow",
          "an untouched form keeps the target's name",
        );
        await T(window, "graph-library-name").fill("Renamed on save");
        await T(window, "graph-library-capture").click();
        await T(window, "graph-save-preview-result").waitFor();
        await T(window, "graph-save-reviewed").click();
        const rename = await T(window, "graph-save-rename").innerText();
        observe(receipt, "rename disclosure", rename);
        assert.match(rename, /renamed from “Share flow” to “Renamed on save”/);
        await sameBytes(isolation, before, "preview and disclosure");
        await shot(isolation, window, receipt, "s-save-disclosures", [1280, 720]);
        await T(window, "graph-library-name").fill("Share flow"); // editing invalidates the review
        assert.equal(await T(window, "graph-save-confirm").isDisabled(), true);
        await T(window, "graph-library-capture").click();
        await T(window, "graph-save-reviewed").click();
        assert.equal(await T(window, "graph-save-rename").count(), 0, "no rename to disclose now");
        await T(window, "graph-save-confirm").click();
        await T(window, "graph-library-result").waitFor({ timeout: 30000 });
        assert.equal(
          await T(window, "graph-library-result").innerText(),
          "Saved: Share flow · Version 2 is now selected.",
        );
        const saved = await entryOf(isolation, mine.id);
        assert.deepEqual(
          saved.versions.map((version) => version.version),
          [1, 2],
        );
        assert.equal(saved.name, "Share flow");
        assert.deepEqual(
          (await versionRows(window)).map((row) => [row.version, row.checked]),
          [
            [2, true],
            [1, false],
          ],
        );
      },
    );

    await step(
      receipt,
      "S2",
      "A design from a built-in: built-ins take no versions; Duplicate to edit selects the copy",
      async () => {
        await closeLibrary(window);
        await pinDesign(window, isolation, "generic");
        await openLibrary(window);
        await openShare(window);
        await T(window, "graph-save-builtin-origin").waitFor();
        assert.equal(await T(window, "graph-save-target").innerText(), "A new workflow");
        assert.equal(await T(window, "graph-library-archive").isDisabled(), true);
        assert.equal(await T(window, "graph-library-duplicate").innerText(), "Duplicate to edit");
        await closeLibrary(window);
      },
    );

    await step(
      receipt,
      "S3",
      "Export: exact workflow and version, the real Windows Save dialog, cancel is neither success nor failure",
      async () => {
        await openLibrary(window);
        await chooseEntry(window, mine.id);
        await chooseVersion(window, 1);
        await openShare(window);
        assert.equal(await T(window, "graph-export-subject").innerText(), "Share flow · Version 1");
        await T(window, "graph-library-export").click();
        await T(window, "graph-export-preview-result").waitFor();
        const shown = await T(window, "graph-export-json").inputValue();
        assert.ok(
          !shown.includes("Edited on the canvas") && !shown.includes(isolation.workspace),
          "no canvas, no local path",
        );
        await T(window, "graph-export-reviewed").click();
        const before = await snap(isolation);
        await T(window, "graph-template-export-file").click();
        const cancelled = await driveOsDialog(isolation, "cancel");
        observe(receipt, "the real Save dialog (cancelled)", {
          title: cancelled.title,
          className: cancelled.className,
        });
        assert.equal(cancelled.ok, true);
        await window.waitForFunction(
          () => !document.querySelector('[data-testid="graph-template-file-saved"]'),
        );
        assert.equal(
          await T(window, "graph-export-file-error").count(),
          0,
          "cancel is not a failure",
        );
        exported = path.join(home, "Documents", "share-flow-v1.zcode-workflow.json");
        await T(window, "graph-template-export-file").click();
        const saved = await driveOsDialog(isolation, "select", exported);
        observe(receipt, "the real Save dialog", {
          title: saved.title,
          className: saved.className,
        });
        assert.equal(saved.ok, true);
        await T(window, "graph-template-file-saved").waitFor({ timeout: 20000 });
        assert.equal(
          await T(window, "graph-template-file-saved").innerText(),
          "Saved Share flow · Version 1 to a file.",
        );
        assert.equal(
          await readFile(exported, "utf8"),
          shown,
          "the file is exactly the reviewed JSON",
        );
        await sameBytes(isolation, before, "export");
        await shot(isolation, window, receipt, "s-export-saved", [1280, 720]);
      },
    );

    await step(
      receipt,
      "S4",
      "Import through the real Windows Open dialog: choose and preview mutate nothing; saving is explicit",
      async () => {
        const before = await snap(isolation);
        await T(window, "graph-template-import-file").click();
        const opened = await driveOsDialog(isolation, "select", exported);
        observe(receipt, "the real Open dialog", {
          title: opened.title,
          className: opened.className,
        });
        assert.equal(opened.ok, true);
        await T(window, "graph-import-preview-result").waitFor({ timeout: 20000 });
        await sameBytes(isolation, before, "choose and preview");
        assert.equal(await T(window, "graph-import-confirm").isDisabled(), true, "review first");
        assert.equal(await T(window, "graph-import-target").innerText(), "A new workflow");
        await T(window, "graph-import-reviewed").click();
        assert.match(
          await T(window, "graph-import-summary").innerText(),
          /creates a new workflow named “Share flow”/,
        );
        await shot(isolation, window, receipt, "s-import-preview", [1280, 720]);
        await T(window, "graph-import-confirm").click();
        await T(window, "graph-library-result").waitFor({ timeout: 30000 });
        assert.equal(
          await T(window, "graph-library-result").innerText(),
          "Saved: Share flow · Version 1 is now selected.",
        );
        const library = await readLibrary(isolation);
        assert.equal(
          library.entries.filter((entry) => entry.name === "Share flow").length,
          2,
          "an explicit save created the imported workflow",
        );
      },
    );

    await step(
      receipt,
      "S5",
      "Bad files through the real Open dialog: not JSON, unsupported, secret, private path, over 256 KB, not UTF-8; 256 KB limit unchanged",
      async () => {
        const good = JSON.parse(await readFile(exported, "utf8"));
        const cases = {
          "not-json.json": Buffer.from("{ not json"),
          "unsupported.json": Buffer.from(JSON.stringify({ ...good, version: 99 })),
          "secret.json": Buffer.from(
            JSON.stringify({ ...good, description: "api_key=SYNTHETIC_SECRET_NEVER_EXPORT" }),
          ),
          "private-path.json": Buffer.from(
            JSON.stringify({ ...good, description: "C:\\Users\\PrivateFixture\\confidential.txt" }),
          ),
          "too-large.json": Buffer.from(
            JSON.stringify({ ...good, description: "x".repeat(300 * 1024) }),
          ),
          "not-utf8.json": Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]),
        };
        const before = await snap(isolation);
        for (const [name, bytes] of Object.entries(cases)) {
          const file = path.join(home, "Documents", name);
          await writeFile(file, bytes);
          // Reopen the dialog so the previous case's preview cannot be mistaken for this one's.
          await closeLibrary(window);
          await openLibrary(window);
          await openShare(window);
          assert.equal(
            await T(window, "graph-import-preview-result").count(),
            0,
            `${name}: starts without a preview`,
          );
          await T(window, "graph-template-import-file").click();
          assert.equal((await driveOsDialog(isolation, "select", file)).ok, true);
          const alert = window
            .locator('[data-testid="graph-library-dialog"] [role="alert"]')
            .first();
          await alert.waitFor({ timeout: 20000 });
          const text = (await alert.innerText()).replace(/\s+/g, " ").trim();
          observe(receipt, `bad file ${name}`, text);
          const expected = {
            "not-json.json": /JSON|property name/i,
            "unsupported.json": /version|expected 1/i,
            "secret.json": /secret or private absolute path/i,
            "private-path.json": /secret or private absolute path/i,
            "too-large.json": /256 KB/,
            "not-utf8.json": /UTF-8|utf/i,
          }[name];
          assert.match(text, expected, `${name}: its own error, not another file's`);
          assert.equal(
            await T(window, "graph-import-confirm")
              .isDisabled()
              .catch(() => true),
            true,
            `${name}: cannot be saved`,
          );
          assert.equal(
            await T(window, "graph-import-reviewed").count(),
            0,
            `${name}: no review gate for an invalid file`,
          );
          await sameBytes(isolation, before, name);
        }
      },
    );

    await step(
      receipt,
      "S6",
      "A real library revision conflict: Refresh beside the error, the reviewed preview survives, the explicit retry succeeds",
      async () => {
        await openAdvanced(window);
        const template = JSON.parse(await readFile(exported, "utf8"));
        template.name = "Conflict retry flow";
        await T(window, "graph-manual-json").fill(JSON.stringify(template));
        await T(window, "graph-manual-preview").click();
        await T(window, "graph-manual-reviewed").click();
        await externalLibraryChange(isolation);
        const afterExternal = await snap(isolation);
        await T(window, "graph-manual-confirm").click();
        await T(window, "graph-library-error").waitFor({ timeout: 20000 });
        const text = await T(window, "graph-library-error").innerText();
        observe(receipt, "library conflict", text);
        assert.match(text, /revision changed; refresh before saving/);
        assert.equal(
          await T(window, "graph-library-error-refresh").isVisible(),
          true,
          "Refresh sits beside the error",
        );
        await sameBytes(
          isolation,
          afterExternal,
          "the refused save did not overwrite the external edit",
        );
        // Where is the error relative to the button the user just pressed? (recorded, not asserted)
        const position = await window.evaluate(() => {
          const box = (id) =>
            document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
          const error = box("graph-library-error");
          const confirm = box("graph-manual-confirm");
          return {
            errorInViewport: Boolean(error && error.top >= 0 && error.bottom <= innerHeight),
            confirmInViewport: Boolean(
              confirm && confirm.top >= 0 && confirm.bottom <= innerHeight,
            ),
          };
        });
        observe(
          receipt,
          "conflict error versus the pressed Save button (viewport 1280x720)",
          position,
        );
        await shot(isolation, window, receipt, "s-library-conflict-at-save", [1280, 720]);
        await T(window, "graph-library-error").scrollIntoViewIfNeeded();
        await shot(isolation, window, receipt, "s-library-conflict-error", [1280, 720]);
        await T(window, "graph-library-error-refresh").click();
        await window.waitForFunction(
          () => !document.querySelector('[data-testid="graph-library-error"]'),
        );
        assert.equal(
          await T(window, "graph-manual-reviewed").isChecked(),
          true,
          "the reviewed preview survives",
        );
        await T(window, "graph-manual-confirm").click();
        await T(window, "graph-library-result").waitFor({ timeout: 30000 });
        const library = await readLibrary(isolation);
        assert.ok(library.entries.some((entry) => entry.name === "Conflict retry flow"));
        assert.ok(
          library.entries.some((entry) => entry.name === "Added outside the app"),
          "the external edit was kept",
        );
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
