import assert from "node:assert/strict";
import test from "node:test";
import { createGraphEvidencePort } from "./evidence.js";

test("source adapter forwards the captured workspace and retains native incomplete evidence", async () => {
  const snapshot = {
    baseline: "fixture HEAD",
    scope: "fixture scope",
    files: [{ path: "large.bin", status: "untracked", issue: "binary" }],
    complete: false,
    issues: ["binary"],
  };
  const calls: unknown[] = [];
  const port = createGraphEvidencePort({
    async getSourceSnapshot(params) {
      calls.push(params);
      return snapshot;
    },
  });
  assert.equal(
    await port.captureSource({
      workspacePath: "/synthetic/project",
      workspaceIdentity: "captured-identity",
    }),
    snapshot,
  );
  assert.deepEqual(calls, [{ workspacePath: "/synthetic/project" }]);
  assert.equal(
    port.digest("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
