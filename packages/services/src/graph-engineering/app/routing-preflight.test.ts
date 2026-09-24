import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRecipe } from "../contract.js";
import { routingDefinition, routingFixture } from "./routing.fixture.js";

const recipe = (id: string, verifier: GraphRecipe["verifier"]): GraphRecipe => ({
  id,
  name: id,
  executable: "fixture",
  args: [],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: ["source.cs"],
  expectedOutputs: verifier.kind === "build" ? ["build.dll"] : [],
  verifier,
});
const tool = (id: string) => ({
  id,
  type: "tool" as const,
  name: id,
  recipeId: id,
  position: { x: 0, y: 0 },
});
test("a branch-local Build cannot authorize a merged Test before any native session starts", async () => {
  const fixture = routingFixture();
  try {
    const graph = routingDefinition();
    graph.nodes = graph.nodes.map((node) =>
      ["positive", "merge"].includes(node.id)
        ? tool(node.id)
        : node.type === "approval"
          ? { ...node, evidence: [{ alias: "request", source: { kind: "start" } }] }
          : node,
    );
    fixture.options.recipes!.read = async () => ({
      sourcePath: ".zcode/config.json",
      digest: "c".repeat(64),
      recipes: [
        recipe("positive", { kind: "build" }),
        recipe("merge", {
          kind: "test",
          format: "zcode-json-v1",
          reportPath: "test.json",
          minimumTests: 1,
          requiredTests: [],
          buildNodeId: "positive",
        }),
      ],
    });
    await fixture.prepare(graph);
    await assert.rejects(fixture.run(), /Build.*every.*route/);
    assert.equal(fixture.creates.length, 0);
    assert.equal(fixture.sends.length, 0);
    assert.equal(fixture.saved().runs.length, 0);
  } finally {
    fixture.service.dispose();
  }
});
test("Condition Test references reject a Build recipe before any native session starts", async () => {
  const fixture = routingFixture();
  try {
    const graph = routingDefinition();
    graph.nodes.push(tool("build"));
    graph.edges.find((edge) => edge.source === "producer")!.target = "build";
    graph.edges.push({ source: "build", target: "condition" });
    const condition = graph.nodes.find((node) => node.type === "condition")!;
    condition.verification = { testNodeIds: ["build"], successExit: "positive" };
    condition.inputs.push({
      alias: "machine",
      source: { kind: "artifact", nodeId: "build", selector: "verification" },
    });
    fixture.options.recipes!.read = async () => ({
      sourcePath: ".zcode/config.json",
      digest: "c".repeat(64),
      recipes: [recipe("build", { kind: "build" })],
    });
    await fixture.prepare(graph);
    await assert.rejects(fixture.run(), /Condition.*Test recipe/);
    assert.equal(fixture.creates.length, 0);
    assert.equal(fixture.sends.length, 0);
    assert.equal(fixture.saved().runs.length, 0);
  } finally {
    fixture.service.dispose();
  }
});
