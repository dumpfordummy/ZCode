import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BAD_SOURCE, GOOD_SOURCE } from "./pre-z8-dotnet-source.mjs";
import { assertU2Profile, u2OwnedFile, u2Sha256 } from "./pre-z8-u2-fixture.mjs";

export async function withU2OwnedMutation(isolation, kind, observe) {
  await assertU2Profile(isolation);
  assert.ok(["source", "build"].includes(kind));
  const relative = kind === "source" ? "MathOps.cs" : "bin/Release/net8.0/Fixture.Tests.deps.json";
  const file = await u2OwnedFile(isolation, relative);
  const original = await readFile(file),
    metadata = await lstat(file);
  if (kind === "source") assert.equal(original.toString(), GOOD_SOURCE);
  else JSON.parse(original.toString());
  const mutated =
    kind === "source" ? Buffer.from(BAD_SOURCE) : Buffer.concat([original, Buffer.from("\n ")]);
  const identity = randomUUID();
  const receipt = {
    kind,
    path: file,
    beforeSha256: u2Sha256(original),
    mutatedSha256: u2Sha256(mutated),
    backupPath: path.join(isolation.home, `pre-z8-u2-${kind}-${identity}.original`),
    receiptPath: path.join(isolation.home, `pre-z8-u2-${kind}-${identity}.json`),
    startedAt: Date.now(),
    restoration: "pending",
  };
  await writeFile(receipt.backupPath, original, { flag: "wx" });
  await writeFile(receipt.receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx" });
  let value, observerError;
  try {
    const initial = await open(file, "r+");
    try {
      const current = await initial.stat();
      assert.equal(current.ino, metadata.ino);
      assert.equal(current.dev, metadata.dev);
      assert.deepEqual(await initial.readFile(), original);
      await initial.write(mutated, 0, mutated.length, 0);
      await initial.truncate(mutated.length);
    } finally {
      await initial.close();
    }
    value = await observe(receipt);
  } catch (error) {
    observerError = error;
  }
  try {
    // 只恢复本次写入且身份未变的夹具；并发变化保留原样，并留下原始备份供诊断。
    assert.equal(await u2OwnedFile(isolation, relative), file);
    const current = await lstat(file);
    assert.equal(current.ino, metadata.ino, "Refusing to restore a changed fixture identity.");
    assert.equal(current.dev, metadata.dev);
    const retained = await readFile(file);
    const writeNeverChangedBytes = observerError && retained.equals(original);
    if (!writeNeverChangedBytes)
      assert.deepEqual(retained, mutated, "Refusing to restore changed fixture bytes.");
    const restore = await open(file, "r+");
    try {
      const identityNow = await restore.stat();
      assert.equal(identityNow.ino, metadata.ino);
      assert.equal(identityNow.dev, metadata.dev);
      assert.deepEqual(await restore.readFile(), retained);
      await restore.write(original, 0, original.length, 0);
      await restore.truncate(original.length);
      await restore.utimes(metadata.atime, metadata.mtime);
    } finally {
      await restore.close();
    }
    receipt.afterSha256 = u2Sha256(await readFile(file));
    assert.equal(receipt.afterSha256, receipt.beforeSha256);
    receipt.restoration = "restored-exact-bytes";
  } catch (error) {
    receipt.restoration = "refused-concurrent-change";
    receipt.restorationError = String(error);
    if (observerError)
      throw new AggregateError(
        [observerError, error],
        "Observation and fixture restoration failed.",
      );
    throw error;
  } finally {
    receipt.completedAt = Date.now();
    if (observerError) receipt.observerError = String(observerError);
    await writeFile(receipt.receiptPath, JSON.stringify(receipt, null, 2));
  }
  if (observerError) throw observerError;
  return { value, receipt };
}
