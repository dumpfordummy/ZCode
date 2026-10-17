import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { observeFilesystem } from "./eng-p1-io-observer.mjs";

test("diagnostic observer preserves actual bytes, read failure and API restoration", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "eng-p1-observer-"));
  const path = join(directory, "input");
  await fs.writeFile(path, "actual bytes");
  const original = { open: fs.open, readFile: fs.readFile, lstat: fs.lstat };
  const observer = observeFilesystem();
  try {
    observer.begin();
    assert.equal(await fs.readFile(path, "utf8"), "actual bytes");
    const handle = await fs.open(path, "r");
    try {
      const chunks = [];
      for await (const chunk of handle.createReadStream({ autoClose: false })) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), "actual bytes");
      assert.equal((await handle.stat()).size, 12);
    } finally {
      await handle.close();
    }
    await assert.rejects(fs.lstat(join(directory, "missing")), { code: "ENOENT" });
    const result = observer.end();
    // The stream delegates to FileHandle.read: streamBytes is a subset, not additive.
    assert.equal(result.readBytes, 24);
    assert.equal(result.streamBytes, 12);
    assert.equal(result.errors, 1);
    assert.equal(result.inFlight, 0);
    assert.equal(result.calls.open, 1);
    // Node may re-enter close through the stream's close listener.
    assert.ok(result.calls["handle.close"] >= 1);
  } finally {
    observer.restore();
    await fs.rm(directory, { recursive: true, force: true });
  }
  for (const [key, value] of Object.entries(original)) assert.equal(fs[key], value);
});
