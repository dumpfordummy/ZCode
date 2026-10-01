import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createGraphRepository, parseGraphRecordBytes, workspaceHash } from "./repository.js";
import {
  createReconcileSnapshotStore,
  realSnapshotIo,
  sha256,
  type SnapshotInfo,
} from "./reconcile-snapshots.js";

/**
 * Z8.2：Graph 记录的离线维护（操作员用，没有产品界面）。
 * 只处理 `<graph-engineering>/<sha256(workspaceKey)>.json` 这一个文件及其对账快照；
 * 不碰 artifacts、凭据、原生会话、项目文件或项目 .zcode/config.json。
 */

export interface RecordListing {
  workspaceKey?: string;
  file: string;
  recordVersion?: unknown;
  runs?: Array<{ id?: string; status?: string }>;
  unreadable?: string;
  snapshots: SnapshotInfo[];
}

export async function listGraphRecords(directory: string): Promise<RecordListing[]> {
  const store = createReconcileSnapshotStore(directory);
  const result: RecordListing[] = [];
  for (const name of (await readdir(directory)).sort()) {
    const match = /^([0-9a-f]{64})\.json$/.exec(name);
    if (!match) continue;
    const entry: RecordListing = { file: name, snapshots: await store.list(match[1]!) };
    try {
      const json = JSON.parse(await readFile(join(directory, name), "utf8")) as {
        workspaceKey?: string;
        version?: unknown;
        runs?: Array<{ id?: string; status?: string }>;
      };
      entry.workspaceKey = json.workspaceKey;
      entry.recordVersion = json.version;
      entry.runs = (json.runs ?? []).map((run) => ({ id: run.id, status: run.status }));
    } catch (error) {
      entry.unreadable = error instanceof Error ? error.message : String(error);
    }
    result.push(entry);
  }
  return result;
}

export interface RestoreResult {
  restoredSnapshot: string;
  preservedCurrent?: { id: string; created: boolean };
  bytes: number;
}

/**
 * 把一个对账快照恢复为工作区记录。必须在 Graph 应用/Host 关闭时运行：拿不到该记录的所有权锁就拒绝，且不改动任何东西。
 * 顺序：校验所选快照（与 read 同一解析器）→ 先保存当前记录（哪怕已损坏）→ 原子替换。
 */
export async function restoreGraphRecord(options: {
  directory: string;
  workspaceKey: string;
  snapshot: string;
}): Promise<RestoreResult> {
  const target = { workspacePath: options.workspaceKey };
  const repository = createGraphRepository(options.directory);
  if (!(await repository.acquireOwnership?.(target)))
    throw new Error(
      "The Graph record is locked by a running ZCode Graph window. Close ZCode Graph completely and try again; nothing was changed.",
    );
  try {
    const hash = workspaceHash(target);
    const store = createReconcileSnapshotStore(options.directory);
    const candidates = (await store.list(hash)).filter((item) =>
      item.id.startsWith(options.snapshot.toLowerCase()),
    );
    if (options.snapshot.length < 8 || candidates.length !== 1)
      throw new Error(
        candidates.length > 1
          ? "The snapshot prefix is ambiguous; use more characters."
          : "No such snapshot (use at least 8 characters of its id; see the list command).",
      );
    const snapshot = candidates[0]!;
    const bytes = await store.read(hash, snapshot.id); // 同时核对内容哈希
    parseGraphRecordBytes(bytes, target); // 严格校验；不可解析/更新版本的快照不会被恢复
    const recordPath = join(options.directory, `${hash}.json`);
    let current: Buffer | undefined;
    try {
      current = await readFile(recordPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const preserved = current ? await store.preserve(hash, current, [snapshot.id]) : undefined;
    await realSnapshotIo.writeAtomic(recordPath, bytes);
    if (sha256(await readFile(recordPath)) !== snapshot.id)
      throw new Error("Restore verification failed; the record may need another restore.");
    return {
      restoredSnapshot: snapshot.id,
      preservedCurrent: preserved && { id: preserved.id, created: preserved.created },
      bytes: bytes.length,
    };
  } finally {
    await repository.dispose?.();
  }
}
