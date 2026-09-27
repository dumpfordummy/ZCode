import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { withOwnedRecordWriteFailure } from "./pre-z8-u1-record-fault.mjs";

async function fixture(t) {
  const home = await mkdtemp(path.join(tmpdir(), "pre-z8-u1-fault-unit-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(home)), path.resolve(tmpdir()));
    assert.match(path.basename(home), /^pre-z8-u1-fault-unit-/);
    await rm(home, { recursive: true, force: true });
  });
  const folder = path.join(home, "data/.zcode/v2/graph-engineering");
  await mkdir(folder, { recursive: true });
  const record = path.join(folder, `${"a".repeat(64)}.json`);
  const text = JSON.stringify({ version: 1, definition: {}, runs: [] });
  await writeFile(record, text);
  return { home, record, text, receipt: path.join(home, "pre-z8-u1-save-restoration.json") };
}

test("owned file obstruction is removed and exact original record restored after observation", async (t) => {
  const f = await fixture(t);
  const result = await withOwnedRecordWriteFailure(f, async () => {
    assert.deepEqual(await readdir(f.record), []);
    await assert.rejects(readFile(f.record), /EISDIR|EACCES|EPERM/);
    return "observed";
  });
  assert.equal(result, "observed");
  assert.equal(await readFile(f.record, "utf8"), f.text);
  assert.equal(JSON.parse(await readFile(f.receipt, "utf8")).restoration, "restored-exact-bytes");
});

test("observation exceptions retain evidence and still restore exact original bytes", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    withOwnedRecordWriteFailure(f, async () => {
      throw new Error("UI assertion failed");
    }),
    /UI assertion failed/,
  );
  assert.equal(await readFile(f.record, "utf8"), f.text);
  const receipt = JSON.parse(await readFile(f.receipt, "utf8"));
  assert.equal(receipt.restoration, "restored-exact-bytes");
  assert.match(receipt.observationError, /UI assertion failed/);
});

test("record outside owned home is refused before any mutation", async (t) => {
  const f = await fixture(t);
  const otherHome = path.join(f.home, "other");
  await mkdir(otherHome);
  await assert.rejects(
    withOwnedRecordWriteFailure({ ...f, home: otherHome }, async () => {}),
    /owned|graph-engineering/i,
  );
  assert.equal(await readFile(f.record, "utf8"), f.text);
});

test("a modified obstruction is preserved together with the original backup and failure receipt", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    withOwnedRecordWriteFailure(f, async () => {
      await writeFile(path.join(f.record, "unexpected.txt"), "preserve me");
    }),
    /changed|nonempty/i,
  );
  assert.equal(await readFile(path.join(f.record, "unexpected.txt"), "utf8"), "preserve me");
  const receipt = JSON.parse(await readFile(f.receipt, "utf8"));
  assert.equal(receipt.restoration, "failed-preserved");
  assert.equal(await readFile(receipt.backup, "utf8"), f.text);
});

test("replacing an empty obstruction does not authorize deleting its replacement", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    withOwnedRecordWriteFailure(f, async () => {
      await rename(f.record, `${f.record}.original-obstruction`);
      await mkdir(f.record);
    }),
    /changed/i,
  );
  assert.deepEqual(await readdir(f.record), []);
  const receipt = JSON.parse(await readFile(f.receipt, "utf8"));
  assert.equal(receipt.restoration, "failed-preserved");
  assert.equal(await readFile(receipt.backup, "utf8"), f.text);
});
