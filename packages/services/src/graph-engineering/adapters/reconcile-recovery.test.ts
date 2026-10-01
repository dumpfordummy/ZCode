import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GraphEngineeringService } from "../app/service.js";
import type { GraphNativePort, GraphRepository } from "../app/ports.js";
import type { GraphWorkspaceTarget } from "../contract.js";
import { GraphRecordUnsupportedVersionError } from "../domain/record-version.js";
import { createGraphRepository, workspaceHash } from "./repository.js";
import { realSnapshotIo, sha256 } from "./reconcile-snapshots.js";

const fixtureUrl = (name: string) => new URL(`../app/fixtures/${name}`, import.meta.url);

/**
 * 只有只读的可用性探测（available）被允许；创建、发送、取消、观察、对账、检查等任何会触及原生运行时的调用
 * 都会被记录并抛错——加载与对账绝不应该做这些事。
 */
function countingNative() {
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

async function scenario(
  fixtureName: string,
  run: (context: {
    directory: string;
    target: GraphWorkspaceTarget;
    original: Buffer;
    recordPath: string;
    open(options?: {
      repository?: (real: GraphRepository) => GraphRepository;
      snapshotIo?: typeof realSnapshotIo;
    }): {
      service: GraphEngineeringService;
      native: ReturnType<typeof countingNative>;
      real: GraphRepository;
    };
    snapshotFiles(): Promise<string[]>;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "z82-recovery-"));
  const original = Buffer.from(await readFile(fixtureUrl(fixtureName)));
  const target = JSON.parse(original.toString("utf8")).runs[0].target as GraphWorkspaceTarget;
  const recordPath = join(directory, `${workspaceHash(target)}.json`);
  await writeFile(recordPath, original);
  const opened: GraphEngineeringService[] = [];
  const open: Parameters<typeof run>[0]["open"] = (options = {}) => {
    const real = createGraphRepository(directory, { snapshotIo: options.snapshotIo });
    const native = countingNative();
    let sequence = 0;
    const service = new GraphEngineeringService({
      repository: options.repository ? options.repository(real) : real,
      native: native.port,
      id: () => `id-${++sequence}`,
      now: () => 1_700_000_000_000,
    });
    opened.push(service);
    return { service, native, real };
  };
  try {
    await run({
      directory,
      target,
      original,
      recordPath,
      open,
      snapshotFiles: async () =>
        (
          await readdir(join(directory, "reconcile-snapshots", workspaceHash(target))).catch(
            () => [],
          )
        ).filter((name) => name.endsWith(".json")),
    });
  } finally {
    for (const service of opened) await service.disposeAndWait().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
}

test("a pending Z1 run is reconciled to Interrupted only after its exact original bytes are preserved", async () => {
  await scenario(
    "z1-pending.json",
    async ({ target, original, recordPath, open, snapshotFiles }) => {
      const { service, native } = open();
      const view = await service.getWorkspace(target);
      assert.equal(view.runs[0]!.status, "Interrupted");
      assert.deepEqual(native.calls, [], "load never touches the native runtime");
      const files = await snapshotFiles();
      assert.deepEqual(files, [`${sha256(original)}.json`]);
      const store = join(recordPath, "..", "reconcile-snapshots", workspaceHash(target), files[0]!);
      assert.equal(Buffer.compare(await readFile(store), original), 0, "snapshot = original bytes");
      const reconciled = JSON.parse(await readFile(recordPath, "utf8"));
      assert.equal(reconciled.runs[0].status, "Interrupted");
      assert.notEqual(sha256(await readFile(recordPath)), sha256(original));
    },
  );
});

test("a terminal record loads without any write and without creating a snapshot", async () => {
  await scenario(
    "z1-completed.json",
    async ({ target, original, recordPath, open, snapshotFiles, directory }) => {
      const { service, native } = open();
      const view = await service.getWorkspace(target);
      assert.equal(view.runs[0]!.status, "Completed");
      assert.deepEqual(native.calls, []);
      assert.equal(Buffer.compare(await readFile(recordPath), original), 0);
      assert.deepEqual(await snapshotFiles(), []);
      assert.ok(!(await readdir(directory)).includes("reconcile-snapshots"));
    },
  );
});

function failedLoad(
  service: GraphEngineeringService,
  target: GraphWorkspaceTarget,
  pattern: RegExp,
) {
  return assert.rejects(service.getWorkspace(target), pattern);
}

test("failure before the snapshot: a record that changed after it was read aborts the reconciliation", async () => {
  await scenario("z1-pending.json", async ({ target, recordPath, open, snapshotFiles }) => {
    const tampered = Buffer.concat([await readFile(recordPath), Buffer.from("\n")]);
    const { service, native } = open({
      repository: (real) => ({
        acquireOwnership: (t) => real.acquireOwnership!(t),
        dispose: () => real.dispose!(),
        write: (t, r) => real.write(t, r),
        snapshotBeforeReconcile: (t) => real.snapshotBeforeReconcile!(t),
        async read(t) {
          const record = await real.read(t);
          await writeFile(recordPath, tampered); // 读取之后文件又被外部改了
          return record;
        },
      }),
    });
    await failedLoad(service, target, /changed on disk after it was read/);
    assert.equal(Buffer.compare(await readFile(recordPath), tampered), 0, "nothing was written");
    assert.deepEqual(await snapshotFiles(), []);
    assert.deepEqual(native.calls, []);
  });
});

test("failure in the snapshot write: record untouched, no snapshot, deterministic retry", async () => {
  await scenario(
    "z1-pending.json",
    async ({ target, original, recordPath, open, snapshotFiles }) => {
      const first = open({
        snapshotIo: {
          ...realSnapshotIo,
          writeAtomic: async () => {
            throw new Error("injected snapshot write failure");
          },
        },
      });
      await failedLoad(first.service, target, /injected snapshot write failure/);
      await failedLoad(first.service, target, /injected snapshot write failure/); // 失败没有被缓存成半成品
      assert.equal(Buffer.compare(await readFile(recordPath), original), 0);
      assert.deepEqual(await snapshotFiles(), []);
      assert.deepEqual(first.native.calls, []);
      // 第一个 Host 仍持有记录所有权；先关闭它，重试才是一次新的冷加载（否则会以只读视图打开）。
      await first.service.disposeAndWait();
      const retry = open();
      assert.equal((await retry.service.getWorkspace(target)).runs[0]!.status, "Interrupted");
      assert.deepEqual(await snapshotFiles(), [`${sha256(original)}.json`]);
      assert.deepEqual(retry.native.calls, []);
    },
  );
});

test("failure after the snapshot but before the record write: original intact and recoverable, one snapshot after retry", async () => {
  await scenario(
    "z1-pending.json",
    async ({ target, original, recordPath, open, snapshotFiles }) => {
      const first = open({
        repository: (real) => ({
          acquireOwnership: (t) => real.acquireOwnership!(t),
          dispose: () => real.dispose!(),
          read: (t) => real.read(t),
          snapshotBeforeReconcile: (t) => real.snapshotBeforeReconcile!(t),
          async write() {
            throw new Error("injected record write failure");
          },
        }),
      });
      await failedLoad(first.service, target, /injected record write failure/);
      assert.equal(Buffer.compare(await readFile(recordPath), original), 0, "original untouched");
      assert.deepEqual(await snapshotFiles(), [`${sha256(original)}.json`], "original recoverable");
      assert.deepEqual(first.native.calls, []);
      await first.service.disposeAndWait();
      const retry = open();
      assert.equal((await retry.service.getWorkspace(target)).runs[0]!.status, "Interrupted");
      assert.deepEqual(
        await snapshotFiles(),
        [`${sha256(original)}.json`],
        "deduplicated: still one snapshot",
      );
      assert.deepEqual(retry.native.calls, []);
    },
  );
});

test(
  "failure in the atomic record replacement (read-only target): original intact, no partial record, retry succeeds",
  { skip: process.platform !== "win32" && "read-only replacement is only enforced on Windows" },
  async () => {
    await scenario(
      "z1-pending.json",
      async ({ target, original, recordPath, open, snapshotFiles }) => {
        await chmod(recordPath, 0o444);
        const first = open();
        await assert.rejects(first.service.getWorkspace(target), /EPERM|EACCES|EBUSY/);
        assert.equal(Buffer.compare(await readFile(recordPath), original), 0);
        assert.deepEqual(await snapshotFiles(), [`${sha256(original)}.json`]);
        assert.deepEqual(first.native.calls, []);
        assert.ok(
          !(await readdir(join(recordPath, ".."))).some((name) => name.endsWith(".tmp")),
          "no temporary file is left behind",
        );
        await first.service.disposeAndWait();
        await chmod(recordPath, 0o666);
        const retry = open();
        assert.equal((await retry.service.getWorkspace(target)).runs[0]!.status, "Interrupted");
        assert.deepEqual(await snapshotFiles(), [`${sha256(original)}.json`]);
      },
    );
  },
);

test("a record from a newer unsupported version is rejected unchanged with a readable error and no work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z82-newer-"));
  try {
    for (const mutate of [
      (json: Record<string, unknown>) => ({ ...json, version: 6 }),
      (json: Record<string, unknown>) => ({
        ...json,
        definition: { ...(json.definition as object), version: 9 },
      }),
    ]) {
      const original = JSON.parse(await readFile(fixtureUrl("z1-completed.json"), "utf8"));
      const target = original.runs[0].target as GraphWorkspaceTarget;
      const bytes = Buffer.from(JSON.stringify(mutate(original), null, 2));
      const recordPath = join(directory, `${workspaceHash(target)}.json`);
      await writeFile(recordPath, bytes);
      const native = countingNative();
      const service = new GraphEngineeringService({
        repository: createGraphRepository(directory),
        native: native.port,
        id: () => "id",
        now: () => 1,
      });
      try {
        await assert.rejects(service.getWorkspace(target), (error: unknown) => {
          assert.ok(error instanceof GraphRecordUnsupportedVersionError);
          assert.match(error.message, /newer, unsupported ZCode Graph version/);
          assert.ok(error.diagnostic.length > 0 && error.diagnostic.length <= 2000);
          assert.ok(error.cause, "authoritative validation error retained");
          return true;
        });
        assert.equal(
          Buffer.compare(await readFile(recordPath), bytes),
          0,
          "not rewritten or downgraded",
        );
        assert.deepEqual(native.calls, []);
        assert.ok(!(await readdir(directory)).includes("reconcile-snapshots"));
      } finally {
        await service.disposeAndWait();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("malformed data of a supported version stays a generic error, distinct from a newer version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z82-malformed-"));
  try {
    const original = JSON.parse(await readFile(fixtureUrl("z1-completed.json"), "utf8"));
    const target = original.runs[0].target as GraphWorkspaceTarget;
    delete original.definition;
    const bytes = Buffer.from(JSON.stringify(original));
    await writeFile(join(directory, `${workspaceHash(target)}.json`), bytes);
    const repository = createGraphRepository(directory);
    await assert.rejects(repository.read(target), (error: unknown) => {
      assert.ok(!(error instanceof GraphRecordUnsupportedVersionError));
      return true;
    });
    assert.equal(
      Buffer.compare(await readFile(join(directory, `${workspaceHash(target)}.json`)), bytes),
      0,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
