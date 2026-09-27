import test from "node:test";
import assert from "node:assert/strict";
import type { GraphSequentialDefinition } from "../contract.js";
import { captureTemplate } from "../domain/workflow.js";
import { applyGraphRunRequest } from "../domain/workflow-request.js";

function task(
  id: string,
  instructions: string,
  inputs: Array<{
    alias: string;
    source: { kind: "start" } | { kind: "node"; nodeId: string };
  }>,
) {
  return {
    id,
    type: "task" as const,
    position: { x: 0, y: 0 },
    name: id,
    instructions,
    instructionMode: "bound" as const,
    inputs,
    configuration: { kind: "inherit" as const },
  };
}
function sequentialDefinition(): GraphSequentialDefinition {
  return {
    version: 5,
    revision: 3,
    name: "Test workflow",
    routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 12, deadlineMs: 3600000 } },
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 0 }, request: "Original request" },
      task("analyze", "Analyze {{inputs.request}}", [
        { alias: "request", source: { kind: "start" } },
      ]),
      task("implement", "Implement {{inputs.analysis}}", [
        { alias: "analysis", source: { kind: "node", nodeId: "analyze" } },
      ]),
      {
        id: "gate",
        type: "approval",
        position: { x: 0, y: 0 },
        name: "Final review",
        reviewInstructions: "Review the result",
        evidence: [{ alias: "result", source: { kind: "node", nodeId: "implement" } }],
        commentPolicy: "required",
      },
      { id: "end", type: "end", position: { x: 0, y: 0 }, outputNodeId: "implement" },
    ],
    edges: [
      { source: "start", target: "analyze" },
      { source: "analyze", target: "implement" },
      { source: "implement", target: "gate" },
      { source: "gate", target: "end" },
    ],
  };
}
function pinnedDefinition(): GraphSequentialDefinition {
  const def = sequentialDefinition();
  def.template = {
    id: "test-template",
    name: "Test template",
    version: 1,
    digest: "a".repeat(64),
    parameters: { request: "Original request" },
    bindings: { references: {}, recipes: {}, sourcePaths: [] },
    references: [
      { id: "instructions", kind: "instruction", nodeIds: ["analyze", "implement"] },
      { id: "skill", kind: "skill", nodeIds: ["implement"] },
    ],
    excluded: [],
  };
  return def;
}

test("captureTemplate exports selected reference roles as required rebinding roles", () => {
  const original = pinnedDefinition();
  const originalCopy = structuredClone(original);
  const preview = captureTemplate(original, "Exported", "Exported description");

  assert.equal(preview.errors.length, 0, JSON.stringify(preview.errors));
  assert.ok(preview.template, "preview must produce a template");

  const refs = preview.template!.references;
  assert.equal(refs.length, 2, "both selected reference roles must be exported");

  const instructions = refs.find((r) => r.id === "instructions")!;
  assert.equal(instructions.kind, "instruction");
  assert.equal(instructions.required, true, "exported role must be required");
  assert.deepEqual(instructions.nodeIds, ["analyze", "implement"]);
  assert.ok(instructions.label.length > 0, "label must be non-empty");

  const skill = refs.find((r) => r.id === "skill")!;
  assert.equal(skill.kind, "skill");
  assert.equal(skill.required, true);
  assert.deepEqual(skill.nodeIds, ["implement"]);

  // 原始定义不被修改。
  assert.deepEqual(original, originalCopy);

  // 导出图已删除 template、revision=0、Start 为空。
  assert.equal(preview.template!.graph.template, undefined);
  assert.equal(preview.template!.graph.revision, 0);
  const start = preview.template!.graph.nodes.find((n) => n.type === "start")!;
  assert.equal(start.request, "");

  // unresolved 列出 required 引用。
  assert.ok(preview.unresolved.some((u) => u.includes("instructions")));
  assert.ok(preview.unresolved.some((u) => u.includes("skill")));
});

test("captureTemplate exports empty references for unpinned definitions", () => {
  const def = sequentialDefinition();
  const preview = captureTemplate(def, "Exported", "Exported description");
  assert.equal(preview.errors.length, 0, JSON.stringify(preview.errors));
  assert.deepEqual(preview.template!.references, []);
});

