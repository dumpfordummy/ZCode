import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConditionNode, GraphSequentialRun } from "../contract.js";
import { routingHistoryErrors } from "../domain/routing-history.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphRoutingDecision } from "./routing-decision.js";
import { routingFixture } from "./routing.fixture.js";
import { GraphState } from "./state.js";
import { target } from "./sequential.fixture.js";

test("oversized combined repair feedback persists Invalid/NeedsHuman without advancing route history", async () => {
  const fixture = routingFixture();
  try {
    const node: GraphConditionNode = {
      id: "decision",
      type: "condition",
      name: "Repair decision",
      position: { x: 0, y: 0 },
      inputs: [
        { alias: "tests", source: { kind: "artifact", nodeId: "test", selector: "verification" } },
        { alias: "review", source: { kind: "artifact", nodeId: "review", selector: "structured" } },
      ],
      branches: [
        {
          exit: "repair",
          predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "needs_changes" },
        },
      ],
      defaultExit: "pass",
      errorPolicy: "needs-human",
      verification: { testNodeIds: ["test"], reviewerNodeId: "review", successExit: "pass" },
    };
    const observations = [
      {
        id: "observation",
        nodeId: "test",
        selector: "verification",
        value: {
          nodeId: "test",
          outcome: "fail",
          tests: Array.from({ length: 25 }, (_, index) => ({
            name: `assert-${index}`,
            status: "failed",
            message: "x".repeat(2000),
          })),
        },
      },
      {
        id: "review-artifact",
        nodeId: "review",
        selector: "structured",
        value: {
          outcome: "needs_changes",
          findings: Array.from({ length: 32 }, (_, index) => ({
            code: `assertion-${index}`,
            message: "y".repeat(2000),
          })),
          evidenceReferences: ["observation"],
        },
      },
    ];
    const artifacts = [];
    for (const observation of observations) {
      const content = JSON.stringify(observation.value);
      assert.ok(content.length < 100_000, "Each individual bound input is within its limit");
      artifacts.push(
        await fixture.options.artifacts!.put({
          target,
          runId: "run",
          nodeId: observation.nodeId,
          attemptId: `${observation.nodeId}-attempt`,
          artifactId: observation.id,
          type: "json",
          provenance: observation.nodeId === "test" ? "native-test" : "native-agent-final",
          content,
          capturedAt: 1,
          validation: "valid",
        }),
      );
    }
    const run = {
      id: "run",
      version: 5,
      target,
      status: "Running",
      definition: {
        nodes: [
          { id: "start", type: "start" },
          { id: "test", type: "tool" },
          { id: "review", type: "task" },
          node,
          { id: "repair", type: "task" },
        ],
        edges: [
          { source: "start", target: "test" },
          { source: "test", target: "review" },
          { source: "review", target: "decision" },
          { source: "decision", sourcePort: "repair", target: "repair" },
        ],
        routing: {
          region: {
            decisionNodeId: "decision",
            repairEntryNodeId: "repair",
            repairExit: "repair",
            bodyNodeIds: ["test", "review", "decision", "repair"],
            stopOnNoProgress: true,
            maxRepairIterations: 2,
          },
        },
      },
      nodeAttempts: [
        {
          nodeId: "review",
          attemptId: "review-attempt",
          status: "Completed",
          terminalProof: { state: "completedSuccess" },
          iterationId: "iteration",
        },
      ],
      toolAttempts: [
        {
          nodeId: "test",
          attemptId: "test-attempt",
          status: "Failed",
          recipe: { verifier: { kind: "test" } },
          verification: { observationValid: true, outcome: "fail" },
          iterationId: "iteration",
        },
      ],
      approvalAttempts: [],
      artifacts,
      artifactBindings: observations.map((observation) => ({
        nodeId: observation.nodeId,
        attemptId: `${observation.nodeId}-attempt`,
        selector: observation.selector,
        artifactId: observation.id,
      })),
      routing: {
        currentIterationId: "iteration",
        cursorNodeId: "decision",
        iterations: [
          {
            id: "iteration",
            index: 0,
            attemptIds: {
              test: "test-attempt",
              review: "review-attempt",
              decision: "decision-attempt",
            },
            visitedNodeIds: ["test", "review"],
            sourceDigest: "source",
          },
        ],
        checkpoints: [],
        conditionAttempts: [
          {
            nodeId: "decision",
            attemptId: "decision-attempt",
            iterationId: "iteration",
            iteration: 0,
            status: "Pending",
          },
        ],
      },
    } as unknown as GraphSequentialRun;
    const budgetRun = structuredClone(run);
    budgetRun.definition.routing!.region!.maxRepairIterations = 0;
    const state = new GraphState(fixture.options);
    const snapshots: GraphSequentialRun[] = [];
    state.put = async (value) => {
      assert.deepEqual(routingHistoryErrors(value as GraphSequentialRun), []);
      snapshots.push(structuredClone(value) as GraphSequentialRun);
    };
    const decision = new GraphRoutingDecision(state, new GraphArtifacts(state));
    await decision.evaluate(run, node);
    const persisted = snapshots.at(-1);
    assert.ok(persisted);
    assert.equal(persisted.status, "NeedsHuman");
    assert.equal(persisted.routing!.conditionAttempts[0]!.status, "Invalid");
    assert.equal(persisted.routing!.conditionAttempts[0]!.bindings?.length, 2);
    assert.ok(persisted.routing!.conditionAttempts[0]!.values?.length);
    assert.match(persisted.message!, /feedback exceeds/);
    assert.deepEqual(persisted.routing!.iterations[0]!.visitedNodeIds, ["test", "review"]);
    assert.equal(persisted.routing!.iterations.length, 1);
    assert.equal(persisted.routing!.checkpoints.length, 0);
    assert.equal(persisted.routing!.cursorNodeId, "decision");
    await decision.evaluate(budgetRun, node);
    const budget = snapshots.at(-1)!;
    assert.equal(budget.status, "BudgetExhausted");
    assert.equal(budget.routing!.conditionAttempts[0]!.status, "Evaluated");
    assert.equal(budget.routing!.conditionAttempts[0]!.selectedExit, "repair");
    assert.deepEqual(budget.routing!.iterations[0]!.visitedNodeIds, ["test", "review", "decision"]);
    assert.equal(budget.routing!.iterations.length, 1);
    assert.equal(budget.routing!.checkpoints.length, 0);
    assert.equal(fixture.creates.length, 0);
    assert.equal(fixture.sends.length, 0);
  } finally {
    await fixture.service.disposeAndWait();
  }
});
