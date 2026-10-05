import assert from "node:assert/strict";
import test from "node:test";
import type {
  GraphPortableTemplate,
  GraphRecipe,
  GraphRecipeSnapshot,
  GraphTemplateBindings,
} from "@zcode/services";
import { graphCheckSelection } from "../src/graph-engineering/graphCheckSelection.js";
import { defaultGraphCheckBindings } from "../src/graph-engineering/graphCheckDefaults.js";
import { templateBindingErrors } from "../src/graph-engineering/graphWorkflowView.js";

const position = { x: 0, y: 0 };
const template: GraphPortableTemplate = {
  format: "zcode-workflow",
  version: 1,
  name: "Verified fixture",
  description: "Fixture",
  graph: {
    version: 5,
    revision: 0,
    name: "Fixture",
    nodes: [
      { id: "build", type: "tool", name: "Build", position },
      { id: "test", type: "tool", name: "Test", position },
    ],
    edges: [],
  },
  parameters: [],
  references: [],
  optionalNodes: [],
};
const base = {
  executable: "dotnet",
  args: [],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: [],
  expectedOutputs: [],
};
const build = (id: string, name = id): GraphRecipe => ({
  ...base,
  id,
  name,
  verifier: { kind: "build" },
});
const testRecipe = (id: string, name = id): GraphRecipe => ({
  ...base,
  id,
  name,
  verifier: {
    kind: "test",
    format: "zcode-json-v1",
    reportPath: "report.json",
    minimumTests: 1,
    requiredTests: [],
    buildNodeId: "build",
  },
});
const command = (id: string): GraphRecipe => ({
  ...base,
  id,
  name: id,
  verifier: { kind: "command" },
});
const snapshot = (...recipes: GraphRecipe[]): GraphRecipeSnapshot => ({
  recipes,
  digest: "d".repeat(64),
  sourcePath: ".zcode/config.json",
});
const bind = (recipes: Record<string, string>, extra = {}): GraphTemplateBindings => ({
  references: {},
  recipes,
  sourcePaths: [],
  ...extra,
});
const step = (steps: ReturnType<typeof graphCheckSelection>, nodeId: string) =>
  steps.find((item) => item.nodeId === nodeId)!;

test("sole compatible Build and Test default only never-selected slots", () => {
  const initial = bind({});
  const saved = snapshot(build("b1"), testRecipe("t1"));
  assert.deepEqual(defaultGraphCheckBindings(template, initial, saved).recipes, {
    build: "b1",
    test: "t1",
  });
  assert.deepEqual(initial.recipes, {});
  for (const recipes of [
    { build: "gone", test: "wrong" },
    { build: "", test: "" },
    { build: "b1", test: "t1" },
  ]) {
    const explicit = bind(recipes);
    assert.equal(defaultGraphCheckBindings(template, explicit, saved), explicit);
  }
  assert.deepEqual(
    defaultGraphCheckBindings(
      template,
      initial,
      snapshot(build("b1"), build("b2"), testRecipe("t1"), testRecipe("t2")),
    ).recipes,
    {},
  );
  assert.equal(defaultGraphCheckBindings(template, initial, null), initial);
});

test("selected checks resolve by stable id to name, kind and saved state", () => {
  const steps = graphCheckSelection(
    template,
    bind({ build: "b1", test: "t1" }),
    snapshot(build("b1", "Compile"), testRecipe("t1", "Unit tests")),
  );
  assert.deepEqual(
    steps.map((item) => [item.nodeId, item.nodeName, item.unresolved]),
    [
      ["build", "Build", false],
      ["test", "Test", false],
    ],
  );
  const [compile] = step(steps, "build").checks;
  assert.equal(compile!.state, "resolved");
  assert.equal(compile!.recipe!.name, "Compile");
  assert.equal(step(steps, "test").checks[0]!.recipe!.verifier.kind, "test");
});

test("a rename keeps the selection: the same id resolves to the new name", () => {
  const bindings = bind({ build: "b1" });
  const before = graphCheckSelection(template, bindings, snapshot(build("b1", "Compile")));
  const after = graphCheckSelection(template, bindings, snapshot(build("b1", "Compile (release)")));
  assert.equal(before[0]!.checks[0]!.id, after[0]!.checks[0]!.id);
  assert.equal(after[0]!.checks[0]!.state, "resolved");
  assert.equal(after[0]!.checks[0]!.recipe!.name, "Compile (release)");
});

test("a removed check stays selected as missing and is never replaced by another compatible check", () => {
  const bindings = bind({ build: "gone" });
  const steps = graphCheckSelection(template, bindings, snapshot(build("other", "Other build")));
  const [only] = step(steps, "build").checks;
  assert.equal(only!.id, "gone", "the stored id is preserved verbatim");
  assert.equal(only!.state, "missing");
  assert.equal(only!.recipe, undefined);
  assert.equal(step(steps, "build").unresolved, true);
  assert.deepEqual(bindings.recipes, { build: "gone" }, "the draft binding is untouched");
  assert.ok(
    templateBindingErrors(template, {}, bindings, snapshot(build("other"))).includes("Build"),
  );
});

test("a saved check that cannot serve the step is incompatible, not missing", () => {
  const steps = graphCheckSelection(
    template,
    bind({ build: "c1", test: "b1" }),
    snapshot(command("c1"), build("b1")),
  );
  for (const nodeId of ["build", "test"]) {
    const [selected] = step(steps, nodeId).checks;
    assert.equal(selected!.state, "incompatible", nodeId);
    assert.ok(selected!.recipe, "the saved check is still shown so the reason is understandable");
    assert.equal(step(steps, nodeId).unresolved, true);
  }
});

test("no selection and unread checks are not called unresolved, and nothing is auto-selected", () => {
  const none = graphCheckSelection(template, bind({}), snapshot(build("b1"), testRecipe("t1")));
  assert.deepEqual(
    none.map((item) => item.checks),
    [[], []],
  );
  assert.equal(
    none.some((item) => item.unresolved),
    false,
  );
  const unread = graphCheckSelection(template, bind({ build: "b1" }), null);
  assert.equal(unread[0]!.checks[0]!.state, "unread");
  assert.equal(unread[0]!.unresolved, false);
});

test("group members follow the primary in the draft order without duplicates", () => {
  const steps = graphCheckSelection(
    template,
    bind({ build: "b1", test: "t1" }, { recipeGroups: { test: ["t1", "t2", "t1", "gone"] } }),
    snapshot(build("b1"), testRecipe("t1"), testRecipe("t2")),
  );
  assert.deepEqual(
    step(steps, "test").checks.map((item) => [item.id, item.primary, item.state]),
    [
      ["t1", true, "resolved"],
      ["t2", false, "resolved"],
      ["gone", false, "missing"],
    ],
  );
  assert.equal(step(steps, "test").unresolved, true);
});

test("the projection only reads its inputs", () => {
  const bindings = bind({ build: "b1" }, { recipeGroups: { build: ["b1"] } });
  const recipes = snapshot(build("b1"));
  const frozen = structuredClone({ bindings, recipes });
  Object.freeze(bindings.recipes);
  Object.freeze(recipes.recipes);
  graphCheckSelection(template, bindings, recipes);
  assert.deepEqual({ bindings, recipes }, frozen);
});
