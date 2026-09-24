import assert from "node:assert/strict";
import test from "node:test";
import type { GraphConditionNode, GraphSequentialRun } from "../contract.js";
import { evaluateCondition } from "../domain/routing.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphRoutingDecision } from "./routing-decision.js";
import { routingFixture } from "./routing.fixture.js";
import { GraphState } from "./state.js";
import { target } from "./sequential.fixture.js";

test("checkpoint without a reviewer accepts failed machine evidence only on a non-success exit", async () => {
  const f = routingFixture();
  try {
    const node: GraphConditionNode = {
      id: "decision",
      type: "condition",
      name: "Machine decision",
      position: { x: 0, y: 0 },
      inputs: [
        { alias: "tests", source: { kind: "artifact", nodeId: "test", selector: "verification" } },
      ],
      branches: [
        {
          exit: "pass",
          predicate: { op: "eq", alias: "tests", pointer: "/outcome", value: "pass" },
        },
      ],
      defaultExit: "human",
      errorPolicy: "needs-human",
      verification: { testNodeIds: ["test"], successExit: "pass" },
    };
    const value = { outcome: "fail" };
    const artifact = await f.options.artifacts!.put({
      target,
      runId: "run",
      nodeId: "test",
      attemptId: "test-attempt",
      artifactId: "observation",
      type: "json",
      provenance: "native-test",
      content: JSON.stringify(value),
      capturedAt: 1,
      validation: "valid",
    });
    const run = {
      id: "run",
      version: 5,
      target,
      definition: { nodes: [node], routing: {} },
      nodeAttempts: [],
      toolAttempts: [
        {
          nodeId: "test",
          attemptId: "test-attempt",
          status: "Failed",
          recipe: { verifier: { kind: "test" } },
          verification: { observationValid: true },
        },
      ],
      artifacts: [artifact],
      artifactBindings: [
        {
          nodeId: "test",
          attemptId: "test-attempt",
          selector: "verification",
          artifactId: artifact.id,
        },
      ],
      routing: {
        currentIterationId: "iteration",
        cursorNodeId: "gate",
        iterations: [{ id: "iteration", attemptIds: { test: "test-attempt" } }],
        checkpoints: [{ decisionId: "selected", successorNodeId: "gate" }],
        conditionAttempts: [
          {
            nodeId: node.id,
            decisionId: "selected",
            iterationId: "iteration",
            status: "Evaluated",
            selectedExit: "human",
            bindings: [{ alias: "tests", artifactId: artifact.id, digest: artifact.digest, value }],
            values: evaluateCondition(node, { tests: value }).values,
          },
        ],
      },
    } as unknown as GraphSequentialRun;
    const state = new GraphState(f.options);
    const decision = new GraphRoutingDecision(state, new GraphArtifacts(state));
    await decision.verifyCheckpoint(run);
    node.branches[0]!.predicate = { op: "eq", alias: "tests", pointer: "/outcome", value: "fail" };
    run.routing!.conditionAttempts[0]!.selectedExit = "pass";
    run.routing!.conditionAttempts[0]!.values = evaluateCondition(node, { tests: value }).values;
    await assert.rejects(decision.verifyCheckpoint(run), /failed machine verification/);
    assert.equal(f.creates.length, 0);
  } finally {
    await f.service.disposeAndWait();
  }
});
