import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Real filesystem fault scoped to an unused Graph record in this newly owned fixture home. */
export async function withOwnedRecordWriteFailure({ home, record }, observe) {
  const ownedHome = await realpath(home);
  const expectedFolder = path.join(ownedHome, "data/.zcode/v2/graph-engineering");
  assert.equal(
    path.dirname(path.resolve(record)),
    expectedFolder,
    "Record must belong to the owned graph-engineering folder.",
  );
  assert.equal(
    await realpath(expectedFolder),
    expectedFolder,
    "Owned Graph folder must not traverse a symlink.",
  );
  assert.match(path.basename(record), /^[a-f0-9]{64}\.json$/);
  assert.equal((await lstat(record)).isFile(), true, "Owned original record must be a file.");
  const original = await readFile(record);
  const parsed = JSON.parse(original);
  assert.deepEqual(parsed.runs, [], "Fault injection cannot touch execution history.");
  assert.deepEqual(
    parsed.parallel?.runs ?? [],
    [],
    "Fault injection cannot touch parallel history.",
  );
  const backup = `${record}.pre-z8-u1-original-${randomUUID()}`;
  const receiptPath = path.join(ownedHome, "pre-z8-u1-save-restoration.json");
  const receipt = {
    record,
    backup,
    beforeSha256: digest(original),
    startedAt: Date.now(),
    restoration: "not-started",
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  let moved = false,
    obstruction,
    result,
    failure;
  try {
    await rename(record, backup);
    moved = true;
    await mkdir(record);
    obstruction = await lstat(record);
    receipt.restoration = "obstruction-active";
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    result = await observe();
  } catch (error) {
    failure = error;
    receipt.observationError = String(error);
  } finally {
    try {
      if (obstruction) {
        const current = await lstat(record);
        // 必须仍是本次创建的空目录；目录被替换或新增文件时保留现场，不能扩大故障清理范围。
        assert.ok(
          current.isDirectory() &&
            !current.isSymbolicLink() &&
            current.ino === obstruction.ino &&
            current.dev === obstruction.dev &&
            current.birthtimeMs === obstruction.birthtimeMs,
          "Owned record obstruction changed; refusing cleanup.",
        );
        assert.deepEqual(
          await readdir(record),
          [],
          "Owned record obstruction is nonempty; refusing cleanup.",
        );
        assert.equal(await realpath(record), path.resolve(record));
        await rmdir(record);
      }
      if (moved) {
        assert.equal(await realpath(path.dirname(record)), expectedFolder);
        assert.deepEqual(await readFile(backup), original, "Original fixture backup changed.");
        // hard link 的目标必须不存在，避免恢复时覆盖意外出现的新文件；校验后仅移除自有备份名。
        await link(backup, record);
        assert.deepEqual(await readFile(record), original);
        await unlink(backup);
      }
      assert.deepEqual(await readFile(record), original);
      receipt.afterSha256 = digest(await readFile(record));
      receipt.restoration = "restored-exact-bytes";
    } catch (error) {
      receipt.restoration = "failed-preserved";
      receipt.restorationError = String(error);
      failure = failure
        ? new AggregateError([failure, error], "Observation and owned restoration failed.")
        : error;
    }
    receipt.completedAt = Date.now();
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  }
  if (failure) throw failure;
  return result;
}
