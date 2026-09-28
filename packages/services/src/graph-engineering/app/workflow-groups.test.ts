import assert from "node:assert/strict";
import { test } from "node:test";
import { builtinTemplates } from "../domain/workflow-samples.js";
import { instantiateTemplate, captureTemplate } from "../domain/workflow.js";
import { effectiveGraphRecipe } from "../domain/effective-recipe.js";
import type { GraphRecipe } from "../artifact-types.js";

const version = (id: string) => ({
  version: 1,
  digest: "a".repeat(64),
  createdAt: 0,
  template: structuredClone(builtinTemplates.find((item) => item.id === id)!.template),
});
test("multiple tests expand actual Tools, bound reviewer prompts, final gate and repair dependencies", () => {
  for (const id of ["generic", "bugfix"]) {
    const selected = version(id);
    const before = JSON.stringify(selected);
    const graph = instantiateTemplate(
      id,
      selected,
      { request: "Explicit request" },
      {
        references: {},
        sourcePaths: ["Source.cs"],
        recipes: { build: "b", test: "t1" },
        recipeGroups: { test: ["t1", "t2"] },
        buildMappings: { test: "build" },
      },
    );
    assert.equal(JSON.stringify(selected), before);
    assert.deepEqual(
      graph.nodes.filter((n) => n.type === "tool").map((n) => n.recipeId),
      ["b", "t1", "t2"],
    );
    const reviewer = graph.nodes.find((n) => n.id === "reviewer")!;
    // reviewer 现绑定 [request, verification]；recipeGroups 展开 2 个 Test 检查追加 verification__check_2，共 3 个输入。
    assert.equal(reviewer.type === "task" && reviewer.inputs.length, 3);
    if (reviewer.type === "task")
      for (const input of reviewer.inputs)
        assert.ok(reviewer.instructions.includes(`{{inputs.${input.alias}}}`));
    const gate = graph.nodes.find((n) => n.id === "final-gate")!;
    assert.equal(
      gate.type === "approval" &&
        gate.evidence.filter(
          (b) =>
            b.source.kind === "artifact" && ["test", "test__check_2"].includes(b.source.nodeId),
        ).length,
      2,
    );
    if (id === "bugfix") {
      assert.ok(graph.routing!.region!.bodyNodeIds.includes("test__check_2"));
      const decision = graph.nodes.find((n) => n.type === "condition")!;
      assert.deepEqual(decision.type === "condition" && decision.verification!.testNodeIds, [
        "test",
        "test__check_2",
      ]);
    }
    const portable = captureTemplate(graph, "Expanded", "Both test slots");
    assert.deepEqual(portable.errors, []);
    assert.equal(portable.template!.graph.template, undefined);
    assert.deepEqual(
      portable.template!.graph.nodes.filter((n) => n.type === "tool").map((n) => n.recipeId),
      ["build", "test", "test__check_2"],
    );
  }
});
test("renamed Build mapping is local and malformed groups are rejected before instantiation", () => {
  const selected = version("generic");
  selected.template.graph = JSON.parse(
    JSON.stringify(selected.template.graph).replaceAll('"build"', '"compile"'),
  );
  const bindings = {
    references: {},
    sourcePaths: [],
    recipes: { compile: "b", test: "t" },
    buildMappings: { test: "compile" },
  };
  const graph = instantiateTemplate("custom", selected, { request: "Request" }, bindings);
  const recipe: GraphRecipe = {
    id: "t",
    name: "Tests",
    executable: "checks.exe",
    args: [],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["Source.cs"],
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      reportPath: "test.json",
      minimumTests: 1,
      requiredTests: [],
      buildNodeId: "build",
    },
  };
  assert.equal(
    effectiveGraphRecipe(graph, "test", recipe).verifier.kind === "test" &&
      (effectiveGraphRecipe(graph, "test", recipe).verifier as { buildNodeId: string }).buildNodeId,
    "compile",
  );
  assert.equal(recipe.verifier.kind === "test" && recipe.verifier.buildNodeId, "build");
  const invalidGroups: Array<Record<string, string[]>> = [
    { test: ["other", "t"] },
    { test: ["t", "t"] },
    { compile: ["b", "other"] },
    { missing: ["t"] },
  ];
  for (const recipeGroups of invalidGroups)
    assert.throws(() =>
      instantiateTemplate(
        "custom",
        selected,
        { request: "Request" },
        { ...bindings, recipeGroups },
      ),
    );
});
