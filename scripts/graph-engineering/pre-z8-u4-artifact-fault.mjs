import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertU3Profile, u3Sha256 } from "./pre-z8-u3-fixture.mjs";

export async function prepareU4Owner(isolation) {
  const home = await assertU3Profile(isolation);
  const nonce = randomUUID();
  const marker = {
    kind: "pre-z8-u4-native",
    version: 1,
    nonce,
    createdAt: Date.now(),
    workspace: isolation.workspace,
  };
  await writeFile(path.join(home, "pre-z8-u4-owner.json"), JSON.stringify(marker, null, 2), {
    flag: "wx",
  });
  isolation.u4OwnerNonce = nonce;
  return marker;
}

async function plainPath(home, file) {
  const relative = path.relative(home, file);
  assert.ok(
    relative &&
      !path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`),
  );
  const parts = relative.split(path.sep);
  let current = home;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const metadata = await lstat(current);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(await realpath(current), current);
    assert.ok(
      index === parts.length - 1
        ? metadata.isFile() && metadata.nlink === 1
        : metadata.isDirectory(),
    );
  }
}

async function ownedArtifact(isolation, run, artifact) {
  const home = await assertU3Profile(isolation);
  assert.equal(isolation.graphProfile, undefined);
  assert.ok(isolation.u4OwnerNonce);
  const markerPath = path.join(home, "pre-z8-u4-owner.json");
  await plainPath(home, markerPath);
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  assert.equal(marker.kind, "pre-z8-u4-native");
  assert.equal(marker.version, 1);
  assert.equal(marker.nonce, isolation.u4OwnerNonce);
  assert.equal(marker.workspace, isolation.workspace);
  assert.equal(run.status, "Completed");
  assert.ok(run.createdAt >= marker.createdAt);
  assert.equal(run.target.workspacePath, isolation.workspace);
  assert.equal(run.target.workspaceIdentity, undefined);
  assert.equal(artifact.workspaceKey, isolation.workspace);
  assert.equal(artifact.runId, run.id);
  assert.deepEqual(
    run.artifacts.find((item) => item.id === artifact.id),
    artifact,
  );
  const file = path.join(
    home,
    "data/.zcode/v2/graph-engineering/artifacts",
    u3Sha256(artifact.workspaceKey),
    u3Sha256(run.id),
    `${u3Sha256(artifact.id)}.json`,
  );
  await plainPath(home, file);
  const metadata = await lstat(file);
  assert.ok(metadata.size < 2 * 1024 * 1024);
  const original = await readFile(file),
    stored = JSON.parse(original.toString("utf8"));
  assert.deepEqual(stored.artifact, artifact);
  assert.equal(Buffer.byteLength(stored.content), artifact.bytes);
  assert.equal(u3Sha256(stored.content), artifact.digest);
  return { home, file, original, metadata, stored };
}

async function requireAbsent(file) {
  await assert.rejects(lstat(file), (error) => error.code === "ENOENT");
}

/** Fault only a current owned profile artifact; never alter its descriptor or authoritative run. */
export async function withU4ArtifactFault(isolation, run, artifact, kind, action) {
  assert.ok(["missing", "corrupt"].includes(kind));
  const { home, file, original, metadata, stored } = await ownedArtifact(isolation, run, artifact);
  const held = `${file}.u4-${isolation.u4OwnerNonce}.held`;
  await requireAbsent(held);
  const receiptFile = path.join(home, `pre-z8-u4-artifact-${u3Sha256(artifact.id)}-${kind}.json`);
  await requireAbsent(receiptFile);
  const changed = Buffer.from(
    JSON.stringify({
      ...stored,
      content: `${stored.content}\nPRE_Z8_U4_INTENTIONAL_RETAINED_CONTENT_FAULT`,
    }),
  );
  const receipt = {
    kind,
    runId: run.id,
    artifactId: artifact.id,
    file,
    startedAt: Date.now(),
    before: { bytes: original.length, sha256: u3Sha256(original) },
    restored: false,
  };
  let changedOnDisk = false,
    value,
    failure;
  try {
    if (kind === "missing") await rename(file, held);
    else await writeFile(file, changed);
    changedOnDisk = true;
    value = await action();
  } catch (error) {
    failure = error;
    receipt.actionError = String(error);
  } finally {
    try {
      if (changedOnDisk) {
        if (kind === "missing") {
          await requireAbsent(file);
          await plainPath(home, held);
          assert.deepEqual(await readFile(held), original);
          await rename(held, file);
        } else {
          await plainPath(home, file);
          assert.deepEqual(
            await readFile(file),
            changed,
            "Refusing to overwrite unexpected concurrent artifact bytes.",
          );
          await writeFile(file, original);
        }
        await utimes(file, metadata.atime, metadata.mtime);
      }
      await plainPath(home, file);
      const restored = await readFile(file);
      assert.deepEqual(restored, original);
      receipt.after = { bytes: restored.length, sha256: u3Sha256(restored) };
      receipt.restored = true;
    } catch (error) {
      receipt.restorationError = String(error);
      failure = new AggregateError(
        [failure, error].filter(Boolean),
        "Owned artifact restoration failed; inspect receipt and retained backup.",
      );
    }
    receipt.completedAt = Date.now();
    await writeFile(receiptFile, JSON.stringify(receipt, null, 2), { flag: "wx" });
  }
  if (failure) throw failure;
  return { value, receipt: { ...receipt, receiptFile } };
}
