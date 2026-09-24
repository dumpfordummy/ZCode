import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { recordSchema } from "../domain/record.js";
import { isZCodeFileLockTimeoutError } from "@zcode/shared";
import { acquireFileLock, atomicWritePrivateTextFile } from "@zcode/shared/node";

import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphRecord, GraphRepository } from "../app/ports.js";
import { validateDefinition, workspaceKey } from "../domain/definition.js";

export function createGraphRepository(directory: string): GraphRepository {
  const pathFor = (target: GraphWorkspaceTarget) =>
    join(directory, `${createHash("sha256").update(workspaceKey(target)).digest("hex")}.json`);
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
      let text: string;
      try {
        text = await readFile(pathFor(target), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      const parsed = recordSchema.parse(JSON.parse(text));
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
      })();
      writes.add(operation);
      void operation.finally(() => writes.delete(operation)).catch(() => {});
      return operation;
    },
  };
}
