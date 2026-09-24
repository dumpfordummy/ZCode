import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createGitService } from "./gitService.js";
import { sourceFixture } from "./sourceSnapshot.fixture.js";

test("native source snapshot retains literal staged, working and empty/untracked text without writes", async (t) => {
  const f = await sourceFixture(t);
  await writeFile(join(f.workspacePath, "tracked.txt"), "staged text\n");
  await f.git("add", "--", "tracked.txt");
  await writeFile(join(f.workspacePath, "tracked.txt"), "working text\n");
  await writeFile(join(f.workspacePath, "new.txt"), "new evidence\n");
  await writeFile(join(f.workspacePath, "empty.txt"), "");
  const indexBefore = await readFile(join(f.workspacePath, ".git", "index"));
  const headBefore = await f.git("rev-parse", "HEAD");
  const snapshot = await f.service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, true, snapshot.issues.join("; "));
  assert.deepEqual(
    snapshot.files.map(({ path, status }) => [path, status]),
    [
      ["empty.txt", "untracked"],
      ["new.txt", "untracked"],
      ["tracked.txt", "staged:M"],
      ["tracked.txt", "unstaged:M"],
    ],
  );
  assert.equal(snapshot.files[0]?.afterText, "");
  assert.equal(snapshot.files[1]?.afterText, "new evidence\n");
  assert.equal(snapshot.files[2]?.beforeText, "original\n");
  assert.equal(snapshot.files[2]?.afterText, "staged text\n");
  assert.equal(snapshot.files[3]?.beforeText, "staged text\n");
  assert.equal(snapshot.files[3]?.afterText, "working text\n");
  assert.match(snapshot.files[3]?.diff ?? "", /-staged text\n\+working text/);
  assert.equal(JSON.parse(snapshot.baseline).head, headBefore.trim());
  assert.deepEqual(await f.service.getSourceSnapshot(f), snapshot);
  assert.deepEqual(await readFile(join(f.workspacePath, ".git", "index")), indexBefore);
  assert.equal(await f.git("rev-parse", "HEAD"), headBefore);
});

test("native snapshot scopes to a subworkspace and excludes ignored content", async (t) => {
  const f = await sourceFixture(t);
  const workspacePath = join(f.workspacePath, "inside");
  await mkdir(workspacePath);
  await writeFile(join(workspacePath, "review.txt"), "inside evidence\n");
  await writeFile(join(f.workspacePath, "outside.txt"), "outside excluded\n");
  await writeFile(join(workspacePath, ".gitignore"), "ignored.txt\n");
  await writeFile(join(workspacePath, "ignored.txt"), "ignored excluded\n");
  const snapshot = await f.service.getSourceSnapshot({ workspacePath });
  assert.equal(snapshot.complete, true, snapshot.issues.join("; "));
  assert.deepEqual(
    snapshot.files.map((file) => file.path),
    [".gitignore", "review.txt"],
  );
  assert.equal(snapshot.files[1]?.afterText, "inside evidence\n");
});

test("native snapshot fails visibly for binary, oversized and excessive untracked paths", async (t) => {
  const f = await sourceFixture(t);
  await writeFile(join(f.workspacePath, "binary.bin"), Buffer.from([0, 1, 2]));
  await writeFile(join(f.workspacePath, "large.txt"), "x".repeat(2 * 1024 * 1024));
  const snapshot = await f.service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.files.find((file) => file.path === "binary.bin")?.issue ?? "", /binary/i);
  assert.match(snapshot.files.find((file) => file.path === "large.txt")?.issue ?? "", /128 KiB/);
  await Promise.all(
    Array.from({ length: 65 }, (_, i) => writeFile(join(f.workspacePath, `new-${i}.txt`), "")),
  );
  const limited = await f.service.getSourceSnapshot(f);
  assert.equal(limited.complete, false);
  assert.match(limited.issues.join("; "), /64/);
});

test("native snapshot changes with content, exact HEAD and scoped index", async (t) => {
  const f = await sourceFixture(t);
  const before = await f.service.getSourceSnapshot(f);
  await writeFile(join(f.workspacePath, "tracked.txt"), "reviewed\n");
  const modified = await f.service.getSourceSnapshot(f);
  assert.notEqual(modified.baseline, before.baseline);
  await f.git("add", "--", "tracked.txt");
  const staged = await f.service.getSourceSnapshot(f);
  assert.notEqual(staged.baseline, modified.baseline);
  await f.git("commit", "--quiet", "-m", "synthetic changed baseline");
  const committed = await f.service.getSourceSnapshot(f);
  assert.equal(committed.complete, true);
  assert.notEqual(committed.baseline, before.baseline);
  assert.deepEqual(committed.files, []);
});

test("native snapshot makes bounded-read failure and concurrent capture mutation incomplete", async (t) => {
  const f = await sourceFixture(t);
  await writeFile(join(f.workspacePath, "tracked.txt"), "first\n");
  const broken = createGitService({
    commandProvider: f.commandProvider,
    fileService: {
      ...f.fileService,
      readFileRange: async () => {
        throw new Error("fixture unreadable");
      },
    },
  });
  assert.equal((await broken.getSourceSnapshot(f)).complete, false);
  let reads = 0;
  const changing = createGitService({
    commandProvider: f.commandProvider,
    fileService: {
      ...f.fileService,
      readFileRange: async (params) => {
        const result = await f.fileService.readFileRange(params);
        if (++reads === 1) await writeFile(join(f.workspacePath, "tracked.txt"), "second\n");
        return result;
      },
    },
  });
  const snapshot = await changing.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.issues.join("; "), /changed during capture/i);
});

test("native snapshot refuses unsupported index semantics and nonrepositories", async (t) => {
  const f = await sourceFixture(t);
  await f.git("update-index", "--assume-unchanged", "tracked.txt");
  const snapshot = await f.service.getSourceSnapshot(f);
  assert.equal(snapshot.complete, false);
  assert.match(snapshot.issues.join("; "), /assume-unchanged/);
  const noRepo = await f.service.getSourceSnapshot({ workspacePath: f.root });
  assert.equal(noRepo.complete, false);
  assert.match(noRepo.issues.join("; "), /repository/i);
});
