import assert from "node:assert/strict";
import test from "node:test";
import type { GraphJsonValue, GraphSequentialDefinition, GraphSequentialRun } from "../contract.js";
import { validateReadiness, validateDefinition } from "../domain/definition.js";
import { currentTaskAttempt, evaluateCondition } from "../domain/routing.js";
import { verifyToolReport } from "../domain/tool-verification.js";
import { condition, routingGraph } from "../domain/routing.fixture.js";

test("typed conditions keep false/default distinct from missing or wrong types", () => {
  assert.equal(evaluateCondition(condition(), { review: { passed: true } }).selectedExit, "yes");
  assert.equal(evaluateCondition(condition(), { review: { passed: false } }).selectedExit, "no");
  const invalidValues: Record<string, GraphJsonValue>[] = [
    {},
    { review: {} },
    { review: { passed: "true" } },
  ];
  for (const values of invalidValues) {
    const result = evaluateCondition(condition(), values);
    assert.equal(result.selectedExit, undefined);
    assert.ok(result.errors.length);
  }
  const present = condition();
  present.branches[0]!.predicate = { op: "present", alias: "review", pointer: "/passed" };
  for (const passed of [null, false, 0])
    assert.equal(evaluateCondition(present, { review: { passed } }).selectedExit, "yes");
  assert.equal(evaluateCondition(present, { review: {} }).selectedExit, "no");
  present.branches[0]!.predicate = { op: "present", alias: "review", pointer: "/__proto__" };
  assert.ok(evaluateCondition(present, { review: {} }).errors.length);
});
test("predicate bounds and non-short-circuited invalid operands cannot select success", () => {
  const node = condition();
  node.branches[0]!.predicate = {
    op: "any",
    predicates: [
      { op: "eq", alias: "review", pointer: "/passed", value: true },
      { op: "gt", alias: "review", pointer: "/missing", value: 0 },
    ],
  };
  assert.ok(evaluateCondition(node, { review: { passed: true } }).errors.length);
  for (let i = 0; i < 9; i++)
    node.branches[0]!.predicate = { op: "not", predicate: node.branches[0]!.predicate };
  assert.throws(() =>
    validateDefinition({
      ...routingGraph(),
      nodes: routingGraph().nodes.map((n) => (n.id === "decision" ? node : n)),
    }),
  );
});
test("malformed predicate operator types fail definition validation and cannot select an exit", () => {
  for (const op of [["eq"], ["lt"], null, 1, {}]) {
    const graph = routingGraph();
    const node = graph.nodes.find((value) => value.type === "condition")!;
    node.branches[0]!.predicate = { op, alias: "review", pointer: "/passed", value: 1 } as never;
    const result = evaluateCondition(node, { review: { passed: 1 } });
    assert.ok(result.errors.length);
    assert.equal(result.selectedExit, undefined);
    assert.throws(() => validateDefinition(graph));
    assert.ok(validateReadiness(graph).errors.length);
  }
});
test("exclusive branches can merge but every End path requires the final gate", () => {
  assert.deepEqual(validateReadiness(routingGraph()).errors, []);
  for (const change of [
    (g: GraphSequentialDefinition) => {
      g.edges.find((e) => e.source === "no")!.target = "end";
    },
    (g: GraphSequentialDefinition) => {
      g.edges.find((e) => e.source === "decision")!.sourcePort = "invented";
    },
    (g: GraphSequentialDefinition) => {
      g.edges.find((e) => e.source === "no")!.target = "task";
    },
    (g: GraphSequentialDefinition) => {
      const n = g.nodes.find((n) => n.id === "gate");
      if (n?.type === "approval")
        n.evidence = [{ alias: "branch", source: { kind: "node", nodeId: "yes" } }];
    },
  ]) {
    const graph = routingGraph();
    change(graph);
    assert.ok(validateReadiness(graph).errors.length);
  }
  const old = { ...routingGraph(), version: 4 };
  assert.throws(() => validateDefinition(old));
});
test("current attempt uses the exact iteration map and never first/last history fallback", () => {
  const run = {
    version: 5,
    nodeAttempts: [
      { nodeId: "task", attemptId: "old" },
      { nodeId: "task", attemptId: "current" },
      { nodeId: "task", attemptId: "late" },
    ],
    routing: {
      currentIterationId: "i1",
      iterations: [{ id: "i1", index: 1, attemptIds: { task: "current" } }],
    },
  } as unknown as GraphSequentialRun;
  assert.equal(currentTaskAttempt(run, "task")?.attemptId, "current");
  run.routing!.iterations[0]!.attemptIds.task = "missing";
  assert.equal(currentTaskAttempt(run, "task"), undefined);
});
test("final approval must follow all native executable work on every End path", () => {
  for (const type of ["task", "tool"] as const) {
    const graph = routingGraph();
    const task = graph.nodes.find((node) => node.id === "task")!;
    graph.nodes.push(
      type === "task"
        ? { ...task, id: "late" }
        : {
            id: "late",
            type: "tool",
            name: "Late native tool",
            recipeId: "build",
            position: { x: 0, y: 0 },
          },
    );
    graph.edges.find((edge) => edge.source === "gate")!.target = "late";
    graph.edges.push({ source: "late", target: "end" });
    assert.ok(validateReadiness(graph).errors.some((error) => error.includes("follow all native")));
  }
  const graph = routingGraph();
  const gate = graph.nodes.find((node) => node.id === "gate")!;
  graph.nodes.push({ ...gate, id: "extra-approval" });
  graph.edges.find((edge) => edge.source === "gate")!.target = "extra-approval";
  graph.edges.push({ source: "extra-approval", target: "end" });
  assert.deepEqual(validateReadiness(graph).errors, []);
});
test("real failed assertions are provenance-valid while malformed or foreign reports are not", () => {
  const expected = {
    operationId: "op",
    sourceDigest: "source",
    buildDigest: "build",
    minimumTests: 1,
    expectedTests: 1,
    requiredTests: ["add"],
  };
  const report = {
    format: "zcode-test-v1",
    operationId: "op",
    sourceDigest: "source",
    buildDigest: "build",
    tests: [{ name: "add", status: "failed", message: "Expected 3; got -1" }],
  };
  const result = verifyToolReport(JSON.stringify(report), expected);
  assert.equal(result.provenanceValid, true);
  assert.equal(result.outcome, "fail");
  assert.deepEqual(result.tests, report.tests);
  assert.ok(result.issues.length, "Z4 acceptance remains failed");
  for (const bad of [
    { ...report, operationId: "old" },
    { ...report, tests: [] },
    { ...report, tests: [{ name: "add", status: "skipped" }] },
    { ...report, tests: [{ name: "other", status: "failed" }] },
  ]) {
    const value = verifyToolReport(JSON.stringify(bad), expected);
    assert.equal(value.provenanceValid, false);
    assert.equal(value.outcome, "invalid");
  }
});
