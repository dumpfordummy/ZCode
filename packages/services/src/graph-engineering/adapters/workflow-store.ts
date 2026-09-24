import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { acquireFileLock, atomicWritePrivateTextFile } from "@zcode/shared/node";
import { libraryStoreSchema } from "../domain/workflow-schema.js";
import type { GraphLibraryStore } from "../app/workflow-ports.js";

export function createWorkflowStore(directory: string): GraphLibraryStore {
  const path = join(directory, "workflow-library.json");
  async function read() {
    try {
      const text = await readFile(path, "utf8");
      if (text.length > 16_000_000) throw new Error("Workflow library exceeds its storage limit.");
      const { revision, entries } = libraryStoreSchema.parse(JSON.parse(text));
      return { revision, entries };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { revision: 0, entries: [] };
      throw error;
    }
  }
  return {
    read,
    async change(expectedRevision, change) {
      await mkdir(directory, { recursive: true });
      const release = await acquireFileLock(path, [10, 25, 50], 1000, 50);
      try {
        const current = await read();
        if (current.revision !== expectedRevision)
          throw new Error("Workflow library revision changed; refresh before saving.");
        const entries = structuredClone(current.entries);
        change(entries);
        const result = libraryStoreSchema.parse({
          version: 1,
          revision: current.revision + 1,
          entries,
        });
        const text = JSON.stringify(result, null, 2);
        if (text.length > 16_000_000)
          throw new Error("Workflow library exceeds its storage limit.");
        await atomicWritePrivateTextFile(path, text);
        return { revision: result.revision, entries: structuredClone(result.entries) };
      } finally {
        await release();
      }
    },
  };
}
