import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./isolation.mjs";
import { REQUEST } from "./pre-z8-u1-responses.mjs";

export const U3_ORIGINAL_INSTRUCTIONS =
  "Synthetic Z1 workspace. Modify only fixture.mjs and run node --test fixture.test.mjs. Do not inspect parent directories or external files.\n";
export const U3_INSTRUCTIONS =
  "PRE_Z8_U3_NATIVE_GUIDANCE: Synthetic isolated workspace. Read and edit only fixture.mjs as explicitly requested. Preserve fixture.test.mjs and all unrelated source. Do not execute commands, tests, installs, commits or publication. Do not inspect parent directories or external files. Graph-selected native guidance does not require a duplicate Read.\n";
export const U3_REFERENCE =
  "PRE_Z8_U3_EXPLICIT_REFERENCE: Additional inert synthetic review context. No command or installation is authorized by this file.\n";
export const U3_REQUEST = `${REQUEST}\nLiteral Start data: {{inputs.not_an_alias}} and {{literal braces}} stay unchanged.`;
export const u3Sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function assertU3Profile({ home, workspace }) {
  const expectedParent = await realpath(path.join(root, ".tmp"));
  const ownedHome = await realpath(home);
  assert.equal(path.dirname(ownedHome), expectedParent, "U3 owned profile boundary mismatch.");
  assert.match(path.basename(ownedHome), /^z1-native-\d+-[a-f0-9]{6}$/);
  assert.equal(
    await realpath(workspace),
    path.join(ownedHome, "workspace"),
    "U3 workspace boundary mismatch.",
  );
  for (const directory of [home, workspace]) {
    const metadata = await lstat(directory);
    assert.ok(
      metadata.isDirectory() && !metadata.isSymbolicLink(),
      "U3 requires plain owned directories.",
    );
  }
  return ownedHome;
}

async function requireAbsent(file) {
  try {
    await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to reuse an existing U3 fixture path: ${file}`);
}

/** Seed inert owned references only; source changes and execution remain native-owned. */
export async function prepareU3Fixture(owner) {
  const home = await assertU3Profile(owner);
  const marker = path.join(home, "pre-z8-u3-owner.json");
  await requireAbsent(marker);
  const instructions = path.join(owner.workspace, "AGENTS.md");
  const metadata = await lstat(instructions);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1);
  assert.equal(
    await readFile(instructions, "utf8"),
    U3_ORIGINAL_INSTRUCTIONS,
    "Unexpected fixture instruction bytes.",
  );
  const docs = path.join(owner.workspace, "docs");
  const outside = path.join(home, "outside-reference.md");
  await requireAbsent(docs);
  await requireAbsent(outside);
  const files = [
    [instructions, U3_INSTRUCTIONS],
    [path.join(docs, "context-note.md"), U3_REFERENCE],
    [path.join(docs, "same-content.md"), U3_INSTRUCTIONS],
    [outside, "PRE_Z8_U3_OUTSIDE: owned profile file outside the selected workspace.\n"],
  ];
  await writeFile(
    marker,
    JSON.stringify({ kind: "pre-z8-u3-native", version: 1, workspace: owner.workspace }),
    { flag: "wx" },
  );
  await mkdir(docs);
  for (const [file, text] of files)
    await writeFile(file, text, file === instructions ? undefined : { flag: "wx" });
  return {
    executedCommands: 0,
    outside,
    files: files.map(([file, text]) => ({
      path: path.relative(home, file),
      bytes: Buffer.byteLength(text),
      sha256: u3Sha256(text),
    })),
  };
}
