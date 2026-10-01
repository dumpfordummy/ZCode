import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat, utimes } from "node:fs/promises";
import { join } from "node:path";

/** 每个工作区最多保留的冷加载对账快照数；超过后只修剪本机制创建的最旧快照。 */
export const MAX_RECONCILE_SNAPSHOTS = 20;
const SNAPSHOT_NAME = /^[0-9a-f]{64}\.json$/;

/** 可注入的文件操作，仅用于在一次性测试数据上注入故障；生产使用真实文件系统。 */
export interface SnapshotIo {
  readFile(path: string): Promise<Buffer>;
  /** 临时文件 + fsync + 原子改名；调用方保证内容就是要保存的字节。 */
  writeAtomic(path: string, bytes: Buffer): Promise<void>;
  touch(path: string): Promise<void>;
}

export const realSnapshotIo: SnapshotIo = {
  readFile: (path) => readFile(path),
  async writeAtomic(path, bytes) {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Windows 上杀毒/索引器可能短暂占用目标文件：有限次重试可重试的错误，其余错误立即抛出。
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt < 5 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    }
  },
  async touch(path) {
    const now = new Date();
    await utimes(path, now, now);
  },
};

export const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export interface SnapshotInfo {
  id: string;
  bytes: number;
  modifiedMs: number;
}

/**
 * 冷加载对账前快照存储：`<graph-engineering>/reconcile-snapshots/<sha256(workspaceKey)>/<sha256(字节)>.json`。
 * 内容寻址 = 相同内容只存一份；快照永远是磁盘上原始字节，不是重新序列化的对象。
 */
export function createReconcileSnapshotStore(directory: string, io: SnapshotIo = realSnapshotIo) {
  const root = join(directory, "reconcile-snapshots");
  const folder = (workspaceHash: string) => join(root, workspaceHash);

  async function list(workspaceHash: string): Promise<SnapshotInfo[]> {
    let names: string[];
    try {
      names = await readdir(folder(workspaceHash));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const result: SnapshotInfo[] = [];
    for (const name of names) {
      if (!SNAPSHOT_NAME.test(name)) continue;
      const info = await stat(join(folder(workspaceHash), name));
      if (info.isFile())
        result.push({ id: name.slice(0, 64), bytes: info.size, modifiedMs: info.mtimeMs });
    }
    return result.sort((a, b) => b.modifiedMs - a.modifiedMs || a.id.localeCompare(b.id));
  }

  /** 保存（或确认已存在）这些字节的快照，然后做有界修剪。任何一步失败都抛出。 */
  async function preserve(workspaceHash: string, bytes: Buffer, alsoKeep: readonly string[] = []) {
    const id = sha256(bytes);
    const target = join(folder(workspaceHash), `${id}.json`);
    await mkdir(folder(workspaceHash), { recursive: true });
    let created = true;
    let existing: Buffer | undefined;
    try {
      existing = await io.readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existing && sha256(existing) === id) {
      created = false;
      await io.touch(target); // 只刷新修改时间（元数据），内容不重写
    } else {
      // 不存在，或同名文件内容与名字不符（损坏）：原子替换为正确字节
      await io.writeAtomic(target, bytes);
      const written = await io.readFile(target);
      if (sha256(written) !== id) throw new Error("Reconcile snapshot verification failed.");
    }
    await prune(workspaceHash, new Set([id, ...alsoKeep]));
    return { id, path: target, created };
  }

  /** 只修剪本机制创建的、超出上限的最旧快照；不修剪刚保存/确认的那一份。 */
  async function prune(workspaceHash: string, keep: ReadonlySet<string>) {
    const all = await list(workspaceHash);
    for (const old of all.slice(MAX_RECONCILE_SNAPSHOTS)) {
      if (keep.has(old.id)) continue;
      await rm(join(folder(workspaceHash), `${old.id}.json`), { force: true });
    }
  }

  async function read(workspaceHash: string, id: string): Promise<Buffer> {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("Invalid snapshot id.");
    const bytes = await io.readFile(join(folder(workspaceHash), `${id}.json`));
    if (sha256(bytes) !== id) throw new Error("Snapshot content does not match its identity.");
    return bytes;
  }

  return { list, preserve, read, folder, root };
}
export type ReconcileSnapshotStore = ReturnType<typeof createReconcileSnapshotStore>;
