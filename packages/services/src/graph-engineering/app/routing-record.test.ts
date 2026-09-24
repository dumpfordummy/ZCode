import assert from "node:assert/strict";
import test from "node:test";
import type { GraphSequentialRun } from "../contract.js";
import { routingGraph } from "../domain/routing.fixture.js";
import { validateReadiness } from "../domain/definition.js";
import { recordSchema } from "../domain/record.js";
import { routeCheckpoint, routingInactive } from "../domain/routing.js";
import { resumableGate } from "../domain/approvals.js";

const digest = "a".repeat(64);
const settings = {
  modelSelection: { providerId: "test", modelId: "model" },
  mode: "edit" as const,
  planEnabled: false,
};
function record() {
  const definition = routingGraph();
  const run: GraphSequentialRun = {
    version: 5,
    id: "run",
    requestId: "request",
    requestFingerprint: "frozen",
    target: { workspacePath: "/synthetic" },
    definition,
    defaults: settings,
    plannedPath: validateReadiness(definition).path,
    startInput: "review",
    status: "Starting",
    createdAt: 10,
    updatedAt: 10,
    nodeAttempts: definition.nodes
      .filter((n) => n.type === "task")
      .map((n) => ({
        nodeId: n.id,
        attemptId: `a-${n.id}`,
        commandId: `c-${n.id}`,
        inputId: `c-${n.id}`,
        iterationId: "i0",
        iteration: 0,
        status: "Pending",
        dispatchPhase: "planned",
        settings: { ...settings, source: "workspace" },
        createdAt: 10,
        updatedAt: 10,
      })),
    approvalAttempts: [
      {
        nodeId: "gate",
        attemptId: "a-gate",
        iterationId: "i0",
        iteration: 0,
        status: "Pending",
        createdAt: 10,
        updatedAt: 10,
      },
    ],
    toolAttempts: [],
    artifacts: [],
    artifactBindings: [],
    routing: {
      configurationDigest: digest,
      recipeConfigurationDigest: digest,
      currentIterationId: "i0",
      cursorNodeId: "task",
      iterations: [
        {
          id: "i0",
          index: 0,
          createdAt: 10,
          attemptIds: Object.fromEntries(
            definition.nodes
              .filter((n) => n.type !== "start" && n.type !== "end")
              .map((n) => [n.id, `a-${n.id}`]),
          ),
          visitedNodeIds: [],
        },
      ],
      conditionAttempts: [
        {
          nodeId: "decision",
          attemptId: "a-decision",
          iterationId: "i0",
          iteration: 0,
          status: "Pending",
          createdAt: 10,
          updatedAt: 10,
        },
      ],
      admissions: 0,
      deadlineAt: 60_010,
      checkpoints: [],
      continuations: [],
    },
  };
  return { version: 5, workspaceKey: "/synthetic", definition, runs: [run] };
}
test("version-5 initial frozen records round-trip without rewriting old versions", () => {
  const value = record();
  assert.deepEqual(recordSchema.parse(value), value);
  value.version = 4;
  assert.equal(recordSchema.safeParse(value).success, false);
});
test("tampered iteration identity, counters, deadlines and unmapped attempts reject", () => {
  const changes: Array<(run: GraphSequentialRun) => void> = [
    (r) => {
      r.routing!.iterations[0]!.attemptIds.task = "foreign";
    },
    (r) => {
      r.nodeAttempts[0]!.iterationId = "old";
    },
    (r) => {
      r.routing!.admissions = 1;
    },
    (r) => {
      r.routing!.deadlineAt++;
    },
    (r) => {
      r.routing!.cursorNodeId = "yes";
    },
    (r) => {
      r.routing!.iterations[0]!.visitedNodeIds = ["task", "no"];
    },
    (r) => {
      r.routing!.iterations[0]!.attemptIds.invented = "foreign";
    },
    (r) => {
      r.nodeAttempts.push({
        ...r.nodeAttempts[0]!,
        attemptId: "extra",
        commandId: "extra",
        inputId: "extra",
      });
    },
    (r) => {
      r.routing!.conditionAttempts[0]!.selectedExit = "yes";
    },
    (r) => {
      r.routing!.checkpoints.push({
        id: "checkpoint",
        digest,
        decisionId: "invented",
        iterationId: "i0",
        successorNodeId: "yes",
        createdAt: 10,
      });
    },
  ];
  for (const change of changes) {
    const value = record();
    change(value.runs[0]!);
    assert.equal(recordSchema.safeParse(value).success, false);
  }
});
test("unknown native creation/sending and a started unobserved Tool never become a safe checkpoint", () => {
  const run = record().runs[0]!;
  run.routing!.checkpoints.push({
    id: "checkpoint",
    digest,
    decisionId: "decision",
    iterationId: "i0",
    successorNodeId: "task",
    createdAt: 10,
  });
  assert.ok(routeCheckpoint(run));
  run.nodeAttempts[1]!.dispatchPhase = "creating";
  assert.equal(routingInactive(run), false);
  assert.equal(routeCheckpoint(run), undefined);
  run.nodeAttempts[1]!.dispatchPhase = "sending";
  run.nodeAttempts[1]!.sessionId = "session";
  run.nodeAttempts[1]!.runtimeIdentity = "runtime";
  assert.equal(routingInactive(run), false);
  run.nodeAttempts[1]!.dispatchPhase = "created";
  assert.equal(routingInactive(run), true);
  run.nodeAttempts[0]!.dispatchPhase = "created";
  run.nodeAttempts[0]!.sessionId = "session0";
  run.nodeAttempts[0]!.runtimeIdentity = "runtime";
  assert.equal(routeCheckpoint(run), undefined, "a created successor is never replayed");
  run.toolAttempts = [
    {
      dispatchPhase: "accepted",
      sessionId: "tool",
      runtimeIdentity: "runtime",
      operationId: "operation",
      operation: {
        operationId: "operation",
        sessionId: "tool",
        status: "completed",
        completedAt: 12,
        processStarted: true,
      },
    } as NonNullable<GraphSequentialRun["toolAttempts"]>[number],
  ];
  assert.equal(
    routingInactive(run),
    false,
    "a terminal label cannot replace a process exit observation",
  );
});
test("a begun approval or Condition cannot masquerade as an undispatched route checkpoint", () => {
  const run = record().runs[0]!;
  run.routing!.cursorNodeId = "gate";
  run.routing!.checkpoints.push({
    id: "checkpoint",
    digest,
    decisionId: "decision",
    iterationId: "i0",
    successorNodeId: "gate",
    createdAt: 10,
  });
  assert.ok(routeCheckpoint(run));
  const gate = run.approvalAttempts![0]!;
  gate.status = "WaitingForApproval";
  gate.request = { id: "request" } as NonNullable<typeof gate.request>;
  assert.equal(routeCheckpoint(run), undefined);
  assert.equal(resumableGate(run)?.attemptId, gate.attemptId);
  gate.status = "Approved";
  gate.decision = { id: "approved", value: "approve" } as NonNullable<typeof gate.decision>;
  gate.successorIntent = { id: "successor", successorNodeId: "end" };
  assert.equal(
    resumableGate(run)?.attemptId,
    gate.attemptId,
    "committed approval before cursor advance remains explicitly continuable",
  );
  run.routing!.cursorNodeId = "decision";
  run.routing!.checkpoints[0]!.successorNodeId = "decision";
  assert.ok(routeCheckpoint(run));
  run.routing!.conditionAttempts[0]!.status = "Evaluated";
  assert.equal(routeCheckpoint(run), undefined);
});
