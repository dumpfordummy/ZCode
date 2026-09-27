import { lstat, realpath, opendir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import type { GraphProjectDiscovery } from "../project-setup-types.js";
import type { GraphWorkspaceTarget } from "../contract.js";
import { workspaceKey } from "../domain/definition.js";
import { readDeclaredFile } from "./artifact-files.js";
import { projectMetadata } from "../domain/project-metadata.js";

const excludedNames = new Set([
  ".git",
  ".zcode",
  "node_modules",
  "bin",
  "obj",
  "packages",
  ".vs",
  ".idea",
  "TestResults",
  ".tmp",
]);
const metadataName =
  /(?:\.(?:sln|slnx|csproj)$|^(?:global\.json|Directory\.(?:Build\.(?:props|targets)|Packages\.props))$)/i;
const sourceName = /\.(?:cs|csproj|props|targets|resx|xaml|sln|slnx)$/i;
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/** Sole ephemeral read-job owner. Cancellation cannot stop, retry or create an execution. */
export function createProjectDiscovery(limits: { maximumFiles?: number } = {}) {
  const jobs = new Map<string, { requestId: string; cancelled: boolean }>();
  return {
    cancelScan(target: GraphWorkspaceTarget, requestId: string) {
      const job = jobs.get(workspaceKey(target));
      if (job?.requestId === requestId) job.cancelled = true;
    },
    async scan(target: GraphWorkspaceTarget, requestId: string): Promise<GraphProjectDiscovery> {
      const key = workspaceKey(target),
        previous = jobs.get(key);
      if (previous) previous.cancelled = true;
      const job = { requestId, cancelled: false };
      jobs.set(key, job);
      const result: GraphProjectDiscovery = {
        kind: "discovery",
        requestId,
        status: "complete",
        digest: "",
        metadata: [],
        candidates: [],
        issues: [],
        excluded: [],
        limits: {
          files: limits.maximumFiles ?? 2048,
          depth: 8,
          metadataBytes: 512 * 1024,
          sourceFiles: 32,
        },
      };
      const metadata: Array<{ path: string; content: string }> = [],
        sources: string[] = [];
      let seen = 0,
        bytes = 0;
      try {
        const root = resolve(target.workspacePath),
          canonical = await realpath(root),
          info = await lstat(root);
        const same =
          process.platform === "win32"
            ? root.toLowerCase() === canonical.toLowerCase()
            : root === canonical;
        if (!info.isDirectory() || info.isSymbolicLink() || !same)
          throw new Error("Workspace link/reparse aliases are unsupported.");
        const queue = [{ path: "", depth: 0 }];
        while (queue.length && !job.cancelled && result.status !== "limited") {
          const directory = queue.shift()!;
          const directoryPath = join(root, directory.path),
            before = await lstat(directoryPath),
            canonical = await realpath(directoryPath);
          if (
            !before.isDirectory() ||
            before.isSymbolicLink() ||
            (process.platform === "win32"
              ? canonical.toLowerCase() !== directoryPath.toLowerCase()
              : canonical !== directoryPath)
          )
            throw new Error("Discovery directory was replaced by a link/reparse alias.");
          // 使用有界目录流，不先把大型目录全部读入内存；取消在每个枚举边界生效。
          const entries = await opendir(directoryPath, { bufferSize: 16 });
          for await (const entry of entries) {
            if (job.cancelled) break;
            if (++seen > result.limits.files) {
              result.status = "limited";
              result.issues.push("Discovery entry limit reached; inventory is incomplete.");
              break;
            }
            const path = directory.path ? `${directory.path}/${entry.name}` : entry.name;
            if (entry.isSymbolicLink()) {
              result.issues.push(`Skipped link/reparse entry: ${path}.`);
              continue;
            }
            if (entry.isDirectory()) {
              if (excludedNames.has(entry.name)) {
                result.excluded.push(path);
                continue;
              }
              if (directory.depth >= result.limits.depth) {
                result.status = "limited";
                result.issues.push(`Depth limit: ${path}.`);
                break;
              }
              // 枚举后的目录仍要核对真实路径，避免把被替换的链接递归到工作区外。
              const absolute = join(root, path),
                current = await lstat(absolute),
                actual = await realpath(absolute);
              if (
                current.isSymbolicLink() ||
                (process.platform === "win32"
                  ? actual.toLowerCase() !== absolute.toLowerCase()
                  : actual !== absolute)
              ) {
                result.issues.push(`Skipped changed link/reparse entry: ${path}.`);
                continue;
              }
              queue.push({ path, depth: directory.depth + 1 });
            } else if (entry.isFile()) {
              if (sourceName.test(entry.name) || entry.name === "global.json") sources.push(path);
              if (!metadataName.test(entry.name)) continue;
              try {
                const content = await readDeclaredFile(target, path, 64 * 1024);
                bytes += content.length;
                if (bytes > result.limits.metadataBytes || metadata.length >= 64) {
                  result.status = "limited";
                  result.issues.push("Metadata capacity reached; discovery is incomplete.");
                  break;
                }
                metadata.push({
                  path,
                  content: new TextDecoder("utf-8", { fatal: true }).decode(content),
                });
                result.metadata.push({ path, digest: digest(content), bytes: content.length });
              } catch (error) {
                result.status = "limited";
                result.issues.push(
                  `${path}: ${error instanceof Error ? error.message : "Unreadable metadata"}`,
                );
              }
            }
          }
          const after = await lstat(directoryPath),
            finalPath = await realpath(directoryPath);
          if (
            after.dev !== before.dev ||
            after.ino !== before.ino ||
            after.isSymbolicLink() ||
            finalPath !== canonical
          )
            throw new Error(
              "Discovery directory changed during enumeration; no inventory was published.",
            );
        }
        if (sources.length > result.limits.sourceFiles) {
          result.status = "limited";
          result.issues.push(
            "Source manifest exceeds 32-file fingerprint capacity; no truncated manifest can authorize verified checks.",
          );
        }
        metadata.sort((a, b) => a.path.localeCompare(b.path));
        result.metadata.sort((a, b) => a.path.localeCompare(b.path));
        result.excluded.sort();
        sources.sort();
        for (const file of metadata) {
          if (!/\.(?:sln|slnx|csproj)$/i.test(file.path)) continue;
          const candidate = projectMetadata(
            file.path,
            file.content,
            sources.slice(0, result.limits.sourceFiles).sort(),
          );
          if (result.status === "limited" || result.issues.length) {
            candidate.coverage = "unsupported";
            candidate.issues.push(...result.issues);
          }
          for (const reference of candidate.projects)
            if (!metadata.some((item) => item.path === reference)) {
              candidate.coverage = "unsupported";
              candidate.issues.push(`Referenced project was not safely discovered: ${reference}.`);
            }
          result.candidates.push(candidate);
        }
        if (job.cancelled) result.status = "cancelled";
        result.digest = digest(
          JSON.stringify({
            target,
            metadata: result.metadata,
            candidates: result.candidates,
            issues: result.issues,
            status: result.status,
          }),
        );
        return result;
      } finally {
        if (jobs.get(key) === job) jobs.delete(key);
      }
    },
  };
}
