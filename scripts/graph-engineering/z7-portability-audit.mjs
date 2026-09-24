// Diagnostic acceptance audit: exit 1 means the added requirement is not satisfied.
// Uses real graph/workflow owners and a temporary library, with execution ports denied.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GraphWorkflowService } from "../../packages/services/src/graph-engineering/app/workflow-service.ts";
import {
  parallelFixture,
  plan,
  target,
} from "../../packages/services/src/graph-engineering/app/parallel.fixture.ts";
import { createWorkflowStore } from "../../packages/services/src/graph-engineering/adapters/workflow-store.ts";
import { workflowDigest } from "../../packages/services/src/graph-engineering/adapters/workflow-preflight.ts";

await mkdir(resolve(".tmp"), { recursive: true });
const directory = await mkdtemp(resolve(".tmp/z7-portability-"));
const output = resolve(process.argv[2] ?? `${directory}/result.json`);
const f = parallelFixture();
const calls = {};
function denied(name) {
  calls[name] = 0;
  return async () => {
    calls[name]++;
    throw new Error(`Import must not call ${name}`);
  };
}
for (const port of ["native", "tools", "parallel"])
  for (const method of Object.keys(f.options[port] ?? {}))
    if (typeof f.options[port][method] === "function")
      f.options[port][method] = denied(`${port}.${method}`);
let id = 0;
const service = new GraphWorkflowService({
  store: createWorkflowStore(directory),
  graph: f.service,
  preflight: { capture: denied("preflight.capture") },
  digest: workflowDigest,
  id: () => `portability-${++id}`,
  now: () => 1,
});
const bindings = { references: {}, recipes: { build: "build", test: "test" }, sourcePaths: [] };
const observations = [];
try {
  const sourceGraph = await service.instantiate({
    target,
    id: "generic",
    version: 1,
    expectedRevision: 0,
    parameters: { request: "Synthetic source draft" },
    bindings,
  });
  let libraryRevision = 0;
  for (const concurrency of [1, 2]) {
    const savedPlan = await f.parallel.save({
      target,
      plan: { ...plan, concurrency },
      expectedRevision: concurrency - 1,
    });
    const sourceBefore = structuredClone(f.records.get(target.workspacePath));
    const captured = await service.preview({
      action: "capture",
      definition: sourceGraph,
      name: `Synthetic fork ${concurrency}`,
      description: "Portability acceptance audit",
    });
    assert.deepEqual(captured.errors, []);
    const created = await service.mutate({
      action: "create",
      template: captured.template,
      expectedRevision: libraryRevision++,
    });
    const exportedId = created.entries.at(-1).id;
    const exported = await service.preview({ action: "export", id: exportedId, version: 1 });
    assert.deepEqual(exported.errors, []);
    const preview = await service.preview({ action: "import", json: exported.json });
    assert.deepEqual(preview.errors, []);
    const imported = await service.mutate({
      action: "create",
      template: preview.template,
      expectedRevision: libraryRevision++,
    });
    const importedId = imported.entries.at(-1).id;
    assert.notEqual(importedId, exportedId);
    const destination = { workspacePath: `${target.workspacePath}-import-${concurrency}` };
    const draft = await service.instantiate({
      target: destination,
      id: importedId,
      version: 1,
      expectedRevision: 0,
      parameters: { request: "Synthetic imported draft" },
      bindings,
    });
    const destinationParallel = await f.parallel.get(destination);
    assert.deepEqual(draft.edges, sourceGraph.edges);
    assert.deepEqual(f.records.get(target.workspacePath), sourceBefore);
    const rejected = [];
    for (const [label, payload] of [
      ["top-level parallel plan", { ...preview.template, parallel: savedPlan }],
      [
        "nested parallel plan",
        { ...preview.template, graph: { ...preview.template.graph, parallel: savedPlan } },
      ],
      [
        "Fork node",
        {
          ...preview.template,
          graph: {
            ...preview.template.graph,
            nodes: [
              ...preview.template.graph.nodes,
              { id: "fork", type: "fork", position: { x: 0, y: 0 } },
            ],
          },
        },
      ],
      [
        "Join node",
        {
          ...preview.template,
          graph: {
            ...preview.template.graph,
            nodes: [
              ...preview.template.graph.nodes,
              { id: "join", type: "join", position: { x: 0, y: 0 } },
            ],
          },
        },
      ],
    ]) {
      const result = await service.preview({ action: "import", json: JSON.stringify(payload) });
      assert.ok(result.errors.length, `Expected unsupported ${label} rejection`);
      rejected.push({ label, errors: result.errors });
    }
    observations.push({
      concurrency,
      sourceParallelPlan: savedPlan,
      exportedId,
      importedId,
      exportedTemplate: JSON.parse(exported.json),
      importedParallelPlan: destinationParallel.plan ?? null,
      importedParallelRuns: destinationParallel.runs.length,
      sequentialEdgesPreserved: true,
      sourceUnchanged: true,
      rejected,
    });
  }
  const effectCalls = Object.values(calls).reduce((sum, n) => sum + n, 0);
  assert.equal(effectCalls, 0);
  assert.equal(f.creates.length, 0);
  assert.equal(f.sends.length, 0);
  assert.equal(f.records.size, 3);
  const result = {
    acceptance: "Z7-A12",
    verifiedAt: new Date().toISOString(),
    status: "FAIL - Fork/Join is outside the current portable workflow contract",
    scope:
      "Real service/schema/library operations; synthetic in-memory graph repository; execution ports denied. No Electron or native runtime was launched.",
    observations,
    sideEffects: {
      calls,
      total: effectCalls,
      graphRecords: f.records.size,
      nativeCreates: f.creates.length,
      nativeSends: f.sends.length,
    },
    limitation:
      "The supported sequential transfer and unsupported payload rejection invoked no execution/workspace ports. A valid Fork/Join round trip and its native UI side-effect check are NOT RUN because no such import/export path exists.",
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `${result.status}\nEvidence: ${output}\nExecution/workspace port calls: ${effectCalls}\n`,
  );
  process.exitCode = 1;
} finally {
  await f.service.disposeAndWait();
}
