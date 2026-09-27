import assert from "node:assert/strict";
import test from "node:test";
import type { GraphScalarConditionPreset } from "../editor-types.js";
import {
  applyGraphConditionPreset,
  applyGraphRepairPolicy,
  graphRepairPreset,
} from "../domain/editor-routing.js";
import { validateReadiness } from "../domain/definition.js";
import { applyWorkflowCheckGroups } from "../domain/workflow-check-groups.js";
import { editorFixture } from "./editor.fixture.js";

const scalar: GraphScalarConditionPreset = {
  alias: "review",
  pointer: "/outcome",
  operator: "eq",
  value: "pass",
  exit: "pass",
  defaultExit: "needs_human",
};

test("typed condition replaces exactly one scalar branch and preserves other branches, evidence and graph", () => {
  const graph = editorFixture("bugfix");
  const before = structuredClone(graph);
  const result = applyGraphConditionPreset(graph, "decision", {
    ...scalar,
    operator: "neq",
    value: "needs_changes",
  });
  const condition = result.nodes.find((node) => node.id === "decision")!;
  const original = graph.nodes.find((node) => node.id === "decision")!;
  assert.equal(condition.type, "condition");
  assert.equal(original.type, "condition");
  if (condition.type !== "condition" || original.type !== "condition") return;
  assert.deepEqual(condition.branches[0]!.predicate, {
    op: "neq",
    alias: "review",
    pointer: "/outcome",
    value: "needs_changes",
  });
  assert.deepEqual(condition.branches[1], original.branches[1]);
  assert.deepEqual(condition.inputs, original.inputs);
  assert.deepEqual(condition.verification, original.verification);
  assert.equal(condition.errorPolicy, "needs-human");
  assert.deepEqual(result.edges, graph.edges);
  assert.deepEqual(validateReadiness(result).errors, []);
  assert.deepEqual(graph, before);
});

test("condition compiler rejects unsupported trees, unknown branches, inputs, scalars and unsafe pointers", () => {
  for (const preset of [
    { ...scalar, alias: "missing" },
    { ...scalar, exit: "invented" },
    { ...scalar, defaultExit: "pass" },
    { ...scalar, pointer: "/__proto__" },
    { ...scalar, operator: "eval" },
    { ...scalar, value: Number.NaN },
    { ...scalar, operator: "gt", value: "five" },
    { ...scalar, operator: "present", value: true },
  ])
    assert.throws(() =>
      applyGraphConditionPreset(
        editorFixture("bugfix"),
        "decision",
        preset as GraphScalarConditionPreset,
      ),
    );
  const graph = editorFixture("bugfix");
  const condition = graph.nodes.find((node) => node.id === "decision")!;
  if (condition.type !== "condition") throw new Error("Missing condition");
  condition.branches[0]!.predicate = { op: "all", predicates: [condition.branches[0]!.predicate] };
  assert.throws(
    () => applyGraphConditionPreset(graph, "decision", scalar),
    /Advanced|scalar|complex/i,
  );
});

test("presence predicate emits no value field and preserves explicit default exit", () => {
  const graph = editorFixture("bugfix");
  const result = applyGraphConditionPreset(graph, "decision", {
    alias: "review",
    pointer: "/outcome",
    operator: "present",
    exit: "pass",
    defaultExit: "needs_human",
  });
  const condition = result.nodes.find((node) => node.id === "decision")!;
  if (condition.type !== "condition") throw new Error("Missing condition");
  assert.deepEqual(condition.branches[0]!.predicate, {
    op: "present",
    alias: "review",
    pointer: "/outcome",
  });
  assert.equal(condition.defaultExit, "needs_human");
});

test("repair projection recognizes existing defaults, and bounded edits preserve all expanded checks and final gate", () => {
  const graph = editorFixture("bugfix");
  applyWorkflowCheckGroups(graph, {
    references: {},
    recipes: { test: "one" },
    recipeGroups: { test: ["one", "two", "three"] },
    sourcePaths: ["source"],
  });
  const before = structuredClone(graph);
  const projection = graphRepairPreset(graph);
  assert.equal(projection.supported, true);
  assert.deepEqual(projection.policy, {
    additionalRepairs: 2,
    deadlineMinutes: 30,
    maxNodeAdmissions: 24,
    stopOnNoProgress: true,
  });
  assert.deepEqual(projection.testNodeIds, ["test", "test__check_2", "test__check_3"]);
  assert.equal(projection.finalGateId, "final-gate");
  const edited = applyGraphRepairPolicy(graph, {
    additionalRepairs: 5,
    deadlineMinutes: 1440,
    maxNodeAdmissions: 64,
    stopOnNoProgress: false,
  });
  assert.equal(edited.routing!.region!.maxRepairIterations, 5);
  assert.equal(edited.routing!.limits.deadlineMs, 86_400_000);
  assert.deepEqual(edited.nodes, graph.nodes);
  assert.deepEqual(edited.edges, graph.edges);
  assert.deepEqual(graphRepairPreset(edited).testNodeIds, projection.testNodeIds);
  assert.deepEqual(validateReadiness(edited).errors, []);
  assert.deepEqual(graph, before);
});

test("unsupported custom repair declarations and invalid budgets remain explicit without destructive conversion", () => {
  const graph = editorFixture("bugfix");
  const policy = graphRepairPreset(graph).policy!;
  for (const change of [
    { additionalRepairs: -1 },
    { additionalRepairs: 6 },
    { additionalRepairs: 1.5 },
    { deadlineMinutes: 0 },
    { deadlineMinutes: 1441 },
    { deadlineMinutes: Number.NaN },
    { maxNodeAdmissions: 0 },
    { maxNodeAdmissions: 65 },
    { maxNodeAdmissions: 2.5 },
  ])
    assert.throws(() => applyGraphRepairPolicy(graph, { ...policy, ...change }));
  const custom = structuredClone(graph);
  const condition = custom.nodes.find((node) => node.id === "decision")!;
  if (condition.type !== "condition") throw new Error("Missing condition");
  condition.branches[0]!.predicate = { op: "not", predicate: condition.branches[0]!.predicate };
  const before = structuredClone(custom);
  assert.equal(graphRepairPreset(custom).supported, false);
  assert.throws(() => applyGraphRepairPolicy(custom, policy), /Advanced|supported|preset/i);
  assert.deepEqual(custom, before);
  custom.nodes = custom.nodes.filter((node) => node.id !== "final-gate");
  assert.equal(graphRepairPreset(custom).supported, false);
});
