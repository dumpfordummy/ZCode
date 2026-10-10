import { createHash } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type { GraphWorkspaceTarget } from "../contract.js";
import type {
  GraphProjectCandidate,
  GraphProjectDiscovery,
  GraphProjectProgress,
} from "../project-setup-types.js";
import {
  PROJECT_INVENTORY_BUDGET as defaults,
  PROJECT_SCOPE_BUDGET,
} from "../domain/project-budgets.js";
import { projectMetadata } from "../domain/project-metadata.js";
import { addQuickProjectMetadata } from "../domain/project-quick.js";
import { validateGraphRelativePath } from "../domain/artifact-schemas.js";
import { readDeclaredFile } from "./artifact-files.js";

export const metadataName =
  /(?:\.(?:sln|slnx|csproj)$|^(?:global\.json|Directory\.(?:Build\.(?:props|targets|rsp)|Solution\.(?:props|targets)|Packages\.props)|(?:before|after)\..*\.slnx?\.targets|NuGet\.Config|\.editorconfig)$)/i;
export const excludedNames = new Set([".git", ".zcode", "bin", "obj"]);
export const projectDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const pathKey = (path: string) => path.toLowerCase();
const same = (a: string, b: string) =>
  process.platform === "win32" ? pathKey(a) === pathKey(b) : a === b;
export class ProjectJobStopped extends Error {}

