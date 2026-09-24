import assert from "node:assert/strict";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createGitService } from "./gitService.js";
import { sourceFixture } from "./sourceSnapshot.fixture.js";

test("native snapshot preserves staged deletions and represents rename as deletion/addition", async (t) => {
  const f = await sourceFixture(t);
  await rename(join(f.workspacePath, "tracked.txt"), join(f.workspacePath, "renamed.txt"));
  await f.git("add", "--all", "--", ".");
  const snapshot = await f.service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, true, snapshot.issues.join("; "));
  assert.deepEqual(
    snapshot.files.map(({ path, status, beforeText, afterText }) => ({
      path,
      status,
      beforeText,
      afterText,
    })),
    [
      { path: "renamed.txt", status: "staged:A", beforeText: "", afterText: "original\n" },
      { path: "tracked.txt", status: "staged:D", beforeText: "original\n", afterText: "" },
    ],
  );
  await f.git("reset", "--hard", "HEAD");
  await rm(join(f.workspacePath, "tracked.txt"));
  const unstaged = await f.service.getSourceSnapshot(f);
  assert.equal(unstaged.complete, true);
  assert.equal(unstaged.files[0]?.status, "unstaged:D");
  assert.equal(unstaged.files[0]?.beforeText, "original\n");
  assert.equal(unstaged.files[0]?.afterText, "");
});

test("native snapshot marks tracked symlink and submodule modes incomplete without reading targets", async (t) => {
  const f = await sourceFixture(t);
  const blob = (await f.git("rev-parse", "HEAD:tracked.txt")).trim();
  const head = (await f.git("rev-parse", "HEAD")).trim();
  await f.git("update-index", "--add", "--cacheinfo", `120000,${blob},link.txt`);
  await f.git("update-index", "--add", "--cacheinfo", `160000,${head},nested-module`);
  const reads: string[] = [];
  const service = createGitService({
    commandProvider: f.commandProvider,
    fileService: {
      ...f.fileService,
      readFileRange: async (params) => {
        reads.push(params.path);
        return await f.fileService.readFileRange(params);
      },
    },
  });
  const snapshot = await service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.issues.join("; "), /symbolic link/i);
  assert.match(snapshot.issues.join("; "), /submodule/i);
  assert.deepEqual(reads, []);
});

test("native snapshot rejects invalid UTF-8 and control-byte binary files", async (t) => {
  const f = await sourceFixture(t);
  await writeFile(join(f.workspacePath, "invalid.txt"), Buffer.from([0xc0, 0xaf]));
  await writeFile(join(f.workspacePath, "control.bin"), Buffer.from([1, 2, 3]));
  const snapshot = await f.service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.files.find((file) => file.path === "invalid.txt")?.issue ?? "", /UTF-8/);
  assert.match(snapshot.files.find((file) => file.path === "control.bin")?.issue ?? "", /binary/i);
});

test("native snapshot reports total-content and manifest limits without silent completeness", async (t) => {
  const f = await sourceFixture(t);
  for (let i = 0; i < 9; i++)
    await writeFile(join(f.workspacePath, `file-${i}.txt`), "x".repeat(128 * 1024));
  const snapshot = await f.service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.issues.join("; "), /1 MiB/);
  assert.equal(snapshot.files.length, 9);
  assert.ok(
    snapshot.files.reduce((sum, file) => sum + Buffer.byteLength(file.afterText ?? ""), 0) <=
      1024 * 1024,
  );
  const provider = {
    ...f.commandProvider,
    async run(params: Parameters<typeof f.commandProvider.run>[0]) {
      const result = await f.commandProvider.run(params);
      return params.args.includes("status") ? { ...result, outputTruncated: true } : result;
    },
  };
  const limited = await createGitService({
    commandProvider: provider,
    fileService: f.fileService,
  }).getSourceSnapshot(f);
  assert.equal(limited.complete, false);
  assert.match(limited.issues.join("; "), /512 KiB/);
});

test("native snapshot supports unborn HEAD and literal path names", async (t) => {
  const f = await sourceFixture(t);
  const fresh = join(f.root, "unborn");
  await mkdir(fresh);
  await f.commandProvider.run({ cwd: fresh, args: ["init", "--quiet"] });
  const path = "literal [x] ü.txt";
  await writeFile(join(fresh, path), "synthetic unicode λ\n");
  const snapshot = await f.service.getSourceSnapshot({ workspacePath: fresh });
  assert.equal(snapshot.complete, true, snapshot.issues.join("; "));
  assert.equal(JSON.parse(snapshot.baseline).head, "unborn");
  assert.equal(snapshot.files[0]?.path, path);
  assert.equal(snapshot.files[0]?.afterText, "synthetic unicode λ\n");
});

test("native snapshot refuses a symlinked directory before bounded file reads", async (t) => {
  const f = await sourceFixture(t);
  const outside = join(f.root, "synthetic-outside-workspace");
  await mkdir(outside);
  await writeFile(join(outside, "external.txt"), "synthetic outside evidence\n");
  const linked = join(f.workspacePath, "linked");
  await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
  const reads: string[] = [];
  const service = createGitService({
    commandProvider: f.commandProvider,
    fileService: {
      ...f.fileService,
      readFileRange: async (params) => {
        reads.push(params.path);
        return await f.fileService.readFileRange(params);
      },
    },
  });
  const snapshot = await service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.issues.join("; "), /symbolic link/i);
  assert.deepEqual(reads, []);
  await rm(linked);
});

test("native snapshot preserves a UTF-8 BOM so untracked byte changes alter evidence", async (t) => {
  const f = await sourceFixture(t);
  const path = join(f.workspacePath, "bom.txt");
  await writeFile(path, "literal text\n");
  const plain = await f.service.getSourceSnapshot(f);
  await writeFile(path, "\uFEFFliteral text\n");
  const marked = await f.service.getSourceSnapshot(f);
  assert.equal(marked.complete, true);
  assert.equal(marked.files[0]?.afterText, "\uFEFFliteral text\n");
  assert.notDeepEqual(marked, plain);
});
