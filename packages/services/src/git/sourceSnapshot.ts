import type { GitSourceSnapshot } from "@zcode/shared";
import type { IFileService } from "../index.js";
import type { GitCliRepo } from "./repo/gitCliRepo.js";
import type { GitCommandProvider } from "./providers/gitCommandProvider.js";
import {
  readSourceBlob,
  readSourceWorktree,
  workspaceSourcePath,
} from "./sourceSnapshotContent.js";
import {
  indexIssues,
  parseSourceStatus,
  sourceCommand,
  sourceDigest,
  SOURCE_DIFF_BYTES,
  SOURCE_PATH_LIMIT,
  SOURCE_TOTAL_BYTES,
} from "./sourceSnapshotManifest.js";

const SOURCE_SCOPE =
  "Git changes and non-ignored untracked paths in the captured workspace; ignored and unchanged contents excluded. Limits: 64 paths, 128 KiB/text, 256 KiB/diff, 1 MiB retained content, 512 KiB/manifest.";
type SnapshotOptions = {
  repo: GitCliRepo;
  commandProvider: GitCommandProvider;
  fileService?: IFileService;
};

function unavailable(reason: string): GitSourceSnapshot {
  return {
    baseline: "unavailable",
    scope: SOURCE_SCOPE,
    files: [],
    complete: false,
    issues: [reason],
  };
}

async function captureOnce(
  options: SnapshotOptions,
  workspacePath: string,
): Promise<GitSourceSnapshot> {
  const { repo, commandProvider, fileService } = options;
  const resolution = await repo.resolveRepository(workspacePath);
  if (!resolution.isGitAvailable || !resolution.isRepository)
    return unavailable("A native Git repository is required for source evidence.");
  const status = await sourceCommand(commandProvider, workspacePath, [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "--ignore-submodules=none",
    "--no-renames",
    "-z",
    "--",
    ".",
  ]);
  const index = await sourceCommand(commandProvider, workspacePath, [
    "ls-files",
    "--stage",
    "-v",
    "-z",
    "--",
    ".",
  ]);
  const parsed = parseSourceStatus(status);
  const result: GitSourceSnapshot = {
    baseline: JSON.stringify({
      version: 1,
      head: parsed.head,
      index: sourceDigest(index),
      status: sourceDigest(status),
    }),
    scope: SOURCE_SCOPE,
    files: [],
    complete: false,
    issues: [...parsed.issues, ...indexIssues(index)],
  };
  if (parsed.entries.length > SOURCE_PATH_LIMIT)
    result.issues.push("Source evidence exceeds the 64 changed/untracked path limit.");
  let bytes = 0;
  for (const entry of parsed.entries.slice(0, SOURCE_PATH_LIMIT)) {
    let path: string;
    try {
      path = workspaceSourcePath(resolution.repoRoot, workspacePath, entry.path);
    } catch (error) {
      result.issues.push(error instanceof Error ? error.message : "Unsafe source path.");
      continue;
    }
    const sections =
      entry.xy === "??"
        ? ["untracked"]
        : [
            ...(entry.xy[0] !== "." ? [`staged:${entry.xy[0]}`] : []),
            ...(entry.xy[1] !== "." ? [`unstaged:${entry.xy[1]}`] : []),
          ];
    for (const status of sections) {
      const file: GitSourceSnapshot["files"][number] = { path, status };
      result.files.push(file);
      try {
        if (entry.issue) throw new Error(entry.issue);
        if (entry.modes.some((mode) => !["000000", "100644", "100755"].includes(mode)))
          throw new Error("Symbolic link, submodule or unsupported source mode.");
        if (bytes >= SOURCE_TOTAL_BYTES)
          throw new Error("Source evidence exceeds the 1 MiB total retained content limit.");
        const staged = status.startsWith("staged:");
        const beforeText = await readSourceBlob(
          commandProvider,
          workspacePath,
          staged ? entry.beforeHash : entry.indexHash,
        );
        const afterText = staged
          ? await readSourceBlob(commandProvider, workspacePath, entry.indexHash)
          : status === "unstaged:D"
            ? ""
            : await readSourceWorktree(fileService, workspacePath, path);
        const diff =
          status === "untracked"
            ? undefined
            : await sourceCommand(
                commandProvider,
                workspacePath,
                [
                  "diff",
                  ...(staged ? ["--cached"] : []),
                  "--no-ext-diff",
                  "--no-textconv",
                  "--no-color",
                  "--no-renames",
                  "--",
                  path,
                ],
                SOURCE_DIFF_BYTES,
              );
        const retained =
          Buffer.byteLength(beforeText) +
          Buffer.byteLength(afterText) +
          Buffer.byteLength(diff ?? "");
        if (bytes + retained > SOURCE_TOTAL_BYTES)
          throw new Error("Source evidence exceeds the 1 MiB total retained content limit.");
        bytes += retained;
        Object.assign(file, { beforeText, afterText, ...(diff !== undefined ? { diff } : {}) });
      } catch (error) {
        file.issue = (
          error instanceof Error ? error.message : "Source evidence is unreadable."
        ).slice(0, 500);
        result.issues.push(`${path} (${status}): ${file.issue}`);
      }
    }
  }
  result.complete = result.issues.length === 0;
  return result;
}

export function createGitSourceSnapshotReader(options: SnapshotOptions) {
  return async (workspacePath: string): Promise<GitSourceSnapshot> => {
    try {
      const first = await captureOnce(options, workspacePath);
      const second = await captureOnce(options, workspacePath);
      // 文件读写不受 Graph 元数据锁保护；二次独立读取不一致时不能冻结混合证据。
      if (JSON.stringify(first) !== JSON.stringify(second)) {
        first.complete = false;
        first.issues.push("Source evidence changed during capture; capture a new reviewed run.");
      }
      return first;
    } catch (error) {
      return unavailable(
        error instanceof Error ? error.message : "Native source evidence is unavailable.",
      );
    }
  };
}
