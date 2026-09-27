import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { root } from "./isolation.mjs";
import { u3Sha256 } from "./pre-z8-u3-fixture.mjs";
import { prepareU4Owner, withU4ArtifactFault } from "./pre-z8-u4-artifact-fault.mjs";

async function fixture(action) {
  const parent = await realpath(path.join(root, ".tmp"));
  const home = path.join(parent, `z1-native-${Date.now()}-${randomUUID().slice(0, 6)}`);
  const owner = { home, workspace: path.join(home, "workspace") };
  await mkdir(owner.workspace, { recursive: true });
  try {
    await prepareU4Owner(owner);
    const run = {
      id: "unit-run",
      status: "Completed",
      createdAt: Date.now(),
      target: { workspacePath: owner.workspace },
    };
    const content = "SYNTHETIC UNIT CONTENT; no native execution evidence";
    const artifact = {
      id: "unit-artifact",
      runId: run.id,
      nodeId: "analyze",
      attemptId: "unit-attempt",
      workspaceKey: owner.workspace,
      digest: u3Sha256(content),
      bytes: Buffer.byteLength(content),
    };
    run.artifacts = [artifact];
    const file = path.join(
      home,
      "data/.zcode/v2/graph-engineering/artifacts",
      u3Sha256(owner.workspace),
      u3Sha256(run.id),
      `${u3Sha256(artifact.id)}.json`,
    );
    await mkdir(path.dirname(file), { recursive: true });
    const original = Buffer.from(JSON.stringify({ artifact, content }));
    await writeFile(file, original, { flag: "wx" });
    await action({ owner, run, artifact, file, original });
  } finally {
    const actual = await realpath(home);
    assert.equal(path.dirname(actual), parent);
    assert.match(path.basename(actual), /^z1-native-\d+-[a-f0-9]{6}$/);
    await rm(actual, { recursive: true, force: true });
  }
}

test("U4 missing artifact is restored byte-for-byte even when UI assertions throw", () =>
  fixture(async ({ owner, run, artifact, file, original }) => {
    await assert.rejects(
      withU4ArtifactFault(owner, run, artifact, "missing", async () => {
        await assert.rejects(readFile(file), (error) => error.code === "ENOENT");
        throw new Error("Synthetic UI assertion failure");
      }),
      /Synthetic UI assertion failure/,
    );
    assert.deepEqual(await readFile(file), original);
    const receipt = JSON.parse(
      await readFile(
        path.join(owner.home, `pre-z8-u4-artifact-${u3Sha256(artifact.id)}-missing.json`),
        "utf8",
      ),
    );
    assert.equal(receipt.restored, true);
    assert.equal(receipt.after.sha256, u3Sha256(original));
  }));

test("U4 corruption changes retained content only and restores exact ownership descriptor and bytes", () =>
  fixture(async ({ owner, run, artifact, file, original }) => {
    const { receipt } = await withU4ArtifactFault(owner, run, artifact, "corrupt", async () => {
      const stored = JSON.parse(await readFile(file, "utf8"));
      assert.deepEqual(stored.artifact, artifact);
      assert.notEqual(u3Sha256(stored.content), artifact.digest);
    });
    assert.equal(receipt.restored, true);
    assert.deepEqual(await readFile(file), original);
  }));

test("U4 refuses foreign workspace, mismatched descriptor and absent fresh-profile nonce before mutation", () =>
  fixture(async ({ owner, run, artifact, file, original }) => {
    let called = false;
    const action = async () => {
      called = true;
    };
    await assert.rejects(
      withU4ArtifactFault(
        owner,
        { ...run, target: { workspacePath: path.dirname(owner.workspace) } },
        artifact,
        "missing",
        action,
      ),
    );
    await assert.rejects(
      withU4ArtifactFault(owner, run, { ...artifact, attemptId: "different" }, "corrupt", action),
    );
    await assert.rejects(
      withU4ArtifactFault({ ...owner, u4OwnerNonce: undefined }, run, artifact, "missing", action),
    );
    assert.equal(called, false);
    assert.deepEqual(await readFile(file), original);
  }));
