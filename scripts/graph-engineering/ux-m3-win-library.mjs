// UX-M3.1 Windows acceptance: one library dialog, Built-in versus Yours, version rows from facts,
// "Used by current design", the New-run and Workflows version lines, and the read-only behavior
// while a REAL native run owns the workspace. Real library file, real Host, real permissions.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  T,
  driveOsDialog,
  assertFactsUnchanged,
  cancelRun,
  chooseEntry,
  chooseVersion,
  closeLibrary,
  duplicateWorkflow,
  finishReceipt,
  invokeHandler,
  launchUx,
  libraryFacts,
  observe,
  openAdvanced,
  openLibrary,
  openShare,
  pendingPermission,
  pinDesign,
  readGraphRecord,
  readLibrary,
  shot,
  startFromNewRun,
  step,
  versionRows,
  waitRecord,
} from "./ux-m3-native-common.mjs";

const optionTexts = async (window, testId) => {
  await T(window, testId).click();
  const labels = await window
    .locator("[role=option][data-value]")
    .evaluateAll((items) => items.map((item) => item.innerText.trim()));
  await window.keyboard.press("Escape");
  return labels;
};

export async function libraryJourney() {
  const { isolation, window, receipt } = await launchUx("library", {
    dialog: true,
    scenario: "pass",
  });
  let error;
  let mine;
  try {
    await step(
      receipt,
      "L0",
      "One dialog, five sections, no nested management modal; Built-in versus Yours",
      async () => {
        await openLibrary(window);
        assert.equal(
          await window.locator('[role="dialog"]:visible').count(),
          1,
          "exactly one dialog",
        );
        assert.equal(
          await T(window, "graph-library-manage").count(),
          0,
          "no nested management control",
        );
        for (const id of [
          "graph-library-entry",
          "graph-library-versions",
          "graph-library-instantiate",
          "graph-library-share",
          "graph-library-advanced",
        ])
          assert.equal(await T(window, id).count(), 1, `${id} is in the one dialog`);
        const labels = await optionTexts(window, "graph-library-entry");
        observe(receipt, "workflow options", labels);
        assert.ok(
          labels.length > 0 && labels.every((label) => label.endsWith("Built-in")),
          "before any user workflow every option says Built-in",
        );
        await chooseEntry(window, "generic");
        const rows = await versionRows(window);
        observe(receipt, "built-in generic version rows", rows);
        assert.ok(rows.length >= 1 && rows.filter((row) => row.checked).length === 1);
        assert.ok(
          rows.every((row) => /^Version \d+/.test(row.text)),
          "rows read Version N",
        );
        assert.ok(
          !rows.some((row) => /\b(19|20)\d\d\b|\d+\/\d+\/\d+/.test(row.text)),
          "no invented date on a built-in",
        );
        assert.equal(
          rows.filter((row) => row.latest).length,
          rows.length > 1 ? 1 : 0,
          "Latest only when several are offered",
        );
        assert.equal(await T(window, "graph-library-archive").isDisabled(), true);
        assert.equal(await T(window, "graph-library-duplicate").innerText(), "Duplicate to edit");
        await openAdvanced(window);
        assert.match(
          (await T(window, "graph-library-digest").innerText()).trim(),
          /^[a-f0-9]{64}$/,
          "digest lives in Advanced",
        );
        await shot(isolation, window, receipt, "l-dialog-builtin", [1280, 720]);
      },
    );

    await step(
      receipt,
      "L0b",
      "Every built-in offers its real, exact version set (read from what the Host offers; never a constant)",
      async () => {
        await T(window, "graph-library-entry").click();
        const ids = await window
          .locator("[role=option][data-value]")
          .evaluateAll((items) => items.map((item) => item.getAttribute("data-value")));
        await window.keyboard.press("Escape");
        const offered = {};
        for (const id of ids) {
          await chooseEntry(window, id);
          const rows = await versionRows(window);
          assert.ok(rows.length >= 1, `${id} offers a version`);
          assert.equal(
            rows.filter((row) => row.checked).length,
            1,
            `${id}: exactly one row is selected`,
          );
          assert.deepEqual(
            rows.map((row) => row.version),
            rows.map((row) => row.version).sort((a, b) => b - a),
            `${id}: newest first`,
          );
          // workflow-service.ts publishes every built-in at BUILTIN_TEMPLATE_VERSION = 2 (one version each):
          // version 1 is not offered and not synthesized. The set is asserted as a whole, not per driver.
          assert.deepEqual(
            rows.map((row) => row.version),
            [2],
            `${id}: offers exactly its published version`,
          );
          offered[id] = rows.map((row) => row.version);
        }
        observe(receipt, "offered versions per built-in", offered);
      },
    );

    await step(
      receipt,
      "L1",
      "Duplicate to edit creates Yours; rows show a real date; the result is selected",
      async () => {
        mine = await duplicateWorkflow(window, isolation, "generic", "Windows team flow");
        assert.equal(
          await T(window, "graph-library-result").innerText(),
          "Saved: Windows team flow · Version 1 is now selected.",
        );
        const labels = await optionTexts(window, "graph-library-entry");
        assert.ok(
          labels.some((label) => label === "Windows team flow · Yours"),
          labels.join(" | "),
        );
        const rows = await versionRows(window);
        assert.deepEqual(
          rows.map((row) => [row.version, row.checked, row.latest]),
          [[1, true, false]],
        );
        assert.match(rows[0].text, /\d/, "a user-created version shows its date");
        observe(receipt, "user version row", rows[0].text);
        await closeLibrary(window);
      },
    );

    await step(
      receipt,
      "L2",
      "New run and Workflows name the workflow and version; Used by current design follows the pin",
      async () => {
        await pinDesign(window, isolation, mine.id);
        const pinned = (await readGraphRecord(isolation)).definition.template;
        assert.deepEqual([pinned.id, pinned.version], [mine.id, 1]);
        assert.equal(
          pinned.digest,
          (await readLibrary(isolation)).entries.find((entry) => entry.id === mine.id).versions[0]
            .digest,
        );
        const origin = await T(window, "graph-design-origin").innerText();
        observe(receipt, "Workflows origin line", origin);
        assert.match(origin, /Started from Windows team flow · Version 1/);
        await T(window, "graph-view-runs").click();
        await T(window, "graph-new-run").click();
        await chooseEntry(window, mine.id);
        const line = await T(window, "graph-new-run-version-line").innerText();
        observe(receipt, "New run version line", line);
        assert.match(line, /Windows team flow · Version 1 · Yours/);
        await openLibrary(window);
        await chooseEntry(window, mine.id);
        assert.deepEqual(
          (await versionRows(window)).map((row) => [row.version, row.used]),
          [[1, true]],
        );
        // a built-in is not "used by the current design"
        await chooseEntry(window, "generic");
        assert.ok(
          (await versionRows(window)).every((row) => !row.used),
          "no built-in row claims the pin",
        );
        await shot(isolation, window, receipt, "l-dialog-used-by", [1280, 720]);
      },
    );

    await step(
      receipt,
      "L3",
      "A second version: Latest appears, Used by current design stays on the pinned version",
      async () => {
        await chooseEntry(window, mine.id);
        await openShare(window);
        assert.equal(
          await T(window, "graph-save-target").innerText(),
          "New version of Windows team flow",
        );
        await T(window, "graph-library-capture").click();
        await T(window, "graph-save-reviewed").waitFor();
        await T(window, "graph-save-reviewed").click();
        await T(window, "graph-save-confirm").click();
        await T(window, "graph-library-result").waitFor({ timeout: 30000 });
        assert.equal(
          await T(window, "graph-library-result").innerText(),
          "Saved: Windows team flow · Version 2 is now selected.",
        );
        const rows = await versionRows(window);
        assert.deepEqual(
          rows.map((row) => [row.version, row.checked, row.latest, row.used]),
          [
            [2, true, true, false],
            [1, false, false, true],
          ],
        );
        assert.deepEqual(
          (await readLibrary(isolation)).entries
            .find((entry) => entry.id === mine.id)
            .versions.map((version) => version.version),
          [1, 2],
          "user-created versions are exactly 1 and 2 in the library file",
        );
        await closeLibrary(window);
      },
    );

    let runId;
    await step(
      receipt,
      "L4",
      "A real run owns the workspace: browse, versions, Advanced and previews work; every mutation and Export are refused",
      async () => {
        const run = await startFromNewRun(isolation, window);
        runId = run.id;
        await waitRecord(isolation, pendingPermission, "the run's native permission wait");
        await openLibrary(window);
        const blocked = await T(window, "graph-library-blocked").innerText();
        observe(receipt, "occupied banner", blocked);
        await T(window, "graph-library-view-current-run").waitFor();
        await chooseEntry(window, mine.id);
        await chooseVersion(window, 1);
        assert.equal(
          (await versionRows(window)).find((row) => row.checked).version,
          1,
          "versions are selectable while occupied",
        );
        await openAdvanced(window);
        assert.match(
          (await T(window, "graph-library-digest").innerText()).trim(),
          /^[a-f0-9]{64}$/,
        );
        await openShare(window);
        await T(window, "graph-library-export").click(); // export PREVIEW is pure
        await T(window, "graph-export-preview-result").waitFor();
        await T(window, "graph-export-reviewed").click();
        assert.equal(
          await T(window, "graph-template-export-file").isDisabled(),
          true,
          "Export to file is refused",
        );
        // Choosing and previewing an import file is allowed while occupied (real Open dialog); saving it is not.
        const portable = path.join(isolation.home, "home", "Documents", "occupied-import.json");
        await writeFile(portable, await T(window, "graph-export-json").inputValue());
        const beforePreview = await libraryFacts(isolation);
        await T(window, "graph-template-import-file").click();
        assert.equal((await driveOsDialog(isolation, "select", portable)).ok, true);
        await T(window, "graph-import-preview-result").waitFor({ timeout: 20000 });
        assertFactsUnchanged(
          beforePreview,
          await libraryFacts(isolation),
          "choose and preview an import while occupied",
        );
        await T(window, "graph-import-reviewed").click();
        const before = await libraryFacts(isolation);
        const present = [];
        for (const id of [
          "graph-library-instantiate",
          "graph-library-duplicate",
          "graph-library-archive",
          "graph-template-export-file",
          "graph-save-confirm",
          "graph-library-create",
          "graph-import-confirm",
          "graph-manual-confirm",
        ]) {
          const count = await T(window, id).count();
          if (!count) continue;
          present.push(id);
          assert.equal(await T(window, id).isDisabled(), true, `${id} is disabled`);
          assert.match(
            String(await T(window, id).getAttribute("aria-describedby")),
            /\S/,
            `${id} names its reason`,
          );
          assert.equal(
            await invokeHandler(window, id),
            "invoked",
            `${id} handler reached directly`,
          );
        }
        observe(receipt, "mutation controls present and refused while occupied", present);
        for (const required of [
          "graph-library-instantiate",
          "graph-library-duplicate",
          "graph-library-archive",
          "graph-template-export-file",
          "graph-import-confirm",
        ])
          assert.ok(present.includes(required), `${required} exists and was exercised`);
        assertFactsUnchanged(
          before,
          await libraryFacts(isolation),
          "refused mutations and Export while a run owns the workspace",
        );
        await shot(isolation, window, receipt, "l-dialog-occupied", [1280, 720]);
        await shot(isolation, window, receipt, "l-dialog-occupied", [1920, 1080]);
        // Open in Runs only navigates
        const beforeOpen = await libraryFacts(isolation);
        await T(window, "graph-library-open-runs").click();
        await T(window, "graph-new-run-pane").waitFor();
        assert.equal(await T(window, "graph-run-confirmation").count(), 0, "nothing was reviewed");
        assertFactsUnchanged(
          beforeOpen,
          await libraryFacts(isolation),
          "Open in Runs while occupied",
        );
      },
    );

    await step(
      receipt,
      "L5",
      "Cancel the run (cleanup); mutations are available again",
      async () => {
        await cancelRun(isolation, window, runId);
        await openLibrary(window);
        await chooseEntry(window, mine.id);
        await T(window, "graph-library-duplicate-name").fill("Copy after the run");
        assert.equal(await T(window, "graph-library-duplicate").isDisabled(), false);
        assert.equal(
          await T(window, "graph-library-blocked").count(),
          0,
          "the occupied banner is gone",
        );
        await closeLibrary(window);
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
