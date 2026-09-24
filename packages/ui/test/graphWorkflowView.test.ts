import assert from "node:assert/strict";
import test from "node:test";
import {
  initialTemplateParameters,
  reviewedTemplate,
  templateBindingErrors,
} from "../src/graph-engineering/graphWorkflowView.js";
import type { GraphPortableTemplate } from "@zcode/services";

const template: GraphPortableTemplate = {
  format: "zcode-workflow",
  version: 1,
  name: "Independent fixture",
  description: "Fixture",
  graph: {
    version: 5,
    revision: 0,
    name: "Fixture",
    nodes: [{ id: "test", type: "tool", name: "Test", position: { x: 0, y: 0 }, recipeId: "slot" }],
    edges: [],
  },
  parameters: [
    { id: "request", label: "Request", type: "string", required: true },
    { id: "bonus", label: "Bonus", type: "boolean", required: true, default: false },
    { id: "samples", label: "Samples", type: "number", required: false },
  ],
  references: [
    { id: "rules", label: "Game rules", kind: "document", required: true, nodeIds: ["test"] },
  ],
  optionalNodes: [],
};
test("template binding keeps false choices explicit and blocks missing or ill-typed run data", () => {
  const defaults = initialTemplateParameters(template);
  assert.deepEqual(defaults, { bonus: false });
  const bindings = { references: {}, recipes: {}, sourcePaths: [] };
  assert.deepEqual(templateBindingErrors(template, defaults, bindings), [
    "Request",
    "Game rules",
    "test",
  ]);
  const complete = {
    references: { rules: "docs/rules.md" },
    recipes: { test: "existing-test" },
    sourcePaths: [],
  };
  assert.deepEqual(
    templateBindingErrors(template, { ...defaults, request: "edge cases", samples: 10 }, complete),
    [],
  );
  assert.deepEqual(
    templateBindingErrors(
      template,
      { bonus: "false", request: "edge cases", samples: Number.NaN },
      complete,
    ),
    ["Bonus", "Samples"],
  );
  assert.deepEqual(bindings, { references: {}, recipes: {}, sourcePaths: [] });
});
test("import acceptance needs an explicit review of a successful dry preview", () => {
  const preview = {
    template,
    errors: [],
    diagnostics: ["Bindings removed"],
    unresolved: ["Game rules"],
  };
  assert.equal(reviewedTemplate(preview, false), undefined);
  assert.equal(reviewedTemplate(preview, true), template);
  assert.equal(reviewedTemplate({ ...preview, errors: ["Unsupported node"] }, true), undefined);
  assert.equal(reviewedTemplate(undefined, true), undefined);
});
