import assert from "node:assert/strict";
import test from "node:test";
import type { GraphInputSource, GraphRecipeSnapshot } from "../contract.js";
import { addGraphContextBinding, graphContextCandidates } from "../domain/editor-context.js";
import { validateDefinition, validateReadiness } from "../domain/definition.js";
import { editorFixture, editorTask } from "./editor.fixture.js";

const sourceKey = (source: GraphInputSource) => JSON.stringify(source);

test("context projects canonical source identities and selected aliases without resolving future data", () => {
  const graph = editorFixture();
  const before = structuredClone(graph);
  const projection = graphContextCandidates(graph, "implement");
  const request = projection.candidates.find((item) => item.source.kind === "start")!;
  const analyze = projection.candidates.find(
    (item) => item.source.kind === "node" && item.source.nodeId === "analyze",
  )!;
  const reviewer = projection.candidates.find(
    (item) => item.source.kind === "node" && item.source.nodeId === "reviewer",
  )!;
  assert.equal(request.selectable, true);
  assert.equal(request.scope, "run");
  assert.deepEqual(request.aliases, ["request"]);
  assert.equal(analyze.selectable, true);
  assert.equal(analyze.scope, "current-iteration");
  assert.deepEqual(analyze.aliases, ["analyze"]);
  assert.equal(reviewer.selectable, false);
  assert.ok(reviewer.reason);
  assert.deepEqual(graph, before);
});

test("initial-only results cannot masquerade as available on repair routes", () => {
  const graph = editorFixture("bugfix");
  assert.deepEqual(validateReadiness(graph).errors, []);
  const reviewer = graphContextCandidates(graph, "reviewer");
  assert.equal(
    reviewer.candidates.find(
      (item) => item.source.kind === "node" && item.source.nodeId === "implement",
    )!.selectable,
    false,
  );
  assert.equal(
    reviewer.candidates.find(
      (item) =>
        item.source.kind === "artifact" &&
        item.source.nodeId === "test" &&
        item.source.selector === "verification",
    )!.selectable,
    true,
  );
  assert.equal(
    graphContextCandidates(graph, "repair").candidates.find(
      (item) => item.source.kind === "repair-feedback",
    )!.selectable,
    true,
  );
  assert.equal(
    reviewer.candidates.some((item) => item.source.kind === "repair-feedback" && item.selectable),
    false,
  );
});

test("unreachable, cyclic and dangling topology disables dependent choices, retaining selected inputs", () => {
  for (const mutate of [
    (graph: ReturnType<typeof editorFixture>) => {
      graph.edges = [];
    },
    (graph: ReturnType<typeof editorFixture>) => {
      graph.edges.push({ source: "reviewer", target: "analyze" });
    },
    (graph: ReturnType<typeof editorFixture>) => {
      graph.edges[0]!.target = "missing";
    },
  ]) {
    const graph = editorFixture();
    mutate(graph);
    const projection = graphContextCandidates(graph, "implement");
    assert.ok(projection.issues.length);
    const selected = projection.candidates.find(
      (item) => item.source.kind === "node" && item.source.nodeId === "analyze",
    )!;
    assert.equal(selected.selectable, false);
    assert.deepEqual(selected.aliases, ["analyze"]);
    assert.throws(() => addGraphContextBinding(graph, "implement", selected.source));
  }
});

test("missing and advanced selected sources remain visible instead of being dropped", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.inputs.push({ alias: "missing", source: { kind: "node", nodeId: "removed" } });
  task.inputs.push({
    alias: "custom",
    source: { kind: "artifact", nodeId: "analyze", selector: "custom", pointer: "/field" },
  });
  const before = structuredClone(graph);
  const projection = graphContextCandidates(graph, task.id);
  for (const alias of ["missing", "custom"]) {
    const selected = projection.candidates.find((item) => item.aliases.includes(alias))!;
    assert.equal(selected.selectable, false);
    assert.ok(selected.reason);
  }
  assert.deepEqual(graph, before);
});

