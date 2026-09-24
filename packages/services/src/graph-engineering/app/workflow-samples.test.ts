import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { builtinTemplates } from "../domain/workflow-samples.js";
import { validateDefinition, validateReadiness } from "../domain/definition.js";

test("shipped portable workflows preserve actual v5 readiness, exact samples and native boundaries", async () => {
  assert.deepEqual(
    builtinTemplates.map((item) => item.id),
    ["generic", "bugfix", "slot"],
  );
  for (const { id, template } of builtinTemplates) {
    assert.equal(template.format, "zcode-workflow");
    assert.equal(template.version, 1);
    const graph = validateDefinition(structuredClone(template.graph));
    if (graph.version !== undefined) {
      const start = graph.nodes.find((node) => node.type === "start");
      if (start?.type === "start") start.request = "Explicit synthetic operator request.";
    }
    assert.deepEqual(validateReadiness(graph).errors, [], id);
    assert.deepEqual(
      JSON.parse(
        await readFile(
          new URL(`../../../../../docs/graph-engineering/templates/${id}.v1.json`, import.meta.url),
          "utf8",
        ),
      ),
      template,
    );
    assert.equal(template.graph.nodes.find((node) => node.type === "start")?.request, "");
    for (const node of template.graph.nodes) {
      if (node.type === "task") assert.deepEqual(node.configuration, { kind: "inherit" });
      if (node.type === "tool") assert.equal(node.recipeId, node.id);
    }
    assert.ok(template.parameters.some((item) => item.id === "request" && item.required));
  }
});

test("slot selection uses one sequential graph and no optional predecessor binding or inferred rule", () => {
  const slot = builtinTemplates.find((item) => item.id === "slot")!.template;
  assert.equal(slot.graph.routing?.region, undefined);
  assert.deepEqual(
    slot.optionalNodes.map((item) => item.nodeId),
    ["normal", "free", "bonus", "respin"],
  );
  assert.equal(slot.graph.nodes.filter((item) => item.type === "task").length, 8);
  for (const task of slot.graph.nodes.filter((item) => item.type === "task"))
    for (const input of task.inputs) {
      const source = input.source;
      assert.ok(
        source.kind !== "node" || !slot.optionalNodes.some((item) => item.nodeId === source.nodeId),
      );
    }
  assert.ok(slot.references.some((item) => item.id === "gameDoc" && item.required));
  const text = slot.graph.nodes
    .filter((item) => item.type === "task")
    .map((item) => item.instructions)
    .join("\n");
  assert.ok(text.includes("source reference"));
  assert.ok(text.includes("No target or sampling/acceptance rule means no RTP comparison"));
  assert.ok(text.includes("not certification"));
});

test("bugfix retains bounded repairs, current machine evidence and a required final gate", () => {
  const graph = builtinTemplates.find((item) => item.id === "bugfix")!.template.graph;
  assert.equal(graph.routing?.region?.maxRepairIterations, 2);
  assert.equal(graph.routing?.region?.stopOnNoProgress, true);
  assert.equal(graph.routing?.finalGateId, "final-gate");
  const reviewer = graph.nodes.find((node) => node.id === "reviewer");
  assert.equal(reviewer?.type, "task");
  if (reviewer?.type === "task")
    assert.deepEqual(reviewer.inputs, [
      {
        alias: "verification",
        source: { kind: "artifact", nodeId: "test", selector: "verification" },
      },
    ]);
  assert.ok(
    graph.nodes.some(
      (node) =>
        node.type === "task" &&
        node.id === "repair" &&
        node.inputs.some((input) => input.source.kind === "repair-feedback"),
    ),
  );
});
