import { createHash } from "node:crypto";
import type { GitCommandProvider } from "./providers/gitCommandProvider.js";

export const SOURCE_PATH_LIMIT = 64;
export const SOURCE_TEXT_BYTES = 128 * 1024;
export const SOURCE_DIFF_BYTES = 256 * 1024;
export const SOURCE_TOTAL_BYTES = 1024 * 1024;
export const SOURCE_MANIFEST_BYTES = 512 * 1024;

export interface SourceEntry {
  path: string;
  xy: string;
  beforeHash: string;
  indexHash: string;
  modes: string[];
  issue?: string;
}

export function sourceDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function sourceCommand(
  provider: GitCommandProvider,
  cwd: string,
  args: string[],
  maxOutputBytes = SOURCE_MANIFEST_BYTES,
): Promise<string> {
  const result = await provider.run({
    cwd,
    args: [
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      ...args,
    ],
    maxOutputBytes,
  });
  if (result.outputTruncated) throw new Error(`Git output exceeds ${maxOutputBytes / 1024} KiB.`);
  if (result.timedOut || result.exitCode !== 0)
    throw new Error("Git source evidence command failed or timed out.");
  if (result.stdout.includes("\uFFFD"))
    throw new Error("Git source evidence contains unsupported UTF-8 text.");
  return result.stdout;
}

export function parseSourceStatus(value: string): {
  head: string;
  entries: SourceEntry[];
  issues: string[];
} {
  const entries: SourceEntry[] = [];
  const issues: string[] = [];
  let head = "";
  for (const line of value.split("\0").filter(Boolean)) {
    if (line.startsWith("# branch.oid ")) {
      const oid = line.slice(13);
      head = oid === "(initial)" ? "unborn" : oid;
    } else if (line.startsWith("# ")) {
      continue;
    } else if (line.startsWith("? ")) {
      entries.push({ path: line.slice(2), xy: "??", beforeHash: "", indexHash: "", modes: [] });
    } else {
      const match = /^1 (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (.+)$/s.exec(line);
      if (!match) {
        issues.push("Unsupported or conflicted Git status record; evidence is incomplete.");
        continue;
      }
      const [, xy, sub, beforeMode, indexMode, workMode, beforeHash, indexHash, path] = match;
      if (!xy || !path || !beforeHash || !indexHash) continue;
      entries.push({
        path,
        xy,
        beforeHash,
        indexHash,
        modes: [beforeMode!, indexMode!, workMode!],
        ...(sub !== "N..."
          ? { issue: "Submodule evidence is unsupported." }
          : !/^[.MADT]{2}$/.test(xy)
            ? { issue: "Unsupported Git status transition." }
            : {}),
      });
    }
  }
  if (head !== "unborn" && !/^[a-f0-9]{40,64}$/.test(head))
    issues.push("Exact Git HEAD is unavailable.");
  return {
    head,
    entries: entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    issues,
  };
}

export function indexIssues(value: string): string[] {
  const issues: string[] = [];
  for (const record of value.split("\0").filter(Boolean)) {
    const match = /^(\S) (\d{6}) ([a-f0-9]+) (\d)\t(.+)$/s.exec(record);
    if (!match) {
      issues.push("Unsupported Git index record.");
      continue;
    }
    const [, flag, mode, , stage, path] = match;
    if (flag !== "H")
      issues.push(`${path}: sparse or assume-unchanged index entries are unsupported.`);
    if (stage !== "0") issues.push(`${path}: conflicted index entries are unsupported.`);
    if (mode !== "100644" && mode !== "100755")
      issues.push(`${path}: symbolic link, submodule or unsupported index mode ${mode}.`);
    if (issues.length >= SOURCE_PATH_LIMIT) break;
  }
  return issues;
}
