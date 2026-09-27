import assert from "node:assert/strict";
import test from "node:test";
import {
  initialTemplateParameters,
  reviewedTemplate,
  templateBindingErrors,
  latestCompatibleTemplateVersion,
  compatibleTemplateRecipes,
  setTemplatePrimaryRecipe,
  toggleTemplateTestRecipe,
} from "../src/graph-engineering/graphWorkflowView.js";
import type {
  GraphLibraryEntry,
  GraphPortableTemplate,
  GraphRecipeSnapshot,
} from "@zcode/services";

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
    "Test",
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

test("template groups preserve every explicit Test and use local Build mapping without changing saved recipes", () => {
  const common = {
    executable: "dotnet",
    args: [],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: [],
    expectedOutputs: [],
  };
  const testRecipe = {
    ...common,
    id: "test-a",
    name: "A",
    verifier: {
      kind: "test" as const,
      format: "zcode-json-v1" as const,
      reportPath: "a.json",
      minimumTests: 1,
      requiredTests: [],
      buildNodeId: "original-build",
    },
  };
  const snapshot: GraphRecipeSnapshot = {
    sourcePath: "config",
    digest: "d",
    recipes: [
      { ...common, id: "compile", name: "Compile", verifier: { kind: "build" } },
      testRecipe,
      { ...testRecipe, id: "test-b", name: "B" },
    ],
  };
  const renamed: GraphPortableTemplate = {
    ...template,
    graph: {
      ...template.graph,
      nodes: [
        {
          id: "compile-slot",
          type: "tool",
          name: "Compile",
          recipeId: "slot",
          position: { x: 0, y: 0 },
          verification: { kind: "build" },
        },
        ...template.graph.nodes,
      ],
    },
  };
  const bindings = {
    references: { rules: "rules.md" },
    recipes: { "compile-slot": "compile", test: "test-a" },
    sourcePaths: [],
    recipeGroups: { test: ["test-a", "test-b"] },
    buildMappings: { test: "compile-slot" },
  };
  const before = structuredClone({ snapshot, renamed, bindings });
  assert.deepEqual(compatibleTemplateRecipes(renamed, "test", snapshot), []);
  assert.deepEqual(
    compatibleTemplateRecipes(renamed, "test", snapshot, bindings).map((recipe) => recipe.id),
    ["test-a", "test-b"],
  );
  assert.deepEqual(
    templateBindingErrors(renamed, { bonus: false, request: "Task" }, bindings, snapshot),
    [],
  );
  for (const groups of [
    ["test-a", "missing"],
    ["test-b", "test-a"],
    ["test-a", "test-a"],
  ]) {
    assert.ok(
      templateBindingErrors(
        renamed,
        { bonus: false, request: "Task" },
        { ...bindings, recipeGroups: { test: groups } },
        snapshot,
      ).includes("Test"),
    );
  }
  assert.deepEqual({ snapshot, renamed, bindings }, before);
});

test("changing primary or additional Test preserves ordered group intent and never silently drops another scope", () => {
  const bindings = { references: {}, recipes: { test: "first" }, sourcePaths: [] };
  const grouped = toggleTemplateTestRecipe(bindings, "test", "second", true);
  assert.deepEqual(grouped.recipeGroups?.test, ["first", "second"]);
  assert.deepEqual(toggleTemplateTestRecipe(grouped, "test", "third", true).recipeGroups?.test, [
    "first",
    "second",
    "third",
  ]);
  const changed = setTemplatePrimaryRecipe(grouped, "test", "third");
  assert.deepEqual(changed.recipeGroups?.test, ["third", "first", "second"]);
  assert.deepEqual(setTemplatePrimaryRecipe(changed, "test", "").recipeGroups?.test, [
    "third",
    "first",
    "second",
  ]);
  assert.deepEqual(toggleTemplateTestRecipe(changed, "test", "first", false).recipeGroups?.test, [
    "third",
    "second",
  ]);
  assert.equal(toggleTemplateTestRecipe(changed, "test", "third", false), changed);
  assert.deepEqual(bindings, { references: {}, recipes: { test: "first" }, sourcePaths: [] });
});
test("required whitespace is missing and new selection pins the latest compatible non-archived version", () => {
  assert.ok(
    templateBindingErrors(
      template,
      { bonus: false, request: " \n " },
      {
        references: { rules: "docs/rules.md" },
        recipes: { test: "existing" },
        sourcePaths: [],
      },
    ).includes("Request"),
  );
  const entry: GraphLibraryEntry = {
    id: "saved",
    name: "Saved",
    builtin: false,
    archived: false,
    versions: [1, 3, 2].map((version) => ({
      version,
      digest: String(version),
      createdAt: version,
      template,
    })),
  };
  const before = structuredClone(entry);
  assert.equal(latestCompatibleTemplateVersion(entry)?.version, 3);
  assert.deepEqual(entry, before);
  assert.equal(latestCompatibleTemplateVersion({ ...entry, archived: true }), undefined);
  assert.equal(latestCompatibleTemplateVersion({ ...entry, versions: [] }), undefined);
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

test("verified Test offers only compatible recipes and rejects a stale or wrong-kind selection", () => {
  const common = {
    executable: "dotnet",
    args: [],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: [],
    expectedOutputs: [],
  };
  const recipes: GraphRecipeSnapshot = {
    sourcePath: ".zcode/config.json",
    digest: "checks",
    recipes: [
      { ...common, id: "command", name: "Command", verifier: { kind: "command" } },
      { ...common, id: "build", name: "Build", verifier: { kind: "build" } },
      {
        ...common,
        id: "test",
        name: "Test",
        verifier: {
          kind: "test",
          format: "zcode-json-v1",
          reportPath: "report.json",
          minimumTests: 1,
          requiredTests: [],
          buildNodeId: "build",
        },
      },
    ],
  };
  const verified: GraphPortableTemplate = {
    ...template,
    graph: {
      ...template.graph,
      nodes: [
        { id: "build", type: "tool", name: "Build", recipeId: "build", position: { x: 0, y: 0 } },
        ...template.graph.nodes,
      ],
    },
  };
  const before = structuredClone(recipes);
  assert.deepEqual(
    compatibleTemplateRecipes(verified, "test", recipes).map((recipe) => recipe.id),
    ["test"],
  );
  for (const selected of ["command", "build", "removed"]) {
    assert.ok(
      templateBindingErrors(
        verified,
        { bonus: false, request: "Task" },
        {
          references: { rules: "rules.md" },
          recipes: { test: selected },
          sourcePaths: [],
        },
        recipes,
      ).includes("Test"),
    );
  }
  assert.deepEqual(recipes, before);
});
