import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { readArtifactUi } from "./z4-native-helpers.mjs";
import { captureU3, ledger, modelCount } from "./pre-z8-u3-common.mjs";
import { withU4ArtifactFault } from "./pre-z8-u4-artifact-fault.mjs";
import { assertU4Summary, selectU4Run } from "./pre-z8-u4-ui.mjs";

export async function verifyU4ArtifactErrors(isolation, window, summary, run) {
  await selectU4Run(window, run.id);
  const artifact = run.artifacts.find((item) => item.nodeId === "implement");
  assert.ok(artifact);
  const record = await readFile(acceptancePaths(isolation).record);
  const inputs = await ledger(isolation),
    requests = modelCount(isolation);
  for (const kind of ["missing", "corrupt"]) {
    await readArtifactUi(window, run, artifact);
    const { receipt } = await withU4ArtifactFault(isolation, run, artifact, kind, async () => {
      await window.getByTestId(`graph-artifact-open-${artifact.id}`).click();
      await window
        .locator('[data-testid="graph-artifact-read-state"][data-state="error"]')
        .waitFor();
      const error = window.getByTestId("graph-artifact-read-error");
      const message = await error.innerText();
      assert.match(
        message,
        kind === "missing" ? /ENOENT|no such file|not found/i : /digest\/byte length mismatch/i,
      );
      assert.equal(await window.getByTestId("graph-artifact-content").count(), 0);
      await error.scrollIntoViewIfNeeded();
      await captureU3(isolation, window, summary, `pre-z8-u4-artifact-${kind}-visible-error`);
      await assertU4Summary(window, summary, run, {
        evidence: "agent-reported",
        human: "approved",
      });
      assert.deepEqual(await readFile(acceptancePaths(isolation).record), record);
      assert.deepEqual(await ledger(isolation), inputs);
      assert.equal(modelCount(isolation), requests);
      return message;
    });
    (summary.artifactRestorations ??= []).push(receipt);
    await readArtifactUi(window, run, artifact);
    assert.equal(
      await window.getByTestId("graph-artifact-read-state").getAttribute("data-state"),
      "ready",
    );
    assert.equal(await window.getByTestId("graph-artifact-read-error").count(), 0);
  }
  await window.getByTestId("graph-export-manifest").click();
  // ReadState renders an intentionally empty (zero-size) <div data-state="ready"> when the
  // manifest read completes, so a visibility wait can never succeed. The [data-state="ready"]
  // attribute selector itself excludes loading/error; "attached" only confirms the element is
  // in the DOM with that state, not that it is visible. This mirrors the hidden-tolerant
  // getAttribute("data-state") check used for graph-artifact-read-state above.
  await window
    .locator('[data-testid="graph-manifest-read-state"][data-state="ready"]')
    .waitFor({ state: "attached" });
  const manifestText = await window.getByTestId("graph-artifact-manifest").inputValue();
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.runId, run.id);
  assert.equal(manifest.artifacts.length, run.artifacts.length);
  for (const item of manifest.artifacts) {
    assert.equal(item.digest, run.artifacts.find((saved) => saved.id === item.id).digest);
    for (const field of [
      "content",
      "sourcePath",
      "sourceBaseline",
      "sessionId",
      "commandId",
      "args",
      "stdout",
      "stderr",
      "issue",
    ])
      assert.equal(item[field], undefined);
  }
  summary.exportedManifest = manifest;
  await window.getByTestId("graph-artifact-manifest").scrollIntoViewIfNeeded();
  await captureU3(isolation, window, summary, "pre-z8-u4-artifact-restored-manifest");
  assert.deepEqual(await readFile(acceptancePaths(isolation).record), record);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  summary.assertions.push(
    "Actual missing and digest-mismatched retained files show current-request read errors and clear previous content while captured acceptance remains unchanged. Both files restore exact bytes in finally, read successfully again and retain the redacted manifest contract with no new native admission.",
  );
}
