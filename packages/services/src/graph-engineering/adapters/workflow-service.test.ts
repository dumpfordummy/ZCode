import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unknownExecutionEnvironment } from "@zcode/shared";
import { GraphWorkflowService } from "../app/workflow-service.js";
import { createWorkflowStore } from "./workflow-store.js";
import { workflowDigest } from "./workflow-preflight.js";
import { routingDefinition, routingFixture } from "../app/routing.fixture.js";
import { selection, target } from "../app/sequential.fixture.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";

test("library version edits/duplicates/archive and bad imports cannot mutate a chosen workspace or historic pin", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "z6-workflow-owner-"));
  const f = routingFixture();
  t.after(async () => {
    await f.service.disposeAndWait();
    await rm(directory, { recursive: true, force: true });
  });
  let id = 0;
  const service = new GraphWorkflowService({
    store: createWorkflowStore(directory),
    graph: f.service,
    preflight: {
      capture: async () => {
        throw new Error("Preview must never discover native environment");
      },
    },
    digest: workflowDigest,
    id: () => `saved-${++id}`,
    now: () => 1,
  });
  const builtin = (await service.list()).entries.find((e) => e.id === "generic")!;
  const first = await service.mutate({
    action: "duplicate",
    id: "generic",
    version: 1,
    name: "Local",
    expectedRevision: 0,
  });
  const entry = first.entries.find((e) => !e.builtin)!;
  const graph = await service.instantiate({
    target,
    id: entry.id,
    version: 1,
    expectedRevision: 0,
    parameters: { request: "Synthetic explicit request" },
    bindings: { references: {}, recipes: { build: "build", test: "test" }, sourcePaths: [] },
  });
  const pin = structuredClone(graph.template);
  const changed = structuredClone(builtin.versions[0]!.template);
  changed.description = "Revised instructions";
  await service.mutate({ action: "version", id: entry.id, template: changed, expectedRevision: 1 });
  assert.deepEqual((await f.service.getWorkspace(target)).definition, graph);
  assert.deepEqual(graph.template, pin);
  assert.equal((await service.list()).entries.find((e) => e.id === entry.id)!.versions.length, 2);
  await assert.rejects(
    service.mutate({ action: "archive", id: entry.id, archived: true, expectedRevision: 1 }),
    /revision changed/,
  );
  for (const json of ['{"format":"foreign","runs":[]}', '{"plugin":{"install":true}}', "{"])
    assert.ok((await service.preview({ action: "import", json })).errors.length);
  assert.deepEqual((await f.service.getWorkspace(target)).definition, graph);
  const next = await service.instantiate({
    target,
    id: entry.id,
    version: 2,
    expectedRevision: graph.revision,
    parameters: { request: "New explicit request" },
    bindings: { references: {}, recipes: { build: "build", test: "test" }, sourcePaths: [] },
  });
  assert.equal(next.template!.version, 2);
  assert.notEqual(next.template!.digest, pin!.digest);
  await service.mutate({ action: "archive", id: entry.id, archived: true, expectedRevision: 2 });
  assert.equal((await service.list()).entries.find((e) => e.id === entry.id)!.versions.length, 2);
  assert.equal(f.sends.length, 0);
  assert.equal(f.creates.length, 0);
});

test("Host admission pins reviewed preflight, idempotent retry sends once, reference drift prevents successor", async (t) => {
  const f = routingFixture();
  t.after(() => f.service.disposeAndWait());
  const definition = routingDefinition();
  definition.template = {
    id: "fixture",
    name: "Fixture",
    version: 1,
    digest: "a".repeat(64),
    parameters: { request: "Synthetic" },
    bindings: { references: {}, recipes: {}, sourcePaths: [] },
    references: [],
    excluded: [],
  };
  const graph = await f.prepare(definition);
  let digest = "b".repeat(64);
  f.options.preflight = {
    capture: async () =>
      ({
        digest,
        template: structuredClone(definition.template!),
        environment: {
          ...unknownExecutionEnvironment("Unknown external behavior"),
          status: "available",
        },
        models: [],
        auxiliary: [],
        references: [],
        recipes: [],
        permissions: [],
        unknowns: ["Unknown external behavior"],
      }) satisfies GraphRunProvenance,
  };
  const request = {
    target,
    revision: graph.revision,
    requestId: "reviewed-run",
    modelSelection: selection,
    mode: "build" as const,
    planEnabled: false,
  };
  await assert.rejects(f.service.run(request), /preflight/);
  await assert.rejects(
    f.service.run({
      ...request,
      preflight: { digest: "c".repeat(64), acknowledgedUnknowns: true },
    }),
    /changed/,
  );
  await assert.rejects(
    f.service.run({ ...request, preflight: { digest, acknowledgedUnknowns: false } }),
    /acknowledgment/,
  );
  assert.equal(f.creates.length, 0);
  const accepted = { ...request, preflight: { digest, acknowledgedUnknowns: true } };
  const first = await f.service.run(accepted);
  assert.equal((await f.service.run(accepted)).id, first.id);
  assert.equal(f.sends.length, 1);
  digest = "d".repeat(64);
  await f.emit("producer", '{"value":2}');
  const stopped = await f.current();
  assert.equal(stopped.status, "NeedsHuman");
  assert.match(stopped.message!, /configuration drift/);
  assert.equal(f.sends.length, 1);
  assert.equal(stopped.provenance!.digest, "b".repeat(64));
  assert.deepEqual(stopped.provenance!.template, definition.template);
});
