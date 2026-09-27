import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRecipe } from "../contract.js";
import { graphRecipeCompatibility } from "../workflow-contract.js";
import { builtinTemplates } from "../domain/workflow-samples.js";

const build: GraphRecipe = {
  id: "compile-check",
  name: "Any display name",
  executable: "dotnet",
  args: ["build"],
  cwd: ".",
  timeoutMs: 120000,
  sourcePaths: ["App.csproj"],
  expectedOutputs: ["bin/App.dll"],
  verifier: { kind: "build" },
};
const testRecipe: GraphRecipe = {
  ...build,
  id: "verify-check",
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

test("one compatibility contract rejects command-only/wrong-kind verified slots without mutation", () => {
  const graph = structuredClone(
    builtinTemplates.find((entry) => entry.id === "generic")!.template.graph,
  );
  const before = JSON.stringify([graph, build, testRecipe]);
  assert.equal(graphRecipeCompatibility(graph, "build", build).compatible, true);
  assert.equal(graphRecipeCompatibility(graph, "test", testRecipe).compatible, true);
  assert.equal(graphRecipeCompatibility(graph, "test", build).compatible, false);
  assert.equal(graphRecipeCompatibility(graph, "build", testRecipe).compatible, false);
  assert.equal(
    graphRecipeCompatibility(graph, "test", { ...build, verifier: { kind: "command" } }).compatible,
    false,
  );
  assert.equal(graphRecipeCompatibility(graph, "missing", build).compatible, false);
  assert.equal(JSON.stringify([graph, build, testRecipe]), before);
});

test("explicit test artifact consumers preserve requirements after rename, without display-name guesses", () => {
  const graph = structuredClone(
    builtinTemplates.find((entry) => entry.id === "generic")!.template.graph,
  );
  for (const node of graph.nodes) {
    if (node.id === "test") node.id = "verify-renamed";
    if (node.type === "task" || node.type === "condition")
      for (const input of node.inputs)
        if (input.source.kind === "artifact" && input.source.nodeId === "test")
          input.source.nodeId = "verify-renamed";
    if (node.type === "approval")
      for (const evidence of node.evidence)
        if (evidence.source.kind === "artifact" && evidence.source.nodeId === "test")
          evidence.source.nodeId = "verify-renamed";
  }
  assert.equal(graphRecipeCompatibility(graph, "verify-renamed", testRecipe).requiredKind, "test");
  assert.equal(graphRecipeCompatibility(graph, "verify-renamed", build).compatible, false);
  graph.nodes.push({
    id: "arbitrary",
    type: "tool",
    name: "Test",
    recipeId: "arbitrary",
    position: { x: 0, y: 0 },
  });
  assert.equal(
    graphRecipeCompatibility(graph, "arbitrary", { ...build, verifier: { kind: "command" } })
      .requiredKind,
    "any",
  );
});
