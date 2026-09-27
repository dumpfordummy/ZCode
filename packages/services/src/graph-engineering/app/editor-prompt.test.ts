import assert from "node:assert/strict";
import test from "node:test";
import type { GraphNodeAttempt } from "../contract.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";
import { resolveGraphInstructions } from "../domain/bindings.js";
import { previewGraphTaskPrompt } from "../domain/editor-prompt.js";
import { graphInstructionParts } from "../domain/prompt-parts.js";
import { editorFixture, editorTask } from "./editor.fixture.js";

test("shared scanner is lossless and handles repeated, adjacent, malformed and CRLF text", () => {
  const text =
    "before\r\n{{inputs.request}}{{inputs.request}}\n{{bad}} {{inputs.9bad}} trailing }}";
  const parts = graphInstructionParts(text);
  assert.equal(parts.map((part) => (part.kind === "text" ? part.text : part.token)).join(""), text);
  assert.deepEqual(
    parts.filter((part) => part.kind === "token").map((part) => part.alias),
    ["request", "request"],
  );
  assert.deepEqual(graphInstructionParts(""), []);
});

test("draft Start resolves exactly once, while every future task and evidence token is visibly unresolved", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.instructions = "A {{inputs.request}} B {{inputs.analyze}} C";
  const preview = previewGraphTaskPrompt(graph, task.id);
  assert.equal(preview.kind, "draft");
  assert.equal(
    preview.bindings.find((binding) => binding.alias === "request")!.text,
    "Frozen request {{inputs.future}}",
  );
  assert.equal(
    preview.bindings.find((binding) => binding.alias === "analyze")!.status,
    "unresolved",
  );
  assert.equal(preview.segments.filter((part) => part.kind === "unresolved").length, 1);
  assert.ok(
    preview.segments.some(
      (part) => part.kind === "text" && part.text.includes("{{inputs.future}}"),
    ),
  );
  const reviewer = previewGraphTaskPrompt(graph, "reviewer");
  assert.equal(reviewer.bindings[0]!.status, "unresolved");
  assert.ok(reviewer.segments.some((part) => part.kind === "unresolved"));
});

test("literal preview never scans text into inputs and malformed bound drafts return issues without rewriting", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.instructions = "literal {{inputs.request}} and {{invalid";
  task.instructionMode = "literal";
  const literal = previewGraphTaskPrompt(graph, task.id);
  assert.deepEqual(literal.segments, [{ kind: "text", text: task.instructions }]);
  assert.deepEqual(literal.bindings, []);
  task.instructionMode = "bound";
  task.instructions = "{{inputs.missing}} {{invalid";
  const before = structuredClone(graph);
  const bound = previewGraphTaskPrompt(graph, task.id);
  assert.ok(bound.issues.some((issue) => /missing|binding/i.test(issue)));
  assert.ok(bound.issues.some((issue) => /malformed/i.test(issue)));
  assert.ok(bound.segments.some((part) => part.kind === "unresolved" && part.alias === "missing"));
  assert.deepEqual(graph, before);
});

function references() {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.instructionMode = "literal";
  task.instructions = "Exact old instructions\r\n{{inputs.unbound}}";
  graph.template = {
    id: "fixture",
    name: "Fixture",
    version: 1,
    digest: "a".repeat(64),
    parameters: {},
    excluded: [],
    references: [
      { id: "instructions", kind: "instruction", nodeIds: [task.id] },
      { id: "skill", kind: "skill", nodeIds: [task.id] },
    ],
    bindings: {
      references: { instructions: "AGENTS.md", skill: "glm:workspace:fixture" },
      recipes: {},
      sourcePaths: [],
    },
  };
  const metadata: GraphRunProvenance["references"] = [
    {
      id: "instructions",
      kind: "instruction",
      path: "AGENTS.md",
      digest: "b".repeat(64),
      origin: "fixture",
      delivery: "native-instructions",
    },
    {
      id: "skill",
      kind: "skill",
      path: "skill.md",
      digest: "c".repeat(64),
      origin: "fixture",
      nativeName: "plugin:fixture",
      delivery: "native-skill",
    },
  ];
  return { graph, task, metadata, provenance: { references: metadata } as GraphRunProvenance };
}

test("legacy prompt bytes remain exact even if unrelated supplied metadata has new delivery markers", () => {
  const f = references();
  const expected = `${f.task.instructions}\n\nExplicit native references (data): [{"id":"instructions","kind":"instruction","selected":"AGENTS.md"},{"id":"skill","kind":"skill","selected":"glm:workspace:fixture","nativeSkillName":"plugin:fixture"}]\nRead document/instruction references through native Read. Load nativeSkillName through the existing native Skill tool; the selected catalog ID is provenance, not the Skill tool argument. Cite reference IDs; missing source is a question, never an invented rule.`;
  assert.equal(
    resolveGraphInstructions(f.task, f.graph, [], [], f.provenance).instructions,
    expected,
  );
  assert.equal(
    previewGraphTaskPrompt(f.graph, f.task.id, f.metadata)
      .segments.map((part) => (part.kind === "text" ? part.text : part.token))
      .join(""),
    expected,
  );
  f.graph.template!.bindings.referencePolicy = "native-aware-v1";
  const withoutMarkers = f.metadata.map(({ delivery: _delivery, ...reference }) => reference);
  assert.throws(
    () =>
      resolveGraphInstructions(f.task, f.graph, [], [], {
        references: withoutMarkers,
      } as GraphRunProvenance),
    /delivery.*missing/i,
  );
});

