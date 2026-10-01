import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MAX_RECONCILE_SNAPSHOTS,
  createReconcileSnapshotStore,
  realSnapshotIo,
  sha256,
} from "./reconcile-snapshots.js";

const workspace = "a".repeat(64);
async function withDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "z82-snapshots-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a snapshot is the exact bytes, named by content hash, and identical content is stored once", async () => {
  await withDirectory(async (directory) => {
    const store = createReconcileSnapshotStore(directory);
    // 故意不是规范 JSON：CRLF、尾随空白、缩进不一致。快照必须逐字节保留，而不是重新序列化。
    const bytes = Buffer.from('{\r\n  "version":1 ,\r\n\t"x": [1,2]   }\r\n\r\n', "utf8");
    const first = await store.preserve(workspace, bytes);
    assert.equal(first.id, sha256(bytes));
    assert.equal(first.created, true);
    assert.equal(Buffer.compare(await readFile(first.path), bytes), 0);
    const mtime = new Date(Date.now() - 60_000);
    await utimes(first.path, mtime, mtime);
    const again = await store.preserve(workspace, bytes);
    assert.equal(again.created, false);
    assert.equal((await store.list(workspace)).length, 1);
    // 重复确认只刷新修改时间（元数据），内容不重写。
    assert.ok((await stat(first.path)).mtimeMs > mtime.getTime() + 30_000);
    assert.equal(Buffer.compare(await readFile(first.path), bytes), 0);
    assert.equal(Buffer.compare(await store.read(workspace, first.id), bytes), 0);
  });
});

test("a corrupted same-name file is replaced with the correct bytes, and reads verify the hash", async () => {
  await withDirectory(async (directory) => {
    const store = createReconcileSnapshotStore(directory);
    const bytes = Buffer.from("original record bytes");
    const { id, path } = await store.preserve(workspace, bytes);
    await writeFile(path, "tampered");
    await assert.rejects(store.read(workspace, id), /does not match its identity/);
    const repaired = await store.preserve(workspace, bytes);
    assert.equal(repaired.created, true);
    assert.equal(Buffer.compare(await store.read(workspace, id), bytes), 0);
    await assert.rejects(store.read(workspace, "../escape"), /Invalid snapshot id/);
  });
});

test("retention keeps the newest 20, never prunes the snapshot just saved, and touches nothing else", async () => {
  await withDirectory(async (directory) => {
    const store = createReconcileSnapshotStore(directory);
    // 记录文件、别的工作区的快照、产物、资料库，以及快照目录里名字不符的文件，都不应被修剪。
    await writeFile(join(directory, `${workspace}.json`), "current record");
    await writeFile(join(directory, "workflow-library.json"), "library");
    await mkdir(join(directory, "artifacts"), { recursive: true });
    await writeFile(join(directory, "artifacts", "a.json"), "artifact");
    const other = "b".repeat(64);
    await store.preserve(other, Buffer.from("other workspace"));
    await mkdir(store.folder(workspace), { recursive: true });
    await writeFile(join(store.folder(workspace), "notes.txt"), "not a snapshot");
    await writeFile(join(store.folder(workspace), `${"c".repeat(63)}.json`), "short name");
    const ids: string[] = [];
    for (let index = 0; index < MAX_RECONCILE_SNAPSHOTS + 5; index++) {
      const saved = await store.preserve(workspace, Buffer.from(`state ${index}`));
      ids.push(saved.id);
      // 让修改时间严格递增，排序不依赖文件系统时间粒度。
      const when = new Date(Date.now() - (MAX_RECONCILE_SNAPSHOTS + 5 - index) * 1000);
      await utimes(saved.path, when, when);
    }
    const kept = await store.list(workspace);
    assert.equal(kept.length, MAX_RECONCILE_SNAPSHOTS);
    assert.ok(
      kept.some((item) => item.id === ids.at(-1)),
      "the newest survives",
    );
    assert.ok(!kept.some((item) => item.id === ids[0]), "the oldest was pruned");
    const foreign = (await readdir(store.folder(workspace))).filter(
      (name) => !/^[0-9a-f]{64}\.json$/.test(name),
    );
    assert.deepEqual(foreign.sort(), [`${"c".repeat(63)}.json`, "notes.txt"]);
    assert.equal((await store.list(other)).length, 1);
    assert.equal(await readFile(join(directory, `${workspace}.json`), "utf8"), "current record");
    assert.equal(await readFile(join(directory, "workflow-library.json"), "utf8"), "library");
    assert.equal(await readFile(join(directory, "artifacts", "a.json"), "utf8"), "artifact");
    // alsoKeep 保护被恢复的那一份：即使它是最旧的，新增快照后也不被修剪。
    const oldest = kept.at(-1)!;
    const extra = await store.preserve(workspace, Buffer.from("extra"), [oldest.id]);
    const names = (await store.list(workspace)).map((item) => item.id);
    assert.ok(names.includes(extra.id) && names.includes(oldest.id));
  });
});

test("injected write failures surface as errors and leave no partial snapshot", async () => {
  await withDirectory(async (directory) => {
    const store = createReconcileSnapshotStore(directory, {
      ...realSnapshotIo,
      writeAtomic: async () => {
        throw new Error("injected write failure");
      },
    });
    await assert.rejects(store.preserve(workspace, Buffer.from("x")), /injected write failure/);
    assert.deepEqual(await store.list(workspace), []);
    const unverifiable = createReconcileSnapshotStore(directory, {
      ...realSnapshotIo,
      writeAtomic: async () => undefined, // 声称写成功但什么都没写
    });
    await assert.rejects(unverifiable.preserve(workspace, Buffer.from("y")), /ENOENT|verification/);
    assert.deepEqual(await store.list(workspace), []);
  });
});
