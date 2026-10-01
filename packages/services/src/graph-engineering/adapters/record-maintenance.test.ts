import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GraphEngineeringService } from "../app/service.js";
import type { GraphNativePort } from "../app/ports.js";
import type { GraphWorkspaceTarget } from "../contract.js";
import { listGraphRecords, restoreGraphRecord } from "./record-maintenance.js";
import {
  MAX_RECONCILE_SNAPSHOTS,
  createReconcileSnapshotStore,
  sha256,
} from "./reconcile-snapshots.js";
import { createGraphRepository, workspaceHash } from "./repository.js";

const fixtureUrl = (name: string) => new URL(`../app/fixtures/${name}`, import.meta.url);
const native = new Proxy({}, { get: () => async () => ({ available: true }) }) as GraphNativePort;

/** 一次性合成目录：旧的 Z1 待处理记录 + 与记录无关的“别的”文件（产物、凭据形状的文件、库）。 */
async function scenario(
  run: (context: {
    directory: string;
    target: GraphWorkspaceTarget;
    key: string;
    original: Buffer;
    recordPath: string;
    others: Record<string, string>;
    reconcile(): Promise<void>;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "z82-maintenance-"));
  const original = Buffer.from(await readFile(fixtureUrl("z1-pending.json")));
  const target = JSON.parse(original.toString("utf8")).runs[0].target as GraphWorkspaceTarget;
  const recordPath = join(directory, `${workspaceHash(target)}.json`);
  await writeFile(recordPath, original);
  const others: Record<string, string> = {
    [join(directory, "workflow-library.json")]: '{"entries":"synthetic library"}',
    [join(directory, "artifacts", "run", "a.json")]: "synthetic artifact",
    [join(directory, "..", `${workspaceHash(target)}-credentials.json`)]:
      "synthetic credential-shaped file",
  };
  for (const [file, content] of Object.entries(others)) {
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, content);
  }
  const reconcile = async () => {
    const service = new GraphEngineeringService({
      repository: createGraphRepository(directory),
      native,
      id: () => "id",
      now: () => 1_700_000_000_000,
    });
    try {
      await service.getWorkspace(target);
    } finally {
      await service.disposeAndWait();
    }
  };
  try {
    await run({
      directory,
      target,
      key: target.workspacePath,
      original,
      recordPath,
      others,
      reconcile,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(join(directory, "..", `${workspaceHash(target)}-credentials.json`), { force: true });
  }
}

const untouched = async (others: Record<string, string>) => {
  for (const [file, content] of Object.entries(others))
    assert.equal(await readFile(file, "utf8"), content, file);
};

test("restore puts the exact original bytes back and preserves the current record first", async () => {
  await scenario(async ({ directory, key, original, recordPath, others, reconcile, target }) => {
    await reconcile();
    const reconciled = await readFile(recordPath);
    assert.notEqual(sha256(reconciled), sha256(original));
    const result = await restoreGraphRecord({
      directory,
      workspaceKey: key,
      snapshot: sha256(original).slice(0, 12),
    });
    assert.equal(result.restoredSnapshot, sha256(original));
    assert.equal(Buffer.compare(await readFile(recordPath), original), 0);
    // 恢复前的当前记录（已对账的 Interrupted 版本）先被保存。
    const store = createReconcileSnapshotStore(directory);
    const ids = (await store.list(workspaceHash(target))).map((item) => item.id);
    assert.ok(ids.includes(sha256(reconciled)));
    assert.equal(result.preservedCurrent?.id, sha256(reconciled));
    await untouched(others);
    // 恢复之后，列表显示这条记录与它的两个快照。
    const [entry] = await listGraphRecords(directory);
    assert.equal(entry!.workspaceKey, key);
    assert.equal(entry!.snapshots.length, 2);
  });
});

test("restore preserves a damaged current record before replacing it", async () => {
  await scenario(async ({ directory, key, original, recordPath, others, reconcile, target }) => {
    await reconcile();
    const damaged = Buffer.from("{ not json at all");
    await writeFile(recordPath, damaged);
    await restoreGraphRecord({
      directory,
      workspaceKey: key,
      snapshot: sha256(original).slice(0, 10),
    });
    assert.equal(Buffer.compare(await readFile(recordPath), original), 0);
    const store = createReconcileSnapshotStore(directory);
    assert.equal(
      Buffer.compare(await store.read(workspaceHash(target), sha256(damaged)), damaged),
      0,
      "the damaged bytes remain recoverable",
    );
    await untouched(others);
  });
});

test("restore refuses while the Graph app holds the record lock and changes nothing", async () => {
  await scenario(async ({ directory, key, original, recordPath, reconcile, target }) => {
    await reconcile();
    const before = await readFile(recordPath);
    const storeBefore = await createReconcileSnapshotStore(directory).list(workspaceHash(target));
    const host = createGraphRepository(directory); // 模拟仍在运行的 Host
    try {
      assert.equal(await host.acquireOwnership!(target), true);
      await assert.rejects(
        restoreGraphRecord({
          directory,
          workspaceKey: key,
          snapshot: sha256(original).slice(0, 12),
        }),
        /locked by a running ZCode Graph window/,
      );
    } finally {
      await host.dispose!();
    }
    assert.equal(Buffer.compare(await readFile(recordPath), before), 0);
    assert.deepEqual(
      await createReconcileSnapshotStore(directory).list(workspaceHash(target)),
      storeBefore,
    );
  });
});

test("restore validates the chosen snapshot: unknown, ambiguous, mismatched or newer-version snapshots are refused", async () => {
  await scenario(async ({ directory, key, original, recordPath, reconcile, target }) => {
    await reconcile();
    const before = await readFile(recordPath);
    const hash = workspaceHash(target);
    const store = createReconcileSnapshotStore(directory);
    const newer = Buffer.from(
      JSON.stringify({ ...JSON.parse(original.toString("utf8")), version: 6 }),
    );
    const newerSnapshot = await store.preserve(hash, newer);
    const garbage = await store.preserve(hash, Buffer.from("not a graph record"));
    const other = await store.preserve(
      hash,
      Buffer.from(
        JSON.stringify({ ...JSON.parse(original.toString("utf8")), workspaceKey: "elsewhere" }),
      ),
    );
    const attempts: Array<[string, RegExp]> = [
      ["deadbeef", /No such snapshot/],
      ["abc", /at least 8 characters/],
      [newerSnapshot.id.slice(0, 12), /newer, unsupported/],
      [garbage.id.slice(0, 12), /JSON|Unexpected/],
      // 严格校验拒绝：运行里的 target 与记录的 workspaceKey 不一致（ZodError，消息含 workspace）。
      [other.id.slice(0, 12), /workspace/],
    ];
    for (const [snapshot, pattern] of attempts)
      await assert.rejects(
        restoreGraphRecord({ directory, workspaceKey: key, snapshot }),
        pattern,
        snapshot,
      );
    assert.equal(
      Buffer.compare(await readFile(recordPath), before),
      0,
      "never changed by a refusal",
    );
    // 内容与身份不符的快照（被篡改）同样被拒绝。
    await writeFile(join(store.folder(hash), `${garbage.id}.json`), "tampered");
    await assert.rejects(
      restoreGraphRecord({ directory, workspaceKey: key, snapshot: garbage.id }),
      /does not match its identity/,
    );
  });
});

/** 把存储灌到上限：恢复源是其中最旧的一份，其余是别的内容。 */
async function fillToBound(directory: string, hash: string, source: Buffer) {
  const store = createReconcileSnapshotStore(directory);
  const saved = await store.preserve(hash, source);
  await utimes(saved.path, new Date(Date.now() - 10_000_000), new Date(Date.now() - 10_000_000));
  for (let index = 0; index < MAX_RECONCILE_SNAPSHOTS - 1; index++) {
    const filler = await store.preserve(hash, Buffer.from(`filler ${index}`));
    const when = new Date(Date.now() - (MAX_RECONCILE_SNAPSHOTS - index) * 100_000);
    await utimes(filler.path, when, when);
  }
  assert.equal((await store.list(hash)).length, MAX_RECONCILE_SNAPSHOTS);
  return store;
}

test("restore protects both its source and the just-preserved current record even when the store is at its bound", async () => {
  await scenario(async ({ directory, key, original, recordPath, target }) => {
    const hash = workspaceHash(target);
    const store = await fillToBound(directory, hash, original); // original 是最旧的一份
    const current = Buffer.from(
      JSON.stringify({ ...JSON.parse(original.toString("utf8")), note: "current" }),
    );
    await writeFile(recordPath, current);
    const result = await restoreGraphRecord({
      directory,
      workspaceKey: key,
      snapshot: sha256(original).slice(0, 12),
    });
    const ids = (await store.list(hash)).map((item) => item.id);
    assert.ok(ids.includes(sha256(original)), "the restore source survives the pruning");
    assert.ok(ids.includes(sha256(current)), "the pre-restore record survives the pruning");
    assert.equal(result.preservedCurrent?.id, sha256(current));
    assert.equal(
      ids.length,
      MAX_RECONCILE_SNAPSHOTS,
      "the bound still holds: an unprotected filler went instead",
    );
    assert.equal(Buffer.compare(await readFile(recordPath), original), 0);
    // 恢复之后普通保留规则照常适用（它们不是永久备份）：再保存足够多的新快照后，旧的会被挤出。
    for (let index = 0; index < MAX_RECONCILE_SNAPSHOTS; index++) {
      const later = await store.preserve(hash, Buffer.from(`later ${index}`));
      const when = new Date(Date.now() + (index + 1) * 1000);
      await utimes(later.path, when, when);
    }
    const after = (await store.list(hash)).map((item) => item.id);
    assert.equal(after.length, MAX_RECONCILE_SNAPSHOTS);
    assert.ok(!after.includes(sha256(original)), "ordinary retention applies afterwards");
  });
});

test(
  "if the replacement fails after the current record was preserved, both the source and the preserved record remain",
  { skip: process.platform !== "win32" && "read-only replacement is only enforced on Windows" },
  async () => {
    await scenario(async ({ directory, key, original, recordPath, target }) => {
      const hash = workspaceHash(target);
      const store = await fillToBound(directory, hash, original);
      const current = Buffer.from(
        JSON.stringify({ ...JSON.parse(original.toString("utf8")), note: "current" }),
      );
      await writeFile(recordPath, current);
      await chmod(recordPath, 0o444); // 原子替换会失败
      try {
        await assert.rejects(
          restoreGraphRecord({
            directory,
            workspaceKey: key,
            snapshot: sha256(original).slice(0, 12),
          }),
          /EPERM|EACCES|EBUSY/,
        );
      } finally {
        await chmod(recordPath, 0o666);
      }
      const ids = (await store.list(hash)).map((item) => item.id);
      assert.ok(ids.includes(sha256(original)));
      assert.ok(ids.includes(sha256(current)));
      assert.equal(
        Buffer.compare(await readFile(recordPath), current),
        0,
        "the record is exactly what it was",
      );
    });
  },
);