test("native-aware delivery uses frozen metadata without another native instruction read or invented skill name", () => {
  const f = references();
  f.graph.template!.bindings.referencePolicy = "native-aware-v1";
  const resolved = resolveGraphInstructions(f.task, f.graph, [], [], f.provenance);
  assert.match(resolved.instructions, /native-instructions/);
  assert.match(resolved.instructions, /already supplied|already provided/);
  assert.match(resolved.instructions, /explicit-read/);
  assert.match(resolved.instructions, /plugin:fixture/);
  assert.doesNotMatch(
    resolved.instructions,
    /Read document\/instruction references through native Read\./,
  );
  const pending = previewGraphTaskPrompt(f.graph, f.task.id);
  assert.ok(pending.issues.some((issue) => /skill.*name|name.*skill/i.test(issue)));
  assert.equal(
    pending.references.find((reference) => reference.kind === "skill")!.nativeName,
    undefined,
  );
  assert.throws(() => resolveGraphInstructions(f.task, f.graph, []), /skill name/i);
});

test("shared runtime interpolation still binds captured values only once without modifying captured evidence", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.instructions = "{{inputs.analyze}}\n{{inputs.request}}";
  const captured = {
    nodeId: "analyze",
    status: "Completed",
    sessionId: "s",
    inputId: "i",
    commandId: "c",
    terminalProof: { state: "completedSuccess" },
    finalOutput: { text: "Captured {{inputs.request}}", turnId: "turn", rowId: 1 },
  } as GraphNodeAttempt;
  const before = structuredClone(captured);
  const result = resolveGraphInstructions(task, graph, [captured]);
  assert.equal(
    result.instructions,
    "Captured {{inputs.request}}\nFrozen request {{inputs.future}}",
  );
  assert.deepEqual(captured, before);
  assert.equal(result.bindings.find((binding) => binding.alias === "analyze")!.sourceInputId, "i");
});

test("native-aware instruction, document and skill delivery stays explicit even with an unresolved reference", () => {
  const f = references();
  f.graph.template!.bindings.referencePolicy = "native-aware-v1";
  f.graph.template!.references.push({ id: "document", kind: "document", nodeIds: [f.task.id] });
  f.graph.template!.bindings.references.document = "design.md";
  f.metadata.push({
    id: "document",
    kind: "document",
    path: "design.md",
    digest: "d".repeat(64),
    origin: "fixture",
    delivery: "explicit-read",
  });
  const resolved = resolveGraphInstructions(f.task, f.graph, [], [], f.provenance);
  for (const marker of ["native-instructions", "explicit-read", "native-skill"])
    assert.ok(resolved.instructions.includes(marker));
  delete f.metadata[2]!.delivery;
  const pending = previewGraphTaskPrompt(f.graph, f.task.id, f.metadata);
  const text = pending.segments
    .map((part) => (part.kind === "text" ? part.text : part.token))
    .join("");
  assert.match(text, /native-instructions/);
  assert.match(text, /already supplied/);
  assert.doesNotMatch(text, /Read document\/instruction references through native Read\./);
  assert.ok(pending.issues.some((issue) => /document.*delivery.*unresolved/i.test(issue)));
  assert.throws(
    () => resolveGraphInstructions(f.task, f.graph, [], [], f.provenance),
    /delivery.*missing/i,
  );
  const unknown = previewGraphTaskPrompt(f.graph, f.task.id);
  assert.doesNotMatch(
    unknown.segments.map((part) => (part.kind === "text" ? part.text : part.token)).join(""),
    /Read document\/instruction references through native Read\./,
  );
});

test("empty Start and oversized expansion stay visibly unresolved or unavailable rather than being silently truncated", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  const start = graph.nodes.find((node) => node.type === "start")!;
  if (start.type !== "start") throw new Error("Missing Start");
  start.request = "";
  assert.equal(
    previewGraphTaskPrompt(graph, task.id).bindings.find((binding) => binding.alias === "request")!
      .status,
    "unresolved",
  );
  start.request = "a".repeat(100_000);
  task.instructions = "{{inputs.request}}{{inputs.request}}{{inputs.request}}";
  const preview = previewGraphTaskPrompt(graph, task.id);
  assert.deepEqual(preview.segments, []);
  assert.ok(preview.issues.some((issue) => /exceed.*200000/i.test(issue)));
  task.inputs = task.inputs.filter((binding) => binding.source.kind === "start");
  assert.throws(() => resolveGraphInstructions(task, graph, []), /exceed.*200000/i);
});

test("native-aware references require matching identities, kinds and delivery modes in frozen provenance", () => {
  for (const mutate of [
    (metadata: GraphRunProvenance["references"]) => {
      metadata[0]!.id = "other";
    },
    (metadata: GraphRunProvenance["references"]) => {
      metadata[0]!.kind = "document";
    },
    (metadata: GraphRunProvenance["references"]) => {
      metadata[0]!.delivery = "native-skill";
    },
    (metadata: GraphRunProvenance["references"]) => {
      metadata[1]!.delivery = "explicit-read";
    },
  ]) {
    const f = references();
    f.graph.template!.bindings.referencePolicy = "native-aware-v1";
    mutate(f.metadata);
    assert.throws(
      () => resolveGraphInstructions(f.task, f.graph, [], [], f.provenance),
      /delivery.*missing/i,
    );
    assert.ok(
      previewGraphTaskPrompt(f.graph, f.task.id, f.metadata).issues.some((issue) =>
        /delivery.*unresolved/i.test(issue),
      ),
    );
  }
});
