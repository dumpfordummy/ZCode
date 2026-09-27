import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createGraphArtifactStore } from "../../packages/services/src/graph-engineering/adapters/artifacts.ts";

/** Uses the existing product store unchanged; this is not an alternate report-retention path. */
export async function captureFixtureReport(fixture, execution) {
  const store = createGraphArtifactStore(path.join(fixture.home, "graph-artifact-probe"));
  const identity = {
    target: { workspacePath: fixture.workspace },
    runId: "isolated-vstest-artifact-probe",
    nodeId: "test",
    attemptId: execution.operationId,
    artifactId: `trx-${execution.operationId}`,
  };
  const artifact = await store.captureFile({
    ...identity,
    path: execution.reportPath,
    capturedAt: Date.now(),
    operationId: execution.operationId,
    sourceBaseline: execution.sourceDigest,
  });
  const retained = await store.read(identity);
  const original = await readFile(path.join(fixture.workspace, execution.reportPath), "utf8");
  assert.equal(retained.artifact.digest, artifact.digest);
  if (retained.content === original) {
    assert.equal(artifact.validation, "valid");
    assert.equal(artifact.redacted, undefined);
    assert.equal(artifact.digest, execution.reportDigest);
  } else {
    assert.equal(artifact.validation, "incomplete");
    assert.equal(artifact.redacted, true);
    assert.notEqual(artifact.digest, execution.reportDigest);
  }
  return {
    originalReportDigest: execution.reportDigest,
    retainedMatchesOriginal: retained.content === original,
    artifact,
    productStoreModified: false,
  };
}
