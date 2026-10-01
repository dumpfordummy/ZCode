import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GraphEngineeringService } from "../app/service.js";
import type { GraphNativePort } from "../app/ports.js";
import { createReconcileSnapshotStore, sha256 } from "./reconcile-snapshots.js";
import { createGraphRepository, workspaceHash } from "./repository.js";
import { createWorkflowStore } from "./workflow-store.js";

/**
 * Z8.2：旧版本二进制真实写出的数据（docs/graph-engineering/z8/fixtures/historical，来源见 PROVENANCE.json）
 * 由当前代码加载。这是代码级回归；不是安装器升级验收。fixture 不会被修改以通过测试，
 * 也没有“已知缺口”豁免：任何一个受支持的历史 fixture 读不出来，整个套件就失败。
 */
const historical = fileURLToPath(
  new URL("../../../../../docs/graph-engineering/z8/fixtures/historical/", import.meta.url),
);
const TERMINAL = new Set([
  "Completed",
  "Failed",
  "Cancelled",
  "Rejected",
  "NeedsHuman",
  "BudgetExhausted",
]);
const ALLOWED_CHANGES = [
  /^runs\.\d+\.(status|message|updatedAt)$/,
  /^runs\.\d+\..*\.resumeRequired$/,
  /^parallel\.runs\.\d+\.(phase|message|updatedAt)$/,
];

function diffPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object";
  if (!isObject(before) || !isObject(after) || Array.isArray(before) !== Array.isArray(after))
    return [prefix];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
    diffPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key),
  );
}

/** 只允许只读的可用性探测；其它任何原生调用都会被记录并抛错。 */
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

async function listAll(directory: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }))
    found.push(
      ...(entry.isDirectory()
        ? await listAll(join(directory, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`]),
    );
  return found.sort();
}

const provenance = JSON.parse(await readFile(join(historical, "PROVENANCE.json"), "utf8")) as {
  fixtures: Record<string, { workspaceIdentity: string; recordVersion: number }>;
};

for (const id of Object.keys(provenance.fixtures)) {
  test(`historical ${id}: the current code loads the old data as the Z8.2 contract requires`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "z82-historical-"));
    const service: { current?: GraphEngineeringService } = {};
    try {
      await cp(join(historical, id, "graph-engineering"), directory, { recursive: true });
      const filesBefore = await listAll(directory);
      const hashesBefore = new Map<string, string>();
      for (const file of filesBefore)
        hashesBefore.set(file, sha256(await readFile(join(directory, file))));
      const workspacePath = provenance.fixtures[id]!.workspaceIdentity;
      const recordName = `${workspaceHash({ workspacePath })}.json`;
      const originalBytes = await readFile(join(directory, recordName));
      const original = JSON.parse(originalBytes.toString("utf8"));
      const native = countingNative();
      service.current = new GraphEngineeringService({
        repository: createGraphRepository(directory),
        native: native.port,
        id: () => "id",
        now: () => 1_700_000_000_000,
      });
      const view = await service.current.getWorkspace({ workspacePath });
      assert.deepEqual(native.calls, [], "loading old data never touches the native runtime");
      assert.equal(view.runs.length, original.runs.length);
      const snapshots = await createReconcileSnapshotStore(directory).list(
        workspaceHash({ workspacePath }),
      );
      const afterRecord = await readFile(join(directory, recordName));
      const everyRunTerminal = original.runs.every((run: { status: string }) =>
        TERMINAL.has(run.status),
      );
      if (everyRunTerminal) {
        assert.equal(
          Buffer.compare(afterRecord, originalBytes),
          0,
          "terminal history is not rewritten",
        );
        assert.deepEqual(snapshots, [], "nothing to reconcile, so nothing to snapshot");
        assert.deepEqual(
          view.runs.map((run) => run.status),
          original.runs.map((run: { status: string }) => run.status),
        );
      } else if (Buffer.compare(afterRecord, originalBytes) === 0) {
        // 旧应用自己已经写成 Interrupted/AwaitingContinuation：冷加载无需任何持久化变化，
        // 所以字节、updatedAt 和快照集合都保持不变（Z8.2 幂等对账）。
        for (const run of view.runs)
          assert.ok(["Interrupted", "AwaitingContinuation"].includes(run.status), run.status);
        assert.deepEqual(snapshots, [], "a no-op reconciliation creates no snapshot");
      } else {
        for (const run of view.runs)
          assert.ok(["Interrupted", "AwaitingContinuation"].includes(run.status), run.status);
        assert.ok(
          snapshots.some((item) => item.id === sha256(originalBytes)),
          "the exact original bytes are preserved before the reconciled record is written",
        );
        assert.equal(
          Buffer.compare(
            await createReconcileSnapshotStore(directory).read(
              workspaceHash({ workspacePath }),
              sha256(originalBytes),
            ),
            originalBytes,
          ),
          0,
        );
        const changed = diffPaths(original, JSON.parse(afterRecord.toString("utf8")));
        for (const path of changed)
          assert.ok(
            ALLOWED_CHANGES.some((pattern) => pattern.test(path)),
            `unexpected change to the old record: ${path}`,
          );
        // 不批准、不改答案：任何审批尝试的状态都保持原样。
        original.runs.forEach(
          (run: { approvalAttempts?: Array<{ status: string }> }, index: number) =>
            assert.deepEqual(
              (JSON.parse(afterRecord.toString("utf8")).runs[index].approvalAttempts ?? []).map(
                (attempt: { status: string }) => attempt.status,
              ),
              (run.approvalAttempts ?? []).map((attempt) => attempt.status),
            ),
        );
      }
      // 记录之外的每个 Graph 文件（产物、工作流库）都逐字节不变；只允许多出快照目录。
      for (const [file, hash] of hashesBefore)
        if (file !== recordName)
          assert.equal(sha256(await readFile(join(directory, file))), hash, file);
      const filesAfter = await listAll(directory);
      assert.deepEqual(
        // 所有权锁文件只在 Host 存活期间存在，不是数据。
        filesAfter.filter(
          (file) =>
            !filesBefore.includes(file) &&
            !file.startsWith("reconcile-snapshots/") &&
            !file.includes(".lock/"),
        ),
        [],
      );
    } finally {
      await service.current?.disposeAndWait().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("historical workflow library keeps every user version exactly and synthesizes nothing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "z82-historical-library-"));
  try {
    await cp(join(historical, "z75-library-user-versions", "graph-engineering"), directory, {
      recursive: true,
    });
    const bytes = await readFile(join(directory, "workflow-library.json"));
    const parsed = JSON.parse(bytes.toString("utf8"));
    const loaded = await createWorkflowStore(directory).read();
    assert.equal(loaded.revision, parsed.revision);
    assert.deepEqual(loaded.entries, parsed.entries, "versions are exactly what the old app wrote");
    assert.ok(
      loaded.entries.some((entry: { versions: unknown[] }) => entry.versions.length > 0),
      "the fixture really contains user-version data",
    );
    assert.equal(
      Buffer.compare(await readFile(join(directory, "workflow-library.json")), bytes),
      0,
      "reading never rewrites the library",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
