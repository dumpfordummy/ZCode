import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

export const REVIEW_NOTE = "Z3 synthetic untracked review note: inspect this exact snapshot.\n";
export const BEFORE_SOURCE = "export const marker = 'Z1_BEFORE_7391';\n";
export const AFTER_SOURCE = "export const marker = 'Z1_AFTER_7391';\n";

/** Commit only the newly created synthetic fixture so native Git has a real tracked baseline. */
export async function prepareSourceFixture(isolation, kind = "text") {
  const home = await realpath(isolation.home);
  const workspace = await realpath(isolation.workspace);
  assert.equal(path.dirname(workspace), home);
  assert.equal(path.basename(workspace), "workspace");
  const hooks = path.join(home, "empty-hooks");
  await mkdir(hooks, { recursive: true });
  const git = async (...args) =>
    (
      await promisify(execFile)(
        "git",
        ["-c", `core.hooksPath=${hooks}`, "-c", "commit.gpgsign=false", ...args],
        { cwd: workspace, env: isolation.env },
      )
    ).stdout.trim();
  assert.equal(await git("rev-parse", "--show-toplevel"), workspace.replaceAll("\\", "/"));
  await git("add", "--", "fixture.mjs", "fixture.test.mjs", "AGENTS.md", ".env");
  await git(
    "-c",
    "user.name=Z3 Synthetic Fixture",
    "-c",
    "user.email=z3-fixture@example.invalid",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    "Synthetic source baseline for isolated approval checks",
  );
  const head = await git("rev-parse", "HEAD");
  const initialIndex = await git("write-tree");
  assert.equal(await readFile(path.join(workspace, "fixture.mjs"), "utf8"), BEFORE_SOURCE);
  await writeFile(path.join(workspace, "review-note.txt"), REVIEW_NOTE);
  if (kind === "binary")
    await writeFile(path.join(workspace, "review-binary.bin"), Buffer.from([0, 1, 255, 0]));
  if (kind === "oversized")
    await writeFile(path.join(workspace, "review-large.txt"), "x".repeat(2 * 1024 * 1024));
  return { head, initialIndex, note: REVIEW_NOTE, kind };
}

export function assertSourceEvidence(evidence, { afterEdit = false, head } = {}) {
  assert.equal(evidence.source.kind, "source");
  assert.equal(evidence.snapshot.complete, true);
  assert.deepEqual(evidence.snapshot.issues, []);
  const baseline = JSON.parse(evidence.snapshot.baseline);
  assert.equal(baseline.version, 1);
  if (head) assert.equal(baseline.head, head);
  assert.match(baseline.index, /^[a-f\d]{64}$/);
  assert.match(baseline.status, /^[a-f\d]{64}$/);
  const files = evidence.snapshot.files;
  assert.equal(new Set(files.map((file) => file.path)).size, files.length);
  const note = files.find((file) => file.path === "review-note.txt");
  assert.ok(note, "selected untracked text must not disappear from native review coverage");
  assert.equal(note.afterText, REVIEW_NOTE);
  if (afterEdit) {
    const edited = files.find((file) => file.path === "fixture.mjs");
    assert.ok(edited, "actual native edit must be captured in the tracked source snapshot");
    assert.equal(edited.beforeText, BEFORE_SOURCE);
    assert.equal(edited.afterText, AFTER_SOURCE);
    assert.match(edited.diff, /-export const marker = 'Z1_BEFORE_7391';/);
    assert.match(edited.diff, /\+export const marker = 'Z1_AFTER_7391';/);
  }
}
