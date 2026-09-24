import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { acceptancePaths } from "./acceptance-paths.mjs";
import { capture, readArtifactUi, readGraphRecord } from "./z4-native-helpers.mjs";

const digest = (text) => createHash("sha256").update(text).digest("hex");
export async function verifyArtifactTamper(isolation, window, summary, run, artifact) {
  const file = await realpath(
    path.join(
      path.dirname(acceptancePaths(isolation).record),
      "artifacts",
      digest(artifact.workspaceKey),
      digest(run.id),
      `${digest(artifact.id)}.json`,
    ),
  );
  const home = await realpath(isolation.home);
  assert.ok(
    file.startsWith(`${home}${path.sep}`),
    "Only this freshly generated profile's artifact may be faulted.",
  );
  const original = await readFile(file);
  const before = (await readGraphRecord(isolation)).runs.at(-1);
  try {
    const stored = JSON.parse(original);
    stored.content += "\nZ4_ISOLATED_TAMPER_PROBE";
    await writeFile(file, JSON.stringify(stored));
    await window.getByTestId(`graph-artifact-open-${artifact.id}`).click();
    const error = window.getByRole("alert").filter({ hasText: /digest\/byte length mismatch/ });
    await error.waitFor();
    await error.scrollIntoViewIfNeeded();
    await capture(isolation, window, summary, "z4-artifact-tamper-refused");
    assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), before);
  } finally {
    await writeFile(file, original);
  }
  assert.equal(await readArtifactUi(window, run, artifact), JSON.parse(original).content);
  assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), before);
  summary.assertions.push(
    "After actual restart, a contained fault changed only the private stored artifact content while retaining its original manifest. Native inspection rejected the digest/byte mismatch. Restoring the exact original bytes restored inspection without rewriting completed history.",
  );
}
