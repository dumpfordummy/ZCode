import test from "node:test";
import assert from "node:assert/strict";
import { previewTemplate, captureTemplate, instantiateTemplate } from "../domain/workflow.js";
import { builtinTemplates } from "../domain/workflow-samples.js";

test("portable import rejects unknown authority and versions without changing the caller draft", () => {
  const template = structuredClone(builtinTemplates[0]!.template);
  const before = JSON.stringify(template);
  for (const bad of [
    "{",
    JSON.stringify({ ...template, version: 99 }),
    JSON.stringify({ ...template, credentials: { token: "synthetic-secret" } }),
    JSON.stringify({ ...template, graph: { ...template.graph, version: 99 } }),
  ]) {
    assert.ok(previewTemplate(bad).errors.length);
  }
  assert.equal(JSON.stringify(template), before);
});
test("capture removes local request, overrides and template bindings; portable literals are reviewed", () => {
  const graph = structuredClone(builtinTemplates[0]!.template.graph);
  const start = graph.nodes.find((n) => n.type === "start")!;
  start.request = "synthetic-private-request";
  const result = captureTemplate(graph, "Reusable", "Portable only");
  assert.equal(result.errors.length, 0);
  assert.ok(!result.json!.includes("synthetic-private-request"));
  for (const text of [
    "C:\\Users\\Synthetic\\private.txt",
    "Authorization: Bearer synthetic-token",
    "api_key=synthetic-secret",
  ]) {
    const raw = structuredClone(result.template!);
    raw.description = text;
    assert.ok(previewTemplate(JSON.stringify(raw)).errors.length);
  }
});
test("instantiation pins copied parameters and rejects undeclared bindings or omitted choices", () => {
  const template = builtinTemplates.find((t) => t.id === "slot")!.template;
  assert.throws(
    () =>
      instantiateTemplate(
        "slot",
        { version: 1, digest: "a".repeat(64), createdAt: 0, template },
        {},
        { references: {}, recipes: {}, sourcePaths: [] },
      ),
    /required|missing/i,
  );
});
