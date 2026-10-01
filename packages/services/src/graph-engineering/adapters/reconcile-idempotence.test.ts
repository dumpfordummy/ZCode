import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GraphEngineeringService } from "../app/service.js";
import type { GraphNativePort } from "../app/ports.js";
import type { GraphWorkspaceTarget } from "../contract.js";
import {
  MAX_RECONCILE_SNAPSHOTS,
  createReconcileSnapshotStore,
  sha256,
} from "./reconcile-snapshots.js";
import { createGraphRepository, workspaceHash } from "./repository.js";

/**
 * Z8.2 修正：冷加载对账必须幂等。已经处于“对账结果”的记录，再次打开不改字节、不改 updatedAt、
 * 不新增/刷新快照、不触发保留修剪；真正的变化仍然先做精确字节快照。
 */
const historical = fileURLToPath(
  new URL("../../../../../docs/graph-engineering/z8/fixtures/historical/", import.meta.url),
);

function silentNative() {
  const calls: string[] = [];
  const port = new Proxy(
    {},
    {
      get: (_target, name) => async () => {
        if (name === "available") return { available: true };
        calls.push(String(name));
        throw new Error(`native ${String(name)} must not be called during load`);
      },
    },
  ) as GraphNativePort;
  return { port, calls };
}

async function withFixture(
  id: string,
  run: (context: {
    directory: string;
    target: GraphWorkspaceTarget;
    recordPath: string;
    original: Buffer;
    snapshotDirectory: string;
    openOnce(now: number): Promise<{ statuses: string[]; nativeCalls: string[] }>;
    snapshotState(): Promise<Array<{ name: string; mtimeMs: number; sha: string }>>;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "z82-idempotent-"));
  try {
    await cp(join(historical, id, "graph-engineering"), directory, { recursive: true });
    const recordName = (await readdir(directory)).find((name) =>
      /^[0-9a-f]{64}\.json$/.test(name),
    )!;
    const recordPath = join(directory, recordName);
    const original = await readFile(recordPath);
    const target = { workspacePath: JSON.parse(original.toString("utf8")).workspaceKey };
    const snapshotDirectory = join(directory, "reconcile-snapshots", workspaceHash(target));
    await run({
      directory,
      target,
      recordPath,
      original,
      snapshotDirectory,
      // 每次都是全新的 Host：新的仓库适配器、新的服务、真实文件系统，然后完整关闭。
      async openOnce(now) {
        const native = silentNative();
        const service = new GraphEngineeringService({
          repository: createGraphRepository(directory),
          native: native.port,
          id: () => "id",
          now: () => now,
        });
        try {
          const view = await service.getWorkspace(target);
          return { statuses: view.runs.map((r) => r.status), nativeCalls: native.calls };
        } finally {
          await service.disposeAndWait();
        }
      },
      async snapshotState() {
        const names = await readdir(snapshotDirectory).catch(() => [] as string[]);
        return Promise.all(
          names.sort().map(async (name) => ({
            name,
            mtimeMs: (await stat(join(snapshotDirectory, name))).mtimeMs,
            sha: sha256(await readFile(join(snapshotDirectory, name))),
          })),
        );
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const COLD_LOADS = 50;

for (const id of [
  "z22-permission-pending-prereconcile", // -> Interrupted
  "z22-question-pending-prereconcile", // -> Interrupted
  "z75-approval-pending-prereconcile", // -> AwaitingContinuation（带 resumeRequired 的关口）
  "z22-permission-interrupted-after-old-restart", // 旧应用自己已写成 Interrupted：第一次就是空操作
]) {
  test(`${id}: ${COLD_LOADS} independent cold loads leave the stabilized record and snapshot set unchanged and keep the original`, async () => {
    await withFixture(id, async (ctx) => {
      const first = await ctx.openOnce(1_700_000_000_000);
      assert.deepEqual(first.nativeCalls, []);
      const stabilized = await readFile(ctx.recordPath);
      const afterFirst = await ctx.snapshotState();
      const firstChangedBytes = Buffer.compare(stabilized, ctx.original) !== 0;
      if (firstChangedBytes) {
        // 第一次必需的转换：精确的原始字节先被保存。
        assert.ok(afterFirst.some((s) => s.sha === sha256(ctx.original)));
        assert.equal(afterFirst.length, 1);
      } else {
        assert.deepEqual(afterFirst, [], "no change required, so no snapshot at all");
      }
      for (let load = 1; load <= COLD_LOADS; load++) {
        // 时钟每次都前进：如果对账还会写 updatedAt，字节一定会变。
        const again = await ctx.openOnce(1_700_000_000_000 + load * 60_000);
        assert.deepEqual(again.statuses, first.statuses);
        assert.deepEqual(again.nativeCalls, []);
      }
      assert.equal(Buffer.compare(await readFile(ctx.recordPath), stabilized), 0, "record bytes");
      assert.deepEqual(await ctx.snapshotState(), afterFirst, "snapshot names, bytes and mtimes");
      if (firstChangedBytes) {
        const store = createReconcileSnapshotStore(ctx.directory);
        assert.equal(
          Buffer.compare(
            await store.read(workspaceHash(ctx.target), sha256(ctx.original)),
            ctx.original,
          ),
          0,
          "the genuine pre-upgrade snapshot survived all no-op opens",
        );
      }
      assert.ok(afterFirst.length < MAX_RECONCILE_SNAPSHOTS);
    });
  });
}

test("a genuine later recovery change still snapshots the bytes it replaces, and the original is kept", async () => {
  await withFixture("z75-approval-pending-prereconcile", async (ctx) => {
    await ctx.openOnce(1_700_000_000_000);
    const stabilized = await readFile(ctx.recordPath);
    const first = await ctx.snapshotState();
    assert.equal(first.length, 1);
    // 之后又出现真实的、需要持久化的变化：关口的 resumeRequired 过期（状态仍是 AwaitingContinuation）。
    const json = JSON.parse(stabilized.toString("utf8"));
    const gates = JSON.stringify(json).match(/"resumeRequired":true/g) ?? [];
    assert.ok(gates.length >= 1, "the fixture has a resumable gate");
    const stale = Buffer.from(
      JSON.stringify(json, null, 2).replace(/"resumeRequired": true/g, '"resumeRequired": false'),
    );
    assert.notEqual(sha256(stale), sha256(stabilized));
    await writeFile(ctx.recordPath, stale);
    const reopened = await ctx.openOnce(1_700_000_900_000);
    assert.deepEqual(
      reopened.statuses,
      ["AwaitingContinuation"],
      "status alone does not bypass the check",
    );
    const after = await ctx.snapshotState();
    assert.ok(
      after.some((s) => s.sha === sha256(stale)),
      "the stale bytes were preserved first",
    );
    assert.ok(
      after.some((s) => s.sha === sha256(ctx.original)),
      "the original is still there",
    );
    assert.equal(after.length, 2);
    assert.ok(
      JSON.stringify(JSON.parse(await readFile(ctx.recordPath, "utf8"))).includes(
        '"resumeRequired":true',
      ),
    );
    // 再打开 50 次：又稳定了。
    const stableBytes = await readFile(ctx.recordPath);
    for (let load = 1; load <= COLD_LOADS; load++)
      await ctx.openOnce(1_700_001_000_000 + load * 60_000);
    assert.equal(Buffer.compare(await readFile(ctx.recordPath), stableBytes), 0);
    assert.deepEqual(await ctx.snapshotState(), after);
  });
});

test("an Interrupted status with a resumable gate is not skipped: it becomes AwaitingContinuation and snapshots", async () => {
  await withFixture("z75-approval-pending-prereconcile", async (ctx) => {
    await ctx.openOnce(1_700_000_000_000);
    const json = JSON.parse((await readFile(ctx.recordPath)).toString("utf8"));
    const run = json.runs[0];
    assert.equal(run.status, "AwaitingContinuation");
    run.status = "Interrupted";
    const text = JSON.stringify(json, null, 2).replace(
      /"resumeRequired": true/g,
      '"resumeRequired": false',
    );
    const downgraded = Buffer.from(text);
    await writeFile(ctx.recordPath, downgraded);
    const reopened = await ctx.openOnce(1_700_000_500_000);
    assert.deepEqual(reopened.statuses, ["AwaitingContinuation"]);
    assert.ok((await ctx.snapshotState()).some((s) => s.sha === sha256(downgraded)));
  });
});

test("a terminal record is never rewritten and never snapshotted by any number of opens", async () => {
  await withFixture("z75-reviewer-pass-over-failing-test-needs-human", async (ctx) => {
    for (let load = 0; load < 10; load++) await ctx.openOnce(1_700_000_000_000 + load * 1000);
    assert.equal(Buffer.compare(await readFile(ctx.recordPath), ctx.original), 0);
    assert.deepEqual(await ctx.snapshotState(), []);
    const directoryEntries = await readdir(ctx.directory);
    assert.ok(!directoryEntries.includes("reconcile-snapshots"));
  });
});
