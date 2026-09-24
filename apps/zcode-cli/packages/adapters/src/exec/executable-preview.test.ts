import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { previewExecutable } from "./executable-preview.js";

test("native executable metadata resolves declared paths and rejects missing tools without running bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "z6-tool-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "bin"));
  const executable = join(root, "bin", "fixture.exe");
  await writeFile(executable, "This is deliberately not executable code and must never be run");
  await chmod(executable, 0o700);
  const env = { PATH: join(root, "bin"), PATHEXT: ".EXE" };
  assert.deepEqual(await previewExecutable("fixture.exe", { cwd: root, env }), {
    executable: "fixture.exe",
    status: "available",
    path: executable,
  });
  assert.deepEqual(await previewExecutable("./bin/fixture.exe", { cwd: root, env }), {
    executable: "./bin/fixture.exe",
    status: "available",
    path: executable,
  });
  assert.equal((await previewExecutable("missing-tool", { cwd: root, env })).status, "missing");
  assert.equal((await previewExecutable("missing-tool", { cwd: root, env: {} })).status, "unknown");
  assert.equal(
    (await previewExecutable("./missing-tool", { cwd: root, env: {} })).status,
    "missing",
  );
  if (process.platform === "win32")
    assert.equal(
      (await previewExecutable("fixture", { cwd: root, env: { Path: env.PATH, PathExt: ".EXE" } }))
        .status,
      "available",
    );
});
