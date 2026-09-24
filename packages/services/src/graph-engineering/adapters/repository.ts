import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { modelSelectionSchema, isZCodeFileLockTimeoutError } from "@zcode/shared";
import { acquireFileLock } from "@zcode/shared/node";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import type { GraphWorkspaceTarget } from "../contract.js";
import type { GraphRecord, GraphRepository } from "../app/ports.js";
import {
  definitionSchema,
  targetSchema,
  validateDefinition,
  workspaceKey,
} from "../domain/definition.js";

const runSchema = z
  .object({
    id: z.string().min(1),
    attemptId: z.string().min(1),
    requestId: z.string().min(1),
    target: targetSchema,
    definition: definitionSchema,
    modelSelection: modelSelectionSchema,
    mode: submissionModeSchema,
    planEnabled: z.boolean().optional(),
    commandId: z.string().min(1),
    inputId: z.string().min(1),
    sessionId: z.string().min(1).optional(),
    runtimeIdentity: z.string().min(1).optional(),
    foregroundExecutionId: z.string().min(1).optional(),
    status: z.enum([
      "Starting",
      "Running",
      "WaitingForPermission",
      "WaitingForUser",
      "CancelRequested",
      "Completed",
      "Failed",
      "Cancelled",
      "Interrupted",
      "Unknown",
    ]),
    createdAt: z.number().finite().nonnegative(),
    updatedAt: z.number().finite().nonnegative(),
    message: z.string().optional(),
    terminalProof: z
      .object({
        sourceCommandId: z.string().min(1),
        state: z.enum(["completedSuccess", "completedInterrupted", "failed"]),
        logEpoch: z.string().min(1),
        seq: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((run, context) => {
    const state =
      run.status === "Completed"
        ? "completedSuccess"
        : run.status === "Cancelled"
          ? "completedInterrupted"
          : run.status === "Failed"
            ? "failed"
            : undefined;
    if (
      run.updatedAt < run.createdAt ||
      run.inputId !== run.commandId ||
      (state && (!run.sessionId || !run.runtimeIdentity || run.terminalProof?.state !== state)) ||
      (run.terminalProof && (!state || run.terminalProof.sourceCommandId !== run.commandId))
    ) {
      context.addIssue({
        code: "custom",
        message: "Graph attempt terminal proof or correlation is invalid.",
      });
    }
  });
const recordSchema = z
  .object({
    version: z.literal(1),
    workspaceKey: z.string(),
    definition: definitionSchema,
    runs: z.array(runSchema),
  })
  .strict()
  .superRefine((record, context) => {
    for (const key of ["id", "attemptId", "requestId", "sessionId", "commandId"] as const) {
      const ids = record.runs.flatMap((run) => (run[key] ? [run[key]] : []));
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: "custom", message: `Duplicate graph ${key}.` });
    }
    if (record.runs.some((run) => run.definition.revision > record.definition.revision))
      context.addIssue({
        code: "custom",
        message: "Graph run references an unavailable revision.",
      });
  });

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
          run.inputId !== run.commandId ||
          (run.terminalProof && run.terminalProof.sourceCommandId !== run.commandId)
        )
          throw new Error("Graph attempt correlation is invalid.");
      }
      return { definition: parsed.definition, runs: parsed.runs };
    },
    write(target, record): Promise<void> {
      const operation = (async () => {
        if (!(await acquireOwnership(target)))
          throw new Error("Graph metadata ownership belongs to another Host.");
        const value = recordSchema.parse({
          version: 1,
          workspaceKey: workspaceKey(target),
          ...record,
        });
        await mkdir(directory, { recursive: true });
        const destination = pathFor(target);
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(value, null, 2), {
            encoding: "utf8",
            flag: "wx",
          });
          await rename(temporary, destination);
        } finally {
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
      })();
      writes.add(operation);
      void operation.finally(() => writes.delete(operation)).catch(() => {});
      return operation;
    },
  };
}