test("captureTemplate filters reference nodeIds to remaining task nodes", () => {
  const def = pinnedDefinition();
  // 模拟一个已排除的节点：implement 不在图中，gate 的 evidence 改指向 analyze。
  def.nodes = def.nodes.filter((n) => n.id !== "implement");
  def.edges = [
    { source: "start", target: "analyze" },
    { source: "analyze", target: "gate" },
    { source: "gate", target: "end" },
  ];
  const gate = def.nodes.find((n) => n.id === "gate") as {
    evidence: Array<{ alias: string; source: { kind: string; nodeId: string } }>;
  };
  gate.evidence = [{ alias: "result", source: { kind: "node", nodeId: "analyze" } }];
  const end = def.nodes.find((n) => n.id === "end") as { outputNodeId: string | null };
  end.outputNodeId = "analyze";
  def.template!.references = [
    { id: "instructions", kind: "instruction", nodeIds: ["analyze", "implement"] },
    { id: "skill", kind: "skill", nodeIds: ["implement"] },
  ];
  const preview = captureTemplate(def, "Exported", "Exported description");
  assert.equal(preview.errors.length, 0, JSON.stringify(preview.errors));
  const instructions = preview.template!.references.find((r) => r.id === "instructions")!;
  assert.deepEqual(instructions.nodeIds, ["analyze"], "excluded nodeId must be filtered");
  // skill 仅指向已排除的 implement，应被过滤掉。
  assert.equal(
    preview.template!.references.find((r) => r.id === "skill"),
    undefined,
  );
});

test("applyGraphRunRequest updates pinned instance parameters.request", () => {
  const original = pinnedDefinition();
  const originalCopy = structuredClone(original);
  const updated = applyGraphRunRequest(original, "New explicit request");

  assert.equal(updated.template!.parameters.request, "New explicit request");
  // start.request 同步更新为新 parameters 的渲染文本（与 instantiateTemplate 共用渲染器）。
  const start = updated.nodes.find((n) => n.type === "start") as { request: string };
  assert.ok(
    start.request.includes("New explicit request"),
    "start.request must reflect the new request via the shared parameter-to-Start renderer.",
  );
  assert.notEqual(
    start.request,
    original.nodes.find((n) => n.type === "start")!.request,
    "start.request must change when parameters.request changes.",
  );
  // 非 Start 节点、边、pin、版本、digest、绑定、引用、excluded、revision 不变。
  const otherNodes = updated.nodes.filter((n) => n.type !== "start");
  const originalOtherNodes = original.nodes.filter((n) => n.type !== "start");
  assert.deepEqual(otherNodes, originalOtherNodes);
  assert.equal(updated.template!.id, original.template!.id);
  assert.equal(updated.template!.version, original.template!.version);
  assert.equal(updated.template!.digest, original.template!.digest);
  assert.deepEqual(updated.template!.bindings, original.template!.bindings);
  assert.deepEqual(updated.template!.references, original.template!.references);
  assert.deepEqual(updated.template!.excluded, original.template!.excluded);
  assert.deepEqual(updated.edges, original.edges);
  assert.equal(updated.revision, original.revision);
  // 原始定义不被修改。
  assert.deepEqual(original, originalCopy);
});

test("applyGraphRunRequest updates unpinned Start text", () => {
  const original = sequentialDefinition();
  const originalCopy = structuredClone(original);
  const updated = applyGraphRunRequest(original, "New explicit request");

  assert.equal(
    (updated.nodes.find((n) => n.type === "start") as { request: string }).request,
    "New explicit request",
  );
  assert.equal(updated.template, undefined);
  assert.equal(updated.revision, original.revision);
  assert.deepEqual(original, originalCopy, "original must not be mutated");
});

test("applyGraphRunRequest rejects blank request", () => {
  assert.throws(() => applyGraphRunRequest(pinnedDefinition(), ""), /nonblank/);
  assert.throws(() => applyGraphRunRequest(pinnedDefinition(), "   "), /nonblank/);
});

test("applyGraphRunRequest rejects request exceeding 12000 characters", () => {
  assert.throws(() => applyGraphRunRequest(pinnedDefinition(), "x".repeat(12001)), /12,000/);
});

test("applyGraphRunRequest accepts request at exactly 12000 characters", () => {
  const exact = "x".repeat(12000);
  const updated = applyGraphRunRequest(pinnedDefinition(), exact);
  assert.equal(updated.template!.parameters.request, exact);
});

test("applyGraphRunRequest rejects definitions without exactly one Start", () => {
  const noStart = sequentialDefinition();
  noStart.nodes = noStart.nodes.filter((n) => n.type !== "start");
  assert.throws(() => applyGraphRunRequest(noStart, "Request"), /exactly one Start/);

  const twoStarts = sequentialDefinition();
  twoStarts.nodes.push({
    id: "start2",
    type: "start",
    position: { x: 0, y: 0 },
    request: "",
  });
  assert.throws(() => applyGraphRunRequest(twoStarts, "Request"), /exactly one Start/);
});

test("applyGraphRunRequest rejects pinned instance with non-string request parameter", () => {
  const def = pinnedDefinition();
  def.template!.parameters.request = 42;
  assert.throws(() => applyGraphRunRequest(def, "New request"), /Advanced/);
});

test("applyGraphRunRequest rejects pinned instance with missing request parameter", () => {
  const def = pinnedDefinition();
  def.template!.parameters = {};
  assert.throws(() => applyGraphRunRequest(def, "New request"), /Advanced/);
});
