import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkflowStore } from "./workflow-store.js";
import { builtinTemplates } from "../domain/workflow-samples.js";

test("independent library owners serialize revisions and preserve immutable versions across restart", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "z6-library-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const a = createWorkflowStore(dir),
    b = createWorkflowStore(dir);
  const entry = {
    id: "saved",
    name: "Saved",
    archived: false,
    builtin: false,
    versions: [
      { version: 1, digest: "a".repeat(64), createdAt: 0, template: builtinTemplates[0]!.template },
    ],
  };
  const raced = await Promise.allSettled([
    a.change(0, (e) => e.push(structuredClone(entry))),
    b.change(0, (e) => e.push({ ...structuredClone(entry), id: "other" })),
  ]);
  assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
  const saved = await a.read();
  assert.equal(saved.revision, 1);
  assert.equal(saved.entries.length, 1);
  const historic = JSON.stringify(saved.entries[0]!.versions);
  await b.change(1, (entries) => {
    entries[0]!.archived = true;
  });
  assert.equal(
    JSON.stringify((await createWorkflowStore(dir).read()).entries[0]!.versions),
    historic,
  );
  await assert.rejects(
    a.change(1, () => {}),
    /revision changed/,
  );
  saved.entries.length = 0;
  assert.equal((await b.read()).entries.length, 1);
});
