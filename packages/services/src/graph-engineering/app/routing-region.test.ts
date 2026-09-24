import assert from "node:assert/strict";
import test from "node:test";
import type {
  GraphConditionAttempt,
  GraphSequentialDefinition,
  GraphSequentialRun,
  GraphTaskNode,
} from "../contract.js";
import { validateReadiness, validateDefinition } from "../domain/definition.js";
import { evaluateCondition } from "../domain/routing.js";
import { routeVerificationErrors } from "../domain/routing-verification.js";
import { routingTopology } from "../domain/routing-topology.js";

function regionGraph(): GraphSequentialDefinition {
  const position = { x: 0, y: 0 };
  const task = (id: string): GraphTaskNode => ({
    id,
    type: "task",
    name: id,
    position,
    instructions: id,
    instructionMode: "literal",
    inputs: [],
    configuration: { kind: "inherit" },
  });
  return {
    version: 5,
    revision: 1,
    name: "Finite repair",
    routing: {
      finalGateId: "gate",
      limits: { maxNodeAdmissions: 20, deadlineMs: 60_000 },
      region: {
        id: "region",
        name: "Repair",
        entryNodeId: "implement",
        repairEntryNodeId: "repair",
        decisionNodeId: "decision",
        bodyNodeIds: ["implement", "repair", "build", "test", "review", "decision"],
        repairExit: "repair",
        passExit: "pass",
        maxRepairIterations: 2,
        stopOnNoProgress: true,
        sourcePaths: ["source.cs"],
      },
    },
    nodes: [
      { id: "start", type: "start", request: "fix", position },
      task("implement"),
      {
        ...task("repair"),
        instructionMode: "bound",
        instructions: "Fix {{inputs.feedback}}",
        inputs: [{ alias: "feedback", source: { kind: "repair-feedback" } }],
      },
      ...["build", "test"].map((id) => ({
        id,
        type: "tool" as const,
        name: id,
        recipeId: id,
        position,
      })),
      {
        ...task("review"),
        instructionMode: "bound",
        instructions: "Review {{inputs.tests}}",
        inputs: [
          {
            alias: "tests",
            source: { kind: "artifact", nodeId: "test", selector: "verification" },
          },
        ],
        output: {
          kind: "json",
          schema: {
            type: "object",
            properties: {
              outcome: { type: "string", enum: ["pass", "needs_changes", "needs_human"] },
              findings: {
                type: "array",
                maxItems: 32,
                items: {
                  type: "object",
                  properties: { code: { type: "string" }, message: { type: "string" } },
                  required: ["code", "message"],
                  additionalProperties: false,
                },
              },
              evidenceReferences: { type: "array", maxItems: 8, items: { type: "string" } },
            },
            required: ["outcome", "findings", "evidenceReferences"],
            additionalProperties: false,
          },
        },
      },
      {
        id: "decision",
        type: "condition",
        name: "Decision",
        position,
        inputs: [
          {
            alias: "review",
            source: { kind: "artifact", nodeId: "review", selector: "structured" },
          },
          { alias: "test", source: { kind: "artifact", nodeId: "test", selector: "verification" } },
        ],
        branches: [
          {
            exit: "pass",
            predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "pass" },
          },
          {
            exit: "repair",
            predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "needs_changes" },
          },
        ],
        defaultExit: "human",
        errorPolicy: "needs-human",
        verification: { testNodeIds: ["test"], reviewerNodeId: "review", successExit: "pass" },
      },
      {
        id: "gate",
        type: "approval",
        name: "Final",
        position,
        reviewInstructions: "Review",
        evidence: [
          { alias: "result", source: { kind: "artifact", nodeId: "test", selector: "test" } },
        ],
        commentPolicy: "required",
      },
      { id: "end", type: "end", position, outputNodeId: "test" },
    ],
    edges: [
      { source: "start", target: "implement" },
      { source: "implement", target: "build" },
      { source: "repair", target: "build" },
      { source: "build", target: "test" },
      { source: "test", target: "review" },
      { source: "review", target: "decision" },
      { source: "decision", sourcePort: "repair", target: "repair" },
      { source: "decision", sourcePort: "pass", target: "gate" },
      { source: "decision", sourcePort: "human", target: "gate" },
      { source: "gate", target: "end" },
    ],
  };
}
test("a declared finite region has one back edge and exact machine/reviewer dependencies", () => {
  assert.deepEqual(validateReadiness(regionGraph()).errors, []);
  const changes: Array<(g: GraphSequentialDefinition) => void> = [
    (g) => {
      g.routing!.region!.bodyNodeIds.push("gate");
    },
    (g) => {
      g.edges.find((e) => e.source === "build")!.target = "implement";
    },
    (g) => {
      g.edges.find((e) => e.source === "start")!.target = "repair";
    },
    (g) => {
      g.edges.find((e) => e.source === "repair")!.target = "gate";
    },
    (g) => {
      const n = g.nodes.find((n) => n.id === "repair") as GraphTaskNode;
      n.inputs = [];
    },
    (g) => {
      const n = g.nodes.find((n) => n.id === "review") as GraphTaskNode;
      n.inputs = [];
    },
    (g) => {
      const n = g.nodes.find((n) => n.id === "decision");
      if (n?.type === "condition") n.inputs = n.inputs.filter((i) => i.alias !== "test");
    },
    (g) => {
      g.routing!.region!.sourcePaths = ["../outside"];
    },
  ];
  for (const change of changes) {
    const g = regionGraph();
    change(g);
    assert.ok(validateReadiness(g).errors.length);
  }
  const old = regionGraph();
  old.version = 4;
  assert.throws(() => validateDefinition(old));
});
test("Build dominance includes the repair entry and excludes the declared back edge", () => {
  const graph = regionGraph();
  assert.equal(routingTopology(graph).dominates("build", "test"), true);
  graph.edges.find((edge) => edge.source === "repair")!.target = "test";
  assert.equal(routingTopology(graph).dominates("build", "test"), false);
});
test("numeric ordering is finite/typed and boolean combinations inspect both operands", () => {
  const node = regionGraph().nodes.find((n) => n.type === "condition")!;
  node.branches = [
    {
      exit: "pass",
      predicate: {
        op: "all",
        predicates: [
          { op: "gte", alias: "test", pointer: "/count", value: 2 },
          { op: "not", predicate: { op: "eq", alias: "test", pointer: "/failed", value: true } },
        ],
      },
    },
  ];
  assert.equal(evaluateCondition(node, { test: { count: 3, failed: false } }).selectedExit, "pass");
  for (const count of ["3", null, Infinity])
    assert.ok(evaluateCondition(node, { test: { count, failed: false } }).errors.length);
  node.branches = [
    { exit: "pass", predicate: { op: "present", alias: "test", pointer: "/values/00" } },
  ];
  assert.ok(evaluateCondition(node, { test: { values: [1] } }).errors.length);
});
test("cold route validation does not allow schema-valid reviewer PASS to replace failed machine proof", () => {
  const graph = regionGraph(),
    node = graph.nodes.find((n) => n.type === "condition")!;
  const run = {
    version: 5,
    definition: graph,
    routing: { iterations: [{ id: "i1", attemptIds: { test: "test-attempt" } }] },
    toolAttempts: [
      {
        nodeId: "test",
        attemptId: "test-attempt",
        recipe: { verifier: { kind: "test" } },
        verification: { observationValid: true, outcome: "fail", acceptancePassed: false },
      },
    ],
    artifactBindings: [
      { attemptId: "test-attempt", selector: "verification", artifactId: "current-report" },
    ],
  } as unknown as GraphSequentialRun;
  const decision = {
    status: "Evaluated",
    iterationId: "i1",
    selectedExit: "repair",
    bindings: [
      {
        alias: "review",
        value: { outcome: "pass", findings: [], evidenceReferences: ["current-report"] },
      },
    ],
  } as unknown as GraphConditionAttempt;
  assert.ok(routeVerificationErrors(run, node, decision).length);
  const value = decision.bindings![0]!.value as Record<string, unknown>;
  value.outcome = "needs_changes";
  value.findings = [{ code: "assertion", message: "Expected 3; got -1" }];
  assert.deepEqual(routeVerificationErrors(run, node, decision), []);
  for (const coerced of [["needs_changes"], ["pass"]]) {
    value.outcome = coerced;
    assert.ok(routeVerificationErrors(run, node, decision).length);
  }
  value.outcome = "needs_changes";
  value.evidenceReferences = ["old-report"];
  assert.ok(routeVerificationErrors(run, node, decision).length);
  value.evidenceReferences = ["current-report"];
  decision.selectedExit = "pass";
  assert.ok(routeVerificationErrors(run, node, decision).length);
  decision.selectedExit = "repair";
  run.toolAttempts![0]!.verification!.observationValid = false;
  assert.ok(routeVerificationErrors(run, node, decision).length);
});
