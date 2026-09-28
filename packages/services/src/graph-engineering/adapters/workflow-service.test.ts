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
import { builtinTemplates } from "../domain/workflow-samples.js";
import { reviewer, task } from "../domain/workflow-sample-nodes.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";
import type { GraphTaskNode } from "../contract.js";

test("library version edits/duplicates/archive and bad imports cannot mutate a chosen workspace or historic pin", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "z6-workflow-owner-"));
  const f = routingFixture();
  f.options.recipes!.read = async () => ({
    sourcePath: ".zcode/config.json",
    digest: "a".repeat(64),
    recipes: [
      {
        id: "build",
        name: "Build",
        executable: "dotnet",
        args: ["build"],
        cwd: ".",
        timeoutMs: 120000,
        sourcePaths: ["App.csproj"],
        expectedOutputs: ["bin/App.dll"],
        verifier: { kind: "build" },
      },
      {
        id: "test",
        name: "Test",
        executable: "dotnet",
        args: ["test"],
        cwd: ".",
        timeoutMs: 120000,
        sourcePaths: ["App.csproj"],
        expectedOutputs: [],
        verifier: {
          kind: "test",
          format: "zcode-json-v1",
          reportPath: "test.json",
          minimumTests: 1,
          requiredTests: [],
          buildNodeId: "build",
        },
      },
    ],
  });
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
  // 内置 generic 已升至 library v2（修正 reviewer 契约）；复制须选用 v2。
  const first = await service.mutate({
    action: "duplicate",
    id: "generic",
    version: 2,
    name: "Local",
    expectedRevision: 0,
  });
  const entry = first.entries.find((e) => !e.builtin)!;
  const beforeInvalid = (await f.service.getWorkspace(target)).definition;
  await assert.rejects(
    service.instantiate({
      target,
      id: entry.id,
      version: 1,
      expectedRevision: 0,
      parameters: { request: "Synthetic explicit request" },
      bindings: { references: {}, recipes: { build: "build", test: "build" }, sourcePaths: [] },
    }),
    /requires a Test check/,
  );
  assert.deepEqual((await f.service.getWorkspace(target)).definition, beforeInvalid);
  assert.equal(f.creates.length, 0);
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

test("regression: saved old-reviewer definition stays unchanged while builtin v2 ships corrected inputs", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "z7-reviewer-version-"));
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
    id: () => `old-${++id}`,
    now: () => 1,
  });
  // 构造升级前的旧 reviewer：仅绑定 verification，旧式指令；schema 复用当前 reviewer 的未变 schema。
  const oldReviewer: GraphTaskNode = {
    ...task(
      "reviewer",
      "Review current verification",
      "Review the actual current verification, source and report. Return one JSON object.",
      [{ alias: "verification", source: { kind: "artifact", nodeId: "test", selector: "verification" } }],
    ),
    output: { kind: "json", schema: reviewer().output!.schema },
  };
  const oldTemplate = structuredClone(
    builtinTemplates.find((item) => item.id === "generic")!.template,
  );
  const reviewerIdx = oldTemplate.graph.nodes.findIndex((n) => n.id === "reviewer");
  oldTemplate.graph.nodes[reviewerIdx] = oldReviewer;
  // 保存旧定义为一个 saved entry（不经过 instantiate，不触发 recipe 检查）。
  const created = await service.mutate({ action: "create", template: oldTemplate, expectedRevision: 0 });
  const savedEntry = created.entries.find((e) => !e.builtin)!;
  const savedReviewer = savedEntry.versions[0]!.template.graph.nodes.find(
    (n) => n.id === "reviewer",
  ) as GraphTaskNode;
  // 旧 saved 定义保持原样：仅 verification。
  assert.deepEqual(savedReviewer.inputs.map((i) => i.alias), ["verification"]);
  const savedDigestBefore = savedEntry.versions[0]!.digest;
  // 内置 generic 现为 library v2，reviewer 已修正为 [request, verification]。
  const builtin = (await service.list()).entries.find((e) => e.id === "generic")!;
  assert.equal(builtin.versions[0]!.version, 2);
  const builtinReviewer = builtin.versions[0]!.template.graph.nodes.find(
    (n) => n.id === "reviewer",
  ) as GraphTaskNode;
  assert.deepEqual(builtinReviewer.inputs.map((i) => i.alias), ["request", "verification"]);
  // 再次 list（builtin 重新合成）不污染已存储的 saved 旧定义：digest 与输入保持不变。
  const savedAfter = (await service.list()).entries.find((e) => e.id === savedEntry.id)!;
  assert.equal(savedAfter.versions[0]!.digest, savedDigestBefore);
  assert.deepEqual(
    (savedAfter.versions[0]!.template.graph.nodes.find((n) => n.id === "reviewer") as GraphTaskNode).inputs.map(
      (i) => i.alias,
    ),
    ["verification"],
  );
});