/** A job owns all transient counters. No mutable scan state is shared with execution. */
export class ProjectScanJob {
  cancelled = false;
  readonly started = Date.now();
  readonly limits: { -readonly [K in keyof typeof defaults]: number };
  readonly result: GraphProjectDiscovery;
  readonly progress: GraphProjectProgress;
  readonly contents = new Map<string, string>();
  readonly candidates = new Map<string, GraphProjectCandidate>();
  readonly identities = new Map<string, string>();
  private readonly diagnostics = new Set<string>();
  private edges = 0;
  private metadataAttempts = 0;
  private serializedMetadataBytes = 0;
  private readonly visitedDirectories = new Map<
    string,
    { dev: number; ino: number; mtimeMs: number; canonical: string }
  >();
  constructor(
    readonly target: GraphWorkspaceTarget,
    requestId: string,
    maximumFiles?: number,
  ) {
    this.limits = { ...defaults, entries: maximumFiles ?? defaults.entries };
    this.progress = {
      kind: "scan-progress",
      requestId,
      stage: "inventory",
      entries: 0,
      metadata: 0,
      bytes: 0,
    };
    this.result = {
      kind: "discovery",
      requestId,
      status: "complete",
      digest: "",
      metadata: [],
      candidates: [],
      issues: [],
      excluded: [],
      limits: {
        files: this.limits.entries,
        depth: this.limits.depth,
        metadataBytes: this.limits.metadataBytes,
        sourceFiles: PROJECT_SCOPE_BUDGET.sourceFiles,
      },
    };
  }
  check() {
    if (this.cancelled) throw new ProjectJobStopped("Scan cancelled; inventory is incomplete.");
    if (Date.now() - this.started > this.limits.elapsedMs)
      throw new ProjectJobStopped(
        `Scan time budget reached (${this.limits.elapsedMs} ms); retry a narrower scope.`,
      );
  }
  issue(message: string) {
    this.result.status = "limited";
    const bounded = message.slice(0, this.limits.diagnosticCharacters);
    if (this.diagnostics.has(bounded)) return;
    if (this.result.issues.length < this.limits.diagnostics) {
      this.diagnostics.add(bounded);
      this.result.issues.push(bounded);
    } else
      this.result.issues[this.limits.diagnostics - 1] =
        "Additional diagnostics omitted; choose a narrower scope.";
  }
  async directory(path: string) {
    this.check();
    if (path) validateGraphRelativePath(path);
    const absolute = resolve(this.target.workspacePath, path);
    const info = await lstat(absolute),
      canonical = await realpath(absolute);
    if (!info.isDirectory() || info.isSymbolicLink() || !same(absolute, canonical))
      throw Error(`Unsafe directory link/reparse alias: ${path || "."}.`);
    return { info, canonical, absolute };
  }
  async metadata(path: string): Promise<GraphProjectCandidate | undefined> {
    this.check();
    const key = pathKey(path),
      previous = this.identities.get(key);
    if (previous && previous !== path)
      throw Error(`Ambiguous case/alias metadata: ${path} and ${previous}.`);
    if (this.contents.has(key)) return this.candidates.get(key);
    if (++this.metadataAttempts > this.limits.metadataRecords)
      throw new ProjectJobStopped(
        `Metadata record budget reached (${this.limits.metadataRecords}).`,
      );
    const remaining = this.limits.metadataBytes - this.progress.bytes;
    if (remaining <= 0)
      throw new ProjectJobStopped(
        `Metadata byte budget reached (${this.limits.metadataBytes} bytes).`,
      );
    this.identities.set(key, path);
    // 先按剩余预算限制读取，避免大文件先分配后才判定容量不足。
    const bytes = await readDeclaredFile(
      this.target,
      path,
      Math.min(this.limits.fileBytes, remaining),
    );
    this.check();
    this.progress.metadata++;
    this.progress.bytes += bytes.length;
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    this.contents.set(key, content);
    const record = {
      path,
      bytes: bytes.length,
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
    this.serializedMetadataBytes += Buffer.byteLength(JSON.stringify(record)) + 1;
    if (this.serializedMetadataBytes > this.limits.serializedBytes / 2)
      throw new ProjectJobStopped(
        "Metadata response budget reached (2 MiB); select a narrower target.",
      );
    this.result.metadata.push(record);
    if (!/\.(?:sln|slnx|csproj)$/i.test(path)) return;
    const candidate = projectMetadata(path, content, []);
    addQuickProjectMetadata(candidate, content);
    this.edges += candidate.projects.length;
    if (this.edges > this.limits.referenceEdges)
      throw new ProjectJobStopped(
        `Reference graph budget reached (${this.limits.referenceEdges} edges).`,
      );
    candidate.issues = candidate.issues.slice(0, 16).map((issue) => issue.slice(0, 1000));
    candidate.quickIssues = candidate.quickIssues
      ?.slice(0, 16)
      .map((issue) => issue.slice(0, 1000));
    const serialized = Buffer.byteLength(JSON.stringify(candidate)) + 2;
    if (this.serializedMetadataBytes + serialized > this.limits.serializedBytes / 2)
      throw new ProjectJobStopped(
        "Metadata response budget reached (2 MiB); select a narrower target.",
      );
    this.serializedMetadataBytes += serialized;
    this.candidates.set(key, candidate);
    this.result.candidates.push(candidate);
    return candidate;
  }
  async walk(root: string, file: (path: string) => Promise<void>, strict: boolean) {
    const queue = [{ path: root, depth: 0 }];
    for (let index = 0; index < queue.length; index++) {
      this.check();
      const directory = queue[index]!;
      try {
        const before = await this.directory(directory.path);
        const entries = await opendir(before.absolute, { bufferSize: 16 });
        for await (const entry of entries) {
          this.check();
          if (++this.progress.entries > this.limits.entries)
            throw new ProjectJobStopped(
              `Entry budget reached (${this.limits.entries}); choose a narrower scope.`,
            );
          const path = directory.path ? `${directory.path}/${entry.name}` : entry.name;
          if (entry.isSymbolicLink()) {
            if (strict) throw Error(`Unsafe link/reparse input: ${path}.`);
            this.issue(`Skipped link/reparse entry: ${path}.`);
          } else if (entry.isDirectory()) {
            if (excludedNames.has(entry.name.toLowerCase())) {
              if (this.result.excluded.length < 128) this.result.excluded.push(path);
              continue;
            }
            if (directory.depth >= this.limits.depth) {
              if (strict)
                throw new ProjectJobStopped(
                  `Depth budget reached (${this.limits.depth}): ${path}.`,
                );
              this.issue(`Depth budget reached (${this.limits.depth}): ${path}.`);
              continue;
            }
            if (queue.length >= this.limits.entries)
              throw new ProjectJobStopped("Directory queue budget reached.");
            queue.push({ path, depth: directory.depth + 1 });
          } else if (entry.isFile()) {
            try {
              await file(path);
            } catch (error) {
              if (strict || error instanceof ProjectJobStopped) throw error;
              this.issue(
                `${path}: ${error instanceof Error ? error.message : "Unreadable metadata"}`,
              );
            }
          } else if (strict) throw Error(`Unsupported input kind: ${path}.`);
        }
        const after = await this.directory(directory.path);
        if (
          after.info.dev !== before.info.dev ||
          after.info.ino !== before.info.ino ||
          after.info.mtimeMs !== before.info.mtimeMs ||
          after.canonical !== before.canonical
        )
          throw Error(`Directory changed during enumeration: ${directory.path || "."}.`);
        if (strict)
          this.visitedDirectories.set(directory.path, {
            dev: after.info.dev,
            ino: after.info.ino,
            mtimeMs: after.info.mtimeMs,
            canonical: after.canonical,
          });
      } catch (error) {
        if (strict || !directory.path || error instanceof ProjectJobStopped) throw error;
        this.issue(
          `${directory.path}: ${error instanceof Error ? error.message : "Unreadable directory"}`,
        );
      }
    }
  }
  async verifyDirectories() {
    for (const [path, before] of this.visitedDirectories) {
      const after = await this.directory(path);
      if (
        after.info.dev !== before.dev ||
        after.info.ino !== before.ino ||
        after.info.mtimeMs !== before.mtimeMs ||
        after.canonical !== before.canonical
      )
        throw Error(`Directory membership changed during preparation: ${path || "."}.`);
    }
  }
  finish() {
    if (this.cancelled) this.result.status = "cancelled";
    if (this.result.status !== "complete") delete this.result.prepared;
    this.result.metadata.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    this.result.candidates.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    this.result.digest = projectDigest({ target: this.target, ...this.result, digest: undefined });
    this.progress.stage = this.result.status;
    return this.result;
  }
}
