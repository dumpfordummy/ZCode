// UX-M1.4 journey B, second half: the first run resolves (a synthetic approval-decision test), nothing
// starts by itself, and only an explicit Review and Start admit the drafted request.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  REQUEST,
  SECOND_REQUEST,
  T,
  chipValue,
  observe,
  openNewRun,
  quietWindow,
  readGraphRecord as readGraphRecordNow,
  sha256,
  shotSizes,
  snapshot,
  step,
  waitRecord,
} from "./ux-m1-native-common.mjs";

/** `state` carries what the first half established: the first run id and the drafted context path. */
export async function resolveAndReview({ isolation, window, receipt }, { firstRunId, notesPath }) {
  const edited = `${SECOND_REQUEST} (edited during approval)`;
  let resolved;
  await step(
    receipt,
    "B7",
    "Resolve the first run through the real Graph approval (synthetic decision-handling test)",
    async () => {
      await T(window, "graph-needs-you-go").click();
      await T(window, "graph-run-summary").first().waitFor();
      await T(window, "graph-run-review-gate").click();
      await T(window, "graph-approval-request").waitFor();
      assert.equal(
        await T(window, "graph-approval-approve").isDisabled(),
        true,
        "typing is not a decision",
      );
      await T(window, "graph-approval-comment").fill(
        "Synthetic decision test: approve the frozen fixture evidence.",
      );
      await T(window, "graph-approval-approve").click();
      const { record } = await waitRecord(
        isolation,
        (item) => item.runs.at(-1).status === "Completed",
        "the first run to complete",
      );
      resolved = record.runs.at(-1);
      assert.equal(resolved.id, firstRunId);
      assert.equal(record.runs.length, 1);
    },
  );
  let afterResolution;
  await step(
    receipt,
    "B8",
    "After the first run resolves nothing starts or reviews; the draft is intact",
    async () => {
      await openNewRun(window);
      await T(window, "graph-review-run").waitFor();
      await window.waitForFunction(
        () => !document.querySelector('[data-testid="graph-review-run"]')?.disabled,
        undefined,
        { timeout: 30000 },
      );
      assert.equal(
        await T(window, "graph-new-run-blocked").count(),
        0,
        "the block is lifted by the Host projection",
      );
      assert.equal(await T(window, "graph-template-parameter-request").inputValue(), edited);
      assert.equal(await chipValue(window, "instructions"), notesPath);
      assert.match(await T(window, "graph-selected-checks-build").innerText(), /Alternate build/);
      afterResolution = await snapshot(isolation);
      assert.equal(
        await T(window, "graph-run-confirmation").count(),
        0,
        "no review was opened for the user",
      );
      await quietWindow(isolation, afterResolution, 1500, "after the first run resolved");
      assert.equal(await T(window, "graph-run-confirmation").count(), 0);
      observe(
        receipt,
        "quiet-window observation (1.5 s after the positive unblock event): no run, instantiate, input or model request",
      );
    },
  );
  let secondRun;
  await step(
    receipt,
    "B9",
    "Explicit Review gives a fresh preflight and an unticked acknowledgment",
    async () => {
      await T(window, "graph-review-run").click();
      await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
      assert.equal(await T(window, "graph-preflight-ack").getAttribute("aria-checked"), "false");
      assert.equal(await T(window, "graph-confirm-run").isDisabled(), true);
      assert.equal(await T(window, "graph-workflow-request").innerText(), edited);
      assert.match(await T(window, "graph-workflow-context").innerText(), /docs\/Notes\.md/);
      const checks = await T(window, "graph-workflow-checks").innerText();
      observe(receipt, "review lists checks", checks);
      assert.match(checks, /alt-build/);
      assert.match(checks, /alt-test/);
      assert.doesNotMatch(
        checks,
        /reviewer-(build|test)/,
        "the previous run's checks are not shown",
      );
      const record = await readGraphRecordNow(isolation);
      assert.equal(record.runs.length, 1, "review admits nothing");
      assert.equal(record.definition.template.parameters.request, edited);
      assert.equal(record.definition.template.bindings.references.instructions, notesPath);
      assert.deepEqual(record.definition.template.bindings.recipes, {
        build: "alt-build",
        test: "alt-test",
      });
      const models = (await snapshot(isolation)).models;
      assert.equal(models, afterResolution.models, "preflight sends no model request");
      await shotSizes(isolation, window, receipt, "b-fresh-review-unticked", () =>
        T(window, "graph-preflight-ack").scrollIntoViewIfNeeded(),
      );
    },
  );
  await step(
    receipt,
    "B10",
    "Explicit Start freezes the draft's context and checks into the second run",
    async () => {
      await T(window, "graph-preflight-ack").click();
      assert.equal(await T(window, "graph-preflight-ack").getAttribute("aria-checked"), "true");
      await T(window, "graph-confirm-run").click();
      const { record } = await waitRecord(
        isolation,
        (item) => item.runs.length === 2,
        "the second run",
      );
      secondRun = record.runs.at(-1);
      assert.equal(secondRun.definition.template.parameters.request, edited);
      assert.equal(secondRun.definition.template.bindings.references.instructions, notesPath);
      assert.deepEqual(secondRun.definition.template.bindings.recipes, {
        build: "alt-build",
        test: "alt-test",
      });
      const captured = JSON.stringify(secondRun.provenance);
      assert.ok(
        captured.includes(notesPath.replaceAll("\\", "\\\\")) || captured.includes(notesPath),
      );
      assert.ok(captured.includes("alt-build") && captured.includes("alt-test"));
      assert.equal(secondRun.provenance.operationalDecision.acknowledgedUnknowns, true);
      const reference = secondRun.provenance.references.find((item) => item.id === "instructions");
      assert.equal(reference.path, notesPath);
      assert.equal(
        reference.digest,
        sha256(await readFile(path.join(isolation.workspace, "docs", "Notes.md"))),
        "the captured digest is the digest of the real file's bytes",
      );
      observe(receipt, "second run provenance references", secondRun.provenance.references);
    },
  );
  await step(
    receipt,
    "B11",
    "The first run keeps its captured request, context, checks and evidence",
    async () => {
      const record = await readGraphRecordNow(isolation);
      const first = record.runs.find((run) => run.id === firstRunId);
      assert.deepEqual(
        first,
        resolved,
        "the completed run record is byte-for-byte what it was at resolution",
      );
      assert.equal(first.definition.template.parameters.request, REQUEST);
      assert.equal(first.definition.template.bindings.references.instructions, "Context.md");
      assert.deepEqual(first.definition.template.bindings.recipes, {
        build: "reviewer-build",
        test: "reviewer-test",
      });
      await T(window, "graph-view-runs").click();
      await window.locator(`[data-testid="graph-run"][data-run-id="${firstRunId}"]`).click();
      const preview = await T(window, "graph-run-request-preview").first().innerText();
      assert.ok(preview.includes(REQUEST));
      assert.ok(!preview.includes("Second task"));
    },
  );
  await step(receipt, "B12", "Cancel the second synthetic run (cleanup)", async () => {
    await window.locator(`[data-testid="graph-run"][data-run-id="${secondRun.id}"]`).click();
    await T(window, "graph-cancel").click();
    const { record } = await waitRecord(
      isolation,
      (item) => ["Cancelled", "Interrupted"].includes(item.runs.at(-1).status),
      "the second run to stop",
    );
    observe(receipt, `second run stopped: ${record.runs.at(-1).status}`);
  });
}