test("same source chips reuse aliases and insert a missing token exactly once, preserving expanded handoffs", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "reviewer");
  task.inputs.push({
    alias: "second",
    source: { kind: "artifact", nodeId: "test", selector: "verification" },
  });
  task.instructions =
    "Custom prefix\r\n\r\nAdditional configured check second:\n{{inputs.second}}\nCustom trailing text";
  // reviewer 现绑定 [request, verification]；按别名定位 verification 源，避免依赖输入位置。
  const source = task.inputs.find((input) => input.alias === "verification")!.source;
  const before = structuredClone(graph);
  const edited = addGraphContextBinding(graph, task.id, source);
  assert.equal(edited.alias, "verification");
  assert.equal(edited.changed, true);
  assert.ok(editorTask(edited.definition, task.id).instructions.startsWith(task.instructions));
  assert.equal(
    editorTask(edited.definition, task.id).instructions.split("{{inputs.verification}}").length,
    2,
  );
  assert.deepEqual(editorTask(edited.definition, task.id).inputs, task.inputs);
  assert.deepEqual(edited.definition.edges, graph.edges);
  assert.deepEqual(editorTask(edited.definition, task.id).output, task.output);
  const repeated = addGraphContextBinding(edited.definition, task.id, source);
  assert.equal(repeated.changed, false);
  assert.deepEqual(repeated.definition, edited.definition);
  assert.deepEqual(graph, before);
});

test("new aliases are bounded and collision-free, without changing Start or other bindings", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.inputs = [{ alias: "request", source: { kind: "node", nodeId: "analyze" } }];
  task.instructions = "Existing {{inputs.request}}";
  const result = addGraphContextBinding(graph, task.id, { kind: "start" });
  assert.notEqual(result.alias, "request");
  assert.match(result.alias, /^[A-Za-z][A-Za-z0-9_]{0,63}$/);
  assert.equal(editorTask(result.definition, task.id).inputs.length, 2);
  assert.equal(
    sourceKey(editorTask(result.definition, task.id).inputs[0]!.source),
    sourceKey(task.inputs[0]!.source),
  );
  assert.deepEqual(validateDefinition(result.definition), result.definition);
});

test("literal brace conversion refuses to reinterpret user text, while plain literal text is preserved", () => {
  for (const instructions of [
    "Literal {{inputs.request}}",
    "Literal {{unfinished",
    "Literal trailing }}",
  ]) {
    const graph = editorFixture();
    const task = editorTask(graph, "implement");
    task.instructionMode = "literal";
    task.instructions = instructions;
    const before = structuredClone(graph);
    assert.throws(
      () => addGraphContextBinding(graph, task.id, { kind: "start" }),
      /literal|Advanced/i,
    );
    assert.deepEqual(graph, before);
  }
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.instructionMode = "literal";
  task.instructions = "Preserve this exact prose.\r\n";
  const result = addGraphContextBinding(graph, task.id, { kind: "start" });
  assert.equal(editorTask(result.definition, task.id).instructionMode, "bound");
  assert.ok(editorTask(result.definition, task.id).instructions.startsWith(task.instructions));
});

test("incomplete prompt fields do not disable otherwise valid topology, and binding limits still apply", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "implement");
  task.name = "";
  task.instructions = "";
  const start = graph.nodes.find((node) => node.type === "start")!;
  if (start.type === "start") start.request = "";
  assert.equal(
    graphContextCandidates(graph, task.id).candidates.find(
      (item) => item.source.kind === "node" && item.source.nodeId === "analyze",
    )!.selectable,
    true,
  );
  task.inputs = Array.from({ length: 16 }, (_, index) => ({
    alias: `a${index}`,
    source: { kind: "start" as const },
  }));
  assert.throws(
    () => addGraphContextBinding(graph, task.id, { kind: "node", nodeId: "analyze" }),
    /16|sixteen|binding/i,
  );
});

