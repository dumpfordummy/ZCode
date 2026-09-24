import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { readFile, writeFile, access, unlink, symlink } from "node:fs/promises";
import { sourceFixture } from "./sourceSnapshot.fixture.js";
import { createGitGraphWorkspaces } from "./graphWorkspace.js";
test("Z7 real independent clones pin the base and preserve original and sibling files", async (t) => {
  const f = await sourceFixture(t),
    manager = createGitGraphWorkspaces(f.commandProvider, join(f.root, "owned"));
  const base = await manager.inspect(f.workspacePath);
  assert.throws(
    () =>
      f.service.graphWorkspace({
        action: "cleanup",
        workspace: { workspacePath: f.workspacePath },
      } as never),
    /audited Graph owner/,
  );
  const a = await manager.execute({
    action: "prepare",
    ownerId: "run-a",
    slot: "worker-a",
    base,
    token: "token-a",
  });
  const b = await manager.execute({
    action: "prepare",
    ownerId: "run-a",
    slot: "worker-b",
    base,
    token: "token-b",
  });
  await writeFile(join(a.workspacePath, "tracked.txt"), "worker A\n");
  assert.equal(await readFile(join(b.workspacePath, "tracked.txt"), "utf8"), "original\n");
  assert.equal(await readFile(join(f.workspacePath, "tracked.txt"), "utf8"), "original\n");
  assert.equal((await manager.inspect(f.workspacePath)).digest, base.digest);
  const restored = {
    ...Object.fromEntries(Object.entries(a).reverse()),
    base: Object.fromEntries(Object.entries(a.base).reverse()),
  } as typeof a;
  await manager.execute({ action: "validate", workspace: restored });
  await assert.rejects(
    manager.execute({ action: "validate", workspace: { ...restored, token: "foreign-token" } }),
    /marker mismatch/,
  );
  await assert.rejects(
    manager.execute({ action: "cleanup", workspace: { ...a, workspacePath: f.workspacePath } }),
    /Foreign/,
  );
  await manager.execute({ action: "cleanup", workspace: restored });
  await assert.rejects(access(a.workspacePath));
  await access(b.workspacePath);
  await symlink(f.workspacePath, join(b.workspacePath, "outside-link"), "junction");
  await assert.rejects(manager.execute({ action: "cleanup", workspace: b }), /symbolic link/);
  assert.equal(await readFile(join(f.workspacePath, "tracked.txt"), "utf8"), "original\n");
});
test("Z7 dirty or changed bases and unsafe slot IDs refuse without resetting source", async (t) => {
  const f = await sourceFixture(t),
    manager = createGitGraphWorkspaces(f.commandProvider, join(f.root, "owned"));
  const base = await manager.inspect(f.workspacePath);
  await assert.rejects(
    manager.execute({ action: "prepare", ownerId: "../bad", slot: "x", base, token: "token" }),
    /identifier/,
  );
  await writeFile(join(f.workspacePath, "tracked.txt"), "dirty");
  await assert.rejects(manager.inspect(f.workspacePath), /clean reviewed/);
  await assert.rejects(
    manager.execute({ action: "prepare", ownerId: "run", slot: "a", base, token: "token" }),
    /clean reviewed/,
  );
  assert.equal(await readFile(join(f.workspacePath, "tracked.txt"), "utf8"), "dirty");
});
test("Z7 shallow snapshot does not copy deleted historical credential blobs or other commits", async (t) => {
  const f = await sourceFixture(t),
    manager = createGitGraphWorkspaces(f.commandProvider, join(f.root, "owned"));
  await writeFile(join(f.workspacePath, ".env"), "SYNTHETIC_HISTORY_ONLY=fixture\n");
  await f.git("add", "--", ".env");
  await f.git("commit", "-qm", "Synthetic historical file");
  const blob = (await f.git("rev-parse", "HEAD:.env")).trim();
  await unlink(join(f.workspacePath, ".env"));
  await f.git("add", "-u");
  await f.git("commit", "-qm", "Remove synthetic history file");
  const workspace = await manager.execute({
    action: "prepare",
    base: await manager.inspect(f.workspacePath),
    ownerId: "shallow",
    slot: "a",
    token: "token",
  });
  const count = await f.commandProvider.run({
    cwd: workspace.workspacePath,
    args: ["rev-list", "--count", "HEAD"],
  });
  assert.equal(count.stdout.trim(), "1");
  const absent = await f.commandProvider.run({
    cwd: workspace.workspacePath,
    args: ["cat-file", "-t", blob],
  });
  assert.notEqual(absent.exitCode, 0);
});
