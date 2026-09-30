import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { GraphWorkflowService } from "../app/workflow-service.js";
import { builtinTemplates } from "../domain/workflow-samples.js";
import type { GraphLibraryEntry } from "../workflow-contract.js";

/**
 * UX-M3 policy: exact-version semantics of the workflow library.
 *  - a built-in offers exactly the versions `list()` returns (the repository's current definition);
 *  - a historical built-in version that is no longer offered (v1 before the reviewer-contract fix) is
 *    rejected, never served by another version;
 *  - user-created versions are immutable, individually selectable and exact (v1 stays v1 after v2).
 */
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function service() {
  let state = { revision: 0, entries: [] as GraphLibraryEntry[] };
  const store = {
    async read() {
      return structuredClone(state);
    },
    async change(expected: number, change: (entries: GraphLibraryEntry[]) => void) {
      if (state.revision !== expected) throw new Error("Workflow library revision changed");
      const entries = structuredClone(state.entries);
      change(entries);
      state = { revision: state.revision + 1, entries };
      return structuredClone(state);
    },
  };
  let counter = 0;
  return new GraphWorkflowService({
    store,
    graph: {} as never,
    preflight: {} as never,
    digest: sha,
    id: () => `user-${++counter}`,
    now: () => 1_000 + counter,
  });
}

test("every built-in offers exactly the versions list() returns, no more, no fewer", async () => {
  const library = await service().list();
  const builtins = library.entries.filter((entry) => entry.builtin);
  assert.deepEqual(
    builtins.map((entry) => entry.id).sort(),
    builtinTemplates.map((entry) => entry.id).sort(),
    "all built-ins are published",
  );
  const offered = new Set<number>();
  for (const entry of builtins) {
    assert.equal(entry.versions.length, 1, `${entry.id} publishes one version`);
    offered.add(entry.versions[0]!.version);
    assert.equal(entry.versions[0]!.createdAt, 0, "built-ins carry no creation time");
  }
  assert.equal(offered.size, 1, "all built-ins are published at the same repository version");
});

test("a built-in version that is not offered is rejected for preview and instantiate, never served by another", async () => {
  const svc = service();
  const library = await svc.list();
  for (const entry of library.entries.filter((item) => item.builtin)) {
    const offered = entry.versions[0]!.version;
    for (const missing of [offered - 1, offered + 1, 0]) {
      await assert.rejects(
        svc.preview({ action: "export", id: entry.id, version: missing }),
        /existing immutable workflow version/i,
        `${entry.id} v${missing}`,
      );
      await assert.rejects(
        svc.instantiate({
          target: { workspacePath: "/tmp" },
          id: entry.id,
          version: missing,
          expectedRevision: 0,
          parameters: {},
          bindings: { references: {}, recipes: {}, sourcePaths: [] },
        }),
        /existing immutable workflow version/i,
        `${entry.id} instantiate v${missing}`,
      );
    }
    const exported = await svc.preview({ action: "export", id: entry.id, version: offered });
    assert.equal(exported.errors.length, 0);
  }
});

test("user-created versions are immutable, individually selectable and exact", async () => {
  const svc = service();
  const source = builtinTemplates.find((entry) => entry.id === "agent-assisted")!.template;
  const one = { ...structuredClone(source), name: "Mine", description: "first" };
  let view = await svc.list();
  await svc.mutate({ action: "create", template: one, expectedRevision: view.revision });
  view = await svc.list();
  const created = view.entries.find((entry) => !entry.builtin)!;
  const two = { ...structuredClone(source), name: "Mine", description: "second" };
  await svc.mutate({
    action: "version",
    id: created.id,
    template: two,
    expectedRevision: view.revision,
  });
  const after = (await svc.list()).entries.find((entry) => entry.id === created.id)!;
  assert.deepEqual(
    after.versions.map((item) => item.version),
    [1, 2],
  );
  assert.equal(
    after.versions[0]!.template.description,
    "first",
    "version 1 is unchanged by version 2",
  );
  const exportOf = async (version: number) =>
    (await svc.preview({ action: "export", id: created.id, version })).json;
  assert.match((await exportOf(1))!, /"description": "first"/);
  assert.match((await exportOf(2))!, /"description": "second"/);
  assert.notEqual(after.versions[0]!.digest, after.versions[1]!.digest);
  await assert.rejects(exportOf(3), /existing immutable workflow version/i);
  await assert.rejects(exportOf(0), /existing immutable workflow version/i);
});
