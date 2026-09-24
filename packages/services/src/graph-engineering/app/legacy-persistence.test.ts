import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { recordSchema } from "../domain/record.js";
import { fixture } from "./legacy.fixture.js";

test("actual native Z1 completed JSON opens without changes or dispatch", async () => {
  const original = await readFile(new URL("./fixtures/z1-completed.json", import.meta.url), "utf8");
  const data = recordSchema.parse(JSON.parse(original));
  const f = fixture({ definition: data.definition, runs: data.runs });
  const view = await f.service.getWorkspace(data.runs[0]!.target);
  assert.deepEqual(view.runs, data.runs);
  assert.deepEqual(view.definition, data.definition);
  assert.deepEqual(f.counts(), { creates: 0, sends: 0 });
  assert.equal(
    await readFile(new URL("./fixtures/z1-completed.json", import.meta.url), "utf8"),
    original,
  );
});
test("actual persisted Z1 pending guard stays owned on reopen, with IDs/literal instructions intact", async () => {
  const data = recordSchema.parse(
    JSON.parse(await readFile(new URL("./fixtures/z1-pending.json", import.meta.url), "utf8")),
  );
  const old = data.runs[0]!;
  assert.equal(old.version, undefined);
  if (old.version !== undefined) throw new Error("Expected legacy fixture");
  const f = fixture({ definition: data.definition, runs: data.runs });
  const view = await f.service.getWorkspace(old.target);
  const run = view.runs[0]!;
  assert.equal(run.status, "Interrupted");
  assert.equal(run.sessionId, old.sessionId);
  assert.equal(run.inputId, old.inputId);
  assert.equal(run.runtimeIdentity, old.runtimeIdentity);
  assert.deepEqual(run.definition, old.definition);
  assert.equal(await f.service.isSessionOwned({ ...old.target, sessionId: old.sessionId! }), true);
  assert.deepEqual(f.counts(), { creates: 0, sends: 0 });
});
