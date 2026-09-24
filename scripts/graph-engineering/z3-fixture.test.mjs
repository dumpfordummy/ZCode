import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareSourceFixture, BEFORE_SOURCE, REVIEW_NOTE } from "./z3-fixture.mjs";

test("Z3 source fixture has an independent Git baseline, tracked source and literal untracked evidence", async () => {
  const isolation = await createIsolation();
  try {
    const baseline = await prepareSourceFixture(isolation, "binary");
    const git = async (...args) =>
      (await promisify(execFile)("git", args, { cwd: isolation.workspace, env: isolation.env }))
        .stdout;
    assert.match(baseline.head, /^[a-f0-9]{40}$/);
    assert.equal(await git("show", "HEAD:fixture.mjs"), BEFORE_SOURCE);
    assert.equal(
      (await git("status", "--porcelain=v1")).trim(),
      "?? review-binary.bin\n?? review-note.txt",
    );
    assert.equal(
      await readFile(path.join(isolation.workspace, "review-note.txt"), "utf8"),
      REVIEW_NOTE,
    );
    assert.deepEqual(
      await readFile(path.join(isolation.workspace, "review-binary.bin")),
      Buffer.from([0, 1, 255, 0]),
    );
  } finally {
    await isolation.close();
  }
});

test("Z3 fixture seeding refuses a workspace outside its own new profile before Git mutation", async () => {
  const isolation = await createIsolation();
  try {
    await assert.rejects(
      prepareSourceFixture({ ...isolation, workspace: path.resolve(".") }),
      /Expected values to be strictly equal/,
    );
    const result = await promisify(execFile)("git", ["status", "--porcelain=v1"], {
      cwd: isolation.workspace,
      env: isolation.env,
    });
    assert.match(result.stdout, /\?\? fixture\.mjs/);
  } finally {
    await isolation.close();
  }
});
