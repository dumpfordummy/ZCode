import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isSensitiveCredentialFileName } from "@zcode/shared";
import type { GraphStoreShapes } from "../app/support-bundle.js";
import { createWorkflowStore } from "./workflow-store.js";

/** 一次遍历最多访问的目录项数；超过即标记 truncated，不继续。 */
const MAX_VISITED_ENTRIES = 100_000;

interface TreeShape {
  present: boolean;
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
}

async function lstatOrUndefined(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

/**
 * 只数文件和字节：不读内容、不跟随符号链接、不进入名称为凭据文件的条目。
 * 结果与遍历顺序无关（求和与计数）。
 */
async function measureTree(root: string): Promise<TreeShape> {
  const rootStat = await lstatOrUndefined(root);
  if (!rootStat?.isDirectory())
    return {
      present: Boolean(rootStat),
      fileCount: 0,
      totalBytes: 0,
      truncated: false,
    };
  let fileCount = 0;
  let totalBytes = 0;
  let visited = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visited > MAX_VISITED_ENTRIES)
        return { present: true, fileCount, totalBytes, truncated: true };
      if (isSensitiveCredentialFileName(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) {
        fileCount += 1;
        totalBytes += (await lstat(path)).size;
      }
    }
  }
  return { present: true, fileCount, totalBytes, truncated: false };
}

/**
 * Z8.3-S1：Graph 数据目录里记录以外各存储的“形状”。只有存在性、大小、数量；不读取产物、快照或日志内容。
 * 工作流库经既有 createWorkflowStore 解析，只让条目数与修订号离开解析器。`workspaces/` 是项目副本，只数顶层条目。
 */
export function createGraphStoreInventory(directory: string): () => Promise<GraphStoreShapes> {
  return async () => {
    const libraryPath = join(directory, "workflow-library.json");
    const libraryStat = await lstatOrUndefined(libraryPath);
    let library: GraphStoreShapes["workflowLibrary"] = {
      present: false,
      bytes: 0,
      readable: true,
      revision: null,
      entryCount: null,
    };
    if (libraryStat?.isFile()) {
      library = {
        present: true,
        bytes: libraryStat.size,
        readable: false,
        revision: null,
        entryCount: null,
      };
      try {
        const { revision, entries } = await createWorkflowStore(directory).read();
        library = {
          ...library,
          readable: true,
          revision,
          entryCount: entries.length,
        };
      } catch {
        // 不可读只是一个事实；原因文本可能含路径或内容，不带出。
      }
    }
    const snapshotRoot = join(directory, "reconcile-snapshots");
    const snapshotTree = await measureTree(snapshotRoot);
    let snapshotWorkspaces = 0;
    if (snapshotTree.present)
      snapshotWorkspaces = (await readdir(snapshotRoot, { withFileTypes: true })).filter((entry) =>
        entry.isDirectory(),
      ).length;
    const parallelRoot = join(directory, "workspaces");
    const parallelStat = await lstatOrUndefined(parallelRoot);
    return {
      workflowLibrary: library,
      artifacts: await measureTree(join(directory, "artifacts")),
      reconcileSnapshots: {
        ...snapshotTree,
        workspaceCount: snapshotWorkspaces,
      },
      parallelWorkspaces: {
        present: Boolean(parallelStat),
        entryCount: parallelStat?.isDirectory() ? (await readdir(parallelRoot)).length : 0,
      },
    };
  };
}