test("whole-artifact empty pointer reuses the selected alias and preserves its original declaration", () => {
  const graph = editorFixture();
  const task = editorTask(graph, "reviewer");
  // reviewer 现绑定 [request, verification]；把空 pointer 设到 verification 输入上，保持原意图。
  const verificationInput = task.inputs.find((input) => input.alias === "verification")!;
  verificationInput.source = {
    kind: "artifact",
    nodeId: "test",
    selector: "verification",
    pointer: "",
  };
  const before = structuredClone(task.inputs);
  const result = addGraphContextBinding(graph, task.id, {
    kind: "artifact",
    nodeId: "test",
    selector: "verification",
  });
  assert.equal(result.alias, "verification");
  assert.equal(result.changed, false);
  assert.deepEqual(editorTask(result.definition, task.id).inputs, before);
});

test("compatible custom Test recipes enable verification selection without treating display names as roles", () => {
  const graph = editorFixture();
  graph.nodes.push({
    id: "custom",
    type: "tool",
    name: "Test by display name only",
    position: { x: 0, y: 0 },
    recipeId: "custom-check",
  });
  graph.edges = graph.edges.filter((edge) => edge.source !== "test");
  graph.edges.push({ source: "test", target: "custom" }, { source: "custom", target: "reviewer" });
  const source = { kind: "artifact", nodeId: "custom", selector: "verification" } as const;
  assert.equal(
    graphContextCandidates(graph, "reviewer").candidates.some(
      (item) => sourceKey(item.source) === sourceKey(source),
    ),
    false,
  );
  const recipes: GraphRecipeSnapshot = {
    digest: "a".repeat(64),
    sourcePath: ".zcode/config.json",
    recipes: [
      {
        id: "custom-check",
        name: "Actual configured Test",
        executable: "fixture",
        args: [],
        cwd: ".",
        timeoutMs: 1000,
        sourcePaths: ["source"],
        expectedOutputs: [],
        verifier: {
          kind: "test",
          format: "zcode-json-v1",
          reportPath: "result.json",
          minimumTests: 1,
          requiredTests: [],
          buildNodeId: "build",
        },
      },
    ],
  };
  assert.equal(
    graphContextCandidates(graph, "reviewer", recipes).candidates.find(
      (item) => sourceKey(item.source) === sourceKey(source),
    )!.selectable,
    true,
  );
  const edited = addGraphContextBinding(graph, "reviewer", source, recipes);
  assert.ok(
    editorTask(edited.definition, "reviewer").inputs.some(
      (input) => sourceKey(input.source) === sourceKey(source),
    ),
  );
  recipes.recipes[0]!.verifier = { kind: "command" };
  assert.equal(
    graphContextCandidates(graph, "reviewer", recipes).candidates.some(
      (item) => sourceKey(item.source) === sourceKey(source),
    ),
    false,
  );
});

test("empty Start is unavailable consistently in sequential and routed draft projections", () => {
  for (const version of [2, 3, 4, 5] as const) {
    const graph = editorFixture();
    if (version !== 5) {
      graph.version = version;
      delete graph.routing;
      graph.nodes = graph.nodes.filter(
        (node) =>
          node.type === "start" ||
          node.type === "end" ||
          node.id === "analyze" ||
          node.id === "implement",
      );
      graph.edges = [
        { source: "start", target: "analyze" },
        { source: "analyze", target: "implement" },
        { source: "implement", target: "end" },
      ];
      const end = graph.nodes.find((node) => node.type === "end")!;
      if (end.type === "end") end.outputNodeId = "implement";
    }
    const start = graph.nodes.find((node) => node.type === "start")!;
    if (start.type === "start") start.request = "";
    const selected = graphContextCandidates(graph, "implement").candidates.find(
      (item) => item.source.kind === "start",
    )!;
    assert.equal(selected.selectable, false);
    assert.match(selected.reason!, /empty/i);
    assert.throws(() => addGraphContextBinding(graph, "implement", { kind: "start" }), /empty/i);
  }
});
