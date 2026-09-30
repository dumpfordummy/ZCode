// UX-M3.3 Windows acceptance: Open in Runs and the honest historical pin. The historical runs are REAL
// cancelled runs whose captured workflow pin is rewritten on disk to built-in version 1 (a digest the
// library never published) while the app is closed, exactly like `ux-m3-launch-manual.mjs --historical-run`.
// If the app refuses the rewritten record the check is reported BLOCKED; validation is never weakened.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { root } from "./isolation.mjs";
import {
  T,
  assertFactsUnchanged,
  cancelRun,
  chooseEntry,
  closeLibrary,
  duplicateWorkflow,
  finishReceipt,
  launchUx,
  libraryFacts,
  observe,
  openAdvanced,
  openLibrary,
  readGraphRecord,
  readLibrary,
  shot,
  startFromNewRun,
  step,
  versionRows,
} from "./ux-m3-native-common.mjs";

const HISTORICAL_DIGEST = "e".repeat(64);

export async function pinsJourney() {
  const ctx = await launchUx("pins", { dialog: true, scenario: "pass" });
  const { isolation, receipt } = ctx;
  let window = ctx.window;
  let error;
  let mine;
  const runs = [];
  try {
    await step(
      receipt,
      "P0",
      "Open in Runs opens Runs -> New run with exactly the chosen workflow and version; it reviews and starts nothing",
      async () => {
        await openLibrary(window);
        mine = await duplicateWorkflow(window, isolation, "generic", "Pins flow");
        await chooseEntry(window, mine.id);
        const before = await libraryFacts(isolation);
        await T(window, "graph-library-open-runs").click();
        await T(window, "graph-new-run-pane").waitFor();
        await window.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        const line = await T(window, "graph-new-run-version-line").innerText();
        observe(receipt, "New run version line (Yours)", line);
        assert.match(line, /Pins flow · Version 1 · Yours/);
        assert.equal(await T(window, "graph-run-confirmation").count(), 0, "nothing was reviewed");
        assertFactsUnchanged(before, await libraryFacts(isolation), "Open in Runs");
        // a built-in: the line names the version the dialog offered
        await openLibrary(window);
        await chooseEntry(window, "generic");
        const offered = (await versionRows(window)).find((row) => row.checked).version;
        await T(window, "graph-library-open-runs").click();
        await T(window, "graph-new-run-pane").waitFor();
        const builtinLine = await T(window, "graph-new-run-version-line").innerText();
        observe(receipt, "New run version line (Built-in)", builtinLine);
        assert.match(builtinLine, new RegExp(`Version ${offered} · Built-in`));
        assert.equal(await T(window, "graph-run-confirmation").count(), 0);
        assert.equal((await libraryFacts(isolation)).snapshot.runCount, 0, "no run was admitted");
        await shot(isolation, window, receipt, "p-open-in-runs", [1280, 720]);
      },
    );

    await step(
      receipt,
      "P1",
      "Two real runs are started and stopped with Cancel (they become the historical runs)",
      async () => {
        for (let index = 0; index < 2; index += 1) {
          const run = await startFromNewRun(isolation, window);
          runs.push(run.id);
          await cancelRun(isolation, window, run.id);
        }
        assert.equal((await readGraphRecord(isolation)).runs.length, 2);
      },
    );

    await step(
      receipt,
      "P2",
      "Rewrite the captured pins on disk (app closed) to built-in version 1; relaunch; the app accepts the records",
      async () => {
        await isolation.stopApp();
        const file = acceptancePaths(isolation).record;
        const record = JSON.parse(await readFile(file, "utf8"));
        // The Host requires a run's frozen provenance to equal its definition's template byte for byte
        // ("Template run must preserve its exact frozen provenance."). Rewriting only the definition is
        // REJECTED by that validation (first attempt, kept in the report); a coherent record, as an older
        // build would have stored it, changes both copies identically.
        const pins = record.runs.map((run) => {
          const template = run.definition.template;
          const from = { version: template.version, digest: template.digest };
          for (const copy of [run.definition.template, run.provenance.template]) {
            copy.version = 1;
            copy.digest = HISTORICAL_DIGEST;
          }
          return { id: run.id, workflow: template.id, from };
        });
        // the first run also carries a value the offered version does not declare: it must be LISTED as not carried
        for (const copy of [record.runs[0].definition.template, record.runs[0].provenance.template])
          copy.parameters.legacyNote = "Captured by the old version only";
        // the second run's captured form never had check bindings: a required value that stays missing
        for (const copy of [record.runs[1].definition.template, record.runs[1].provenance.template])
          copy.bindings.recipes = {};
        observe(receipt, "rewritten pins", pins);
        await writeFile(file, JSON.stringify(record, null, 2));
        window = await isolation.launch({
          bootstrapEntry: path.join(root, "scripts/graph-engineering/ux-m1-native-bootstrap.cjs"),
        });
        if (!(await T(window, "graph-engineering-panel").isVisible()))
          await T(window, "graph-engineering-open").click();
        await T(window, "graph-view-runs").click();
        await window
          .locator(`[data-testid="graph-run"][data-run-id="${runs[0]}"]`)
          .waitFor({ timeout: 30000 });
      },
    );

    let frozen;
    await step(
      receipt,
      "P3",
      "Run again on built-in v1 (no longer offered): notice, no silent v1->v2, no other form, nothing synthesized",
      async () => {
        frozen = JSON.stringify(await readGraphRecord(isolation));
        const libraryBefore = await libraryFacts(isolation).catch(() => null);
        await window.locator(`[data-testid="graph-run"][data-run-id="${runs[0]}"]`).click();
        await T(window, "graph-run-again").click();
        await T(window, "graph-historical-pin").waitFor({ timeout: 20000 });
        const notice = (await T(window, "graph-historical-pin").innerText()).replace(/\s+/g, " ");
        observe(receipt, "historical pin notice", notice);
        assert.match(
          notice,
          /Version 1 used by this run is no longer offered\. Version \d+ is available\./,
        );
        assert.equal(
          await T(window, "graph-template-parameter-request").count(),
          0,
          "no form of another version is shown",
        );
        assert.equal(
          (await T(window, "graph-review-run").count()) === 0 ||
            (await T(window, "graph-review-run").isDisabled()),
          true,
          "Review is unavailable",
        );
        assert.equal(await T(window, "graph-run-confirmation").count(), 0);
        await shot(isolation, window, receipt, "p-historical-pin-notice", [1280, 720]);
        await shot(isolation, window, receipt, "p-historical-pin-notice", [1920, 1080]);
        // the library offers no built-in v1 and was not changed
        await openLibrary(window);
        await chooseEntry(window, "generic");
        assert.ok(
          !(await versionRows(window)).some((row) => row.version === 1),
          "built-in v1 is not synthesized",
        );
        await closeLibrary(window);
        if (libraryBefore)
          assert.equal((await libraryFacts(isolation)).library, libraryBefore.library);
        assert.equal(
          JSON.stringify(await readGraphRecord(isolation)),
          frozen,
          "the historical records are untouched",
        );
      },
    );

    await step(
      receipt,
      "P4",
      "Continue with the offered version carries only compatible values and lists the rest; the run stays untouched",
      async () => {
        // P3 looked at the library (Workflows); come back to the New-run pane, where the seeded draft still waits.
        await T(window, "graph-view-runs").click();
        await T(window, "graph-new-run").click();
        await T(window, "graph-historical-pin").waitFor({ timeout: 20000 });
        await T(window, "graph-historical-pin-continue").click();
        await T(window, "graph-template-parameter-request").waitFor({ timeout: 20000 });
        const request = await T(window, "graph-template-parameter-request").inputValue();
        observe(receipt, "carried request", request);
        assert.match(request, /Modify zz-demo\.txt file content to after/);
        await T(window, "graph-carry-report").waitFor();
        const carried = (
          await T(window, "graph-carry-carried")
            .innerText()
            .catch(() => "")
        ).replace(/\s+/g, " ");
        const not = (
          await T(window, "graph-carry-not-carried")
            .innerText()
            .catch(() => "")
        ).replace(/\s+/g, " ");
        observe(receipt, "carried / not carried (run 1)", { carried, not });
        assert.match(carried, /request/);
        assert.match(not, /legacyNote/, "the unmatched value is listed, not silently dropped");
        await shot(isolation, window, receipt, "p-carry-report", [1280, 720]);
        assert.equal(
          JSON.stringify(await readGraphRecord(isolation)),
          frozen,
          "no record changed by continuing",
        );
        assert.equal((await readGraphRecord(isolation)).runs.length, 2, "no run was started");
      },
    );

    await step(
      receipt,
      "P5",
      "A required value the old form never had stays missing: Review is blocked and the field is named",
      async () => {
        await T(window, "graph-view-runs").click();
        await window.locator(`[data-testid="graph-run"][data-run-id="${runs[1]}"]`).click();
        await T(window, "graph-run-again").click();
        await T(window, "graph-historical-pin").waitFor({ timeout: 20000 });
        await T(window, "graph-historical-pin-continue").click();
        await T(window, "graph-template-parameter-request").waitFor({ timeout: 20000 });
        const not = (
          await T(window, "graph-carry-not-carried")
            .innerText()
            .catch(() => "")
        ).replace(/\s+/g, " ");
        observe(receipt, "not carried (run 2)", not);
        assert.equal(
          await T(window, "graph-review-run").isDisabled(),
          true,
          "Review stays blocked",
        );
        const unresolved = (
          await T(window, "graph-template-unresolved")
            .innerText()
            .catch(() => "")
        ).replace(/\s+/g, " ");
        observe(receipt, "unresolved list", unresolved);
        assert.ok(unresolved.length > 0, "the missing required value is named");
        await shot(isolation, window, receipt, "p-carry-missing-required", [1280, 720]);
        assert.equal(
          JSON.stringify(await readGraphRecord(isolation)),
          frozen,
          "the historical runs, definitions and evidence are unchanged",
        );
        assert.equal(
          (await readLibrary(isolation)).entries.some((entry) => entry.id === "generic"),
          false,
          "no built-in entry was written to the library file",
        );
        await openAdvanced(window).catch(() => {});
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
