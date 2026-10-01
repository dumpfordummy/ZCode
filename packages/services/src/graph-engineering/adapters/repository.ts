import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { recordSchema } from "../domain/record.js";
import {
  GraphRecordUnsupportedVersionError,
  boundedDiagnostic,
  findNewerRecordVersion,
} from "../domain/record-version.js";
import { createReconcileSnapshotStore, sha256, type SnapshotIo } from "./reconcile-snapshots.js";
import { isZCodeFileLockTimeoutError } from "@zcode/shared";
import { acquireFileLock, atomicWritePrivateTextFile } from "@zcode/shared/node";

import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphRecord, GraphRepository } from "../app/ports.js";
import { validateDefinition, workspaceKey } from "../domain/definition.js";

/**
 * 把磁盘上的记录字节解析并校验为 GraphRecord。read 与恢复工具共用同一个解析器：
 * 更新的不支持版本得到专门的、有界的错误；其他任何问题仍是原来的通用校验错误。
 */
export function parseGraphRecordBytes(bytes: Buffer, target: GraphWorkspaceTarget): GraphRecord {
  const json: unknown = JSON.parse(bytes.toString("utf8"));
  const newer = findNewerRecordVersion(json);
  if (newer) {
    // 权威诊断：照常运行严格 schema，保留其问题列表；不放宽 schema，也不改写文件。
    const result = recordSchema.safeParse(json);
    throw new GraphRecordUnsupportedVersionError(
      newer,
      result.success ? "(schema accepted the record)" : boundedDiagnostic(result.error.issues),
      result.success ? undefined : result.error,
    );
  }
  const parsed = recordSchema.parse(json);
  if (parsed.workspaceKey !== workspaceKey(target))
    throw new Error("Graph workspace identity mismatch.");
  validateDefinition(parsed.definition);
  for (const run of parsed.runs) {
    validateDefinition(run.definition);
    if (
      workspaceKey(run.target) !== parsed.workspaceKey ||
      (run.version === undefined && run.inputId !== run.commandId) ||
      (run.version === undefined &&
        run.terminalProof &&
        run.terminalProof.sourceCommandId !== run.commandId)
    )
      throw new Error("Graph attempt correlation is invalid.");
  }
  return {
    definition: parsed.definition,
    runs: parsed.runs,
    ...(parsed.parallel ? { parallel: parsed.parallel } : {}),
    ...(parsed.parallelParent ? { parallelParent: parsed.parallelParent } : {}),
  };
}

export const workspaceHash = (target: GraphWorkspaceTarget) =>
  createHash("sha256").update(workspaceKey(target)).digest("hex");

export function createGraphRepository(
  directory: string,
  options: { snapshotIo?: SnapshotIo } = {},
): GraphRepository {
  const pathFor = (target: GraphWorkspaceTarget) =>
    join(directory, `${workspaceHash(target)}.json`);
  const snapshots = createReconcileSnapshotStore(directory, options.snapshotIo);
  // 最近一次成功 read 的原始字节：对账前快照保存的正是这份字节，而不是重新序列化的对象。
  const lastRead = new Map<string, { bytes: Buffer; digest: string }>();
  const owners = new Map<string, () => Promise<void>>();
  const acquisitions = new Map<string, Promise<boolean>>();
  const writes = new Set<Promise<void>>();
  let disposed = false;
  let disposal: Promise<void> | undefined;

  function acquireOwnership(target: GraphWorkspaceTarget): Promise<boolean> {
    if (disposed) return Promise.reject(new Error("Graph metadata repository is closed."));
    const key = workspaceKey(target);
    if (owners.has(key)) return Promise.resolve(true);
    const pending = acquisitions.get(key);
    if (pending) return pending;
    const operation = (async () => {
      await mkdir(directory, { recursive: true });
      let release: () => Promise<void>;
      try {
        release = await acquireFileLock(pathFor(target), [10], 1_000, 50);
      } catch (error) {
        if (isZCodeFileLockTimeoutError(error)) return false;
        throw error;
      }
      if (disposed) {
        await release();
        return false;
      }
      owners.set(key, release);
      return true;
    })();
    acquisitions.set(key, operation);
    void operation.finally(() => acquisitions.delete(key)).catch(() => {});
    return operation;
  }

  return {
    acquireOwnership,
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        // 同进程另一个窗口也可能写相同 JSON；必须等在途 rename 完成后才能交出锁。
        await Promise.allSettled([...acquisitions.values(), ...writes]);
        await Promise.all([...owners.values()].map((release) => release()));
        owners.clear();
      })();
      return disposal;
    },
    async read(target): Promise<GraphRecord | null> {
      let bytes: Buffer;
      try {
        bytes = await readFile(pathFor(target));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          lastRead.delete(workspaceKey(target));
          return null;
        }
        throw error;
      }
      const record = parseGraphRecordBytes(bytes, target);
      lastRead.set(workspaceKey(target), { bytes, digest: sha256(bytes) });
      return record;
    },
    /**
     * Z8.2：冷加载对账要改写既有记录之前，先保存刚才读到的原始字节。
     * 要求持有该记录的所有权锁；写入前重读磁盘并核对哈希，文件变过就中止。失败会抛出，调用方据此不做任何改动。
     */
    async snapshotBeforeReconcile(target) {
      const key = workspaceKey(target);
      if (!owners.has(key))
        throw new Error("Graph metadata ownership is required to snapshot a record.");
      const remembered = lastRead.get(key);
      if (!remembered)
        throw new Error(
          "No Graph record bytes were read; refusing to reconcile without a snapshot.",
        );
      const onDisk = await readFile(pathFor(target));
      if (sha256(onDisk) !== remembered.digest)
        throw new Error(
          "The Graph record changed on disk after it was read; reconciliation aborted.",
        );
      return snapshots.preserve(workspaceHash(target), remembered.bytes);
    },
    write(target, record): Promise<void> {
      const operation = (async () => {
        if (!(await acquireOwnership(target)))
          throw new Error("Graph metadata ownership belongs to another Host.");
        const value = recordSchema.parse({
          version:
            record.definition.version === 5 || record.runs.some((run) => run.version === 5)
              ? 5
              : record.definition.version === 4 || record.runs.some((run) => run.version === 4)
                ? 4
                : record.definition.version === 3 || record.runs.some((run) => run.version === 3)
                  ? 3
                  : record.definition.version !== undefined ||
                      record.runs.some((run) => run.version !== undefined)
                    ? 2
                    : 1,
          workspaceKey: workspaceKey(target),
          ...record,
        });
        // Windows 短暂读取占用已在原生运行及独立测试复现；复用既有有限原子替换重试，持有原 owner 锁且绝不重放命令。
        await atomicWritePrivateTextFile(pathFor(target), JSON.stringify(value, null, 2));
        lastRead.delete(workspaceKey(target)); // 磁盘字节已变；下一次对账必须先重新 read
      })();
      writes.add(operation);
      void operation.finally(() => writes.delete(operation)).catch(() => {});
      return operation;
    },
  };
}
