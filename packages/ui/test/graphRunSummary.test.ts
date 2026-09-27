import assert from "node:assert/strict";
import test from "node:test";
import type { GraphLegacyRun } from "@zcode/services";
import { graphRunSummary } from "../src/graph-engineering/graphRunSummary.js";
import {
  addCheck,
  approvedGate,
  nextSummaryIteration,
  summaryRun,
} from "./graphRunSummary.fixture.js";

test("execution completion, machine evidence and exact human decision are independent captured axes", () => {
  const run = summaryRun(),
    before = structuredClone(run),
    result = graphRunSummary(run);
  assert.equal(result.execution.status, "Completed");
  assert.equal(result.evidence.state, "agent-reported");
  assert.equal(result.human.state, "approved");
  assert.equal(result.requestText, "Captured request");
  assert.deepEqual(result.target, run.target);
  assert.deepEqual(result.result, { kind: "text", text: "Agent said PASS" });
  assert.deepEqual(run, before);
  result.target.workspacePath = "Changed projection";
  assert.equal(run.target.workspacePath, "C:/synthetic");
});

test("missing or stale approval request and mismatched decision never become current human approval", () => {
  for (const mutate of [
    (run: ReturnType<typeof summaryRun>) => {
      delete run.approvalAttempts![0]!.request;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.request!.complete = false;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.status = "StaleEvidence";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.status = "StaleEvidence";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.decision!.requestId = "foreign";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.decision!.requestVersion++;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.decision!.requestDigest = "foreign";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.request!.attemptId = "foreign";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.approvalAttempts![0]!.request!.target.workspaceIdentity = "foreign";
    },
  ]) {
    const run = summaryRun();
    mutate(run);
    assert.equal(graphRunSummary(run).human.state, "pending");
    assert.ok(graphRunSummary(run).human.issues.length);
  }
});

test("current final gate excludes unvisited repaired entry gates and never borrows the previous approval", () => {
  const run = summaryRun();
  const gateNode = run.definition.nodes.find((node) => node.id === "gate")!;
  run.definition.nodes.push({ ...gateNode, id: "entry" });
  run.approvalAttempts!.push(approvedGate(run, "entry"));
  run.routing!.iterations[0]!.attemptIds.entry = "entry-0";
  nextSummaryIteration(run);
  run.approvalAttempts!.push({
    ...approvedGate(run, "entry"),
    attemptId: "entry-1",
    iterationId: "iteration-1",
    iteration: 1,
    status: "Pending",
    request: undefined,
    decision: undefined,
  });
  const result = graphRunSummary(run);
  assert.equal(result.human.state, "pending");
  assert.deepEqual(
    result.human.gates.map((gate) => gate.nodeId),
    ["gate"],
  );
  assert.equal(result.human.gates[0]!.attemptId, undefined);
  assert.deepEqual(result.sourceChanges, []);
});

test("rejected admitted gate remains visible with a not-yet-reached final gate", () => {
  const run = summaryRun(),
    final = run.approvalAttempts![0]!;
  run.definition.nodes.push({
    ...run.definition.nodes.find((node) => node.id === "gate")!,
    id: "entry",
  });
  const entry = approvedGate(run, "entry");
  entry.status = "Rejected";
  entry.decision!.value = "reject";
  run.approvalAttempts!.push(entry);
  run.routing!.iterations[0]!.attemptIds.entry = entry.attemptId;
  run.routing!.iterations[0]!.visitedNodeIds = ["entry"];
  run.routing!.cursorNodeId = "entry";
  final.status = "Skipped";
  delete final.request;
  delete final.decision;
  run.status = "Rejected";
  assert.equal(graphRunSummary(run).human.state, "rejected");
  assert.ok(
    graphRunSummary(run).human.gates.some(
      (gate) => gate.nodeId === "entry" && gate.state === "rejected",
    ),
  );
});

test("older sequential gates use frozen planned path and missing gates cannot disappear from the summary", () => {
  const run = summaryRun();
  run.version = 3;
  run.definition.version = 3;
  delete run.routing;
  delete run.definition.routing;
  assert.equal(graphRunSummary(run).human.state, "approved");
  run.approvalAttempts = [];
  assert.equal(graphRunSummary(run).human.state, "pending");
  run.plannedPath = ["task"];
  assert.equal(graphRunSummary(run).human.state, "not-required");
});

test("captured source display retains exact request time/scope/completeness and never manufactures a live diff", () => {
  const run = summaryRun();
  const snapshot = run.approvalAttempts![0]!.request!.evidence[0]!.snapshot!;
  snapshot.complete = false;
  snapshot.issues.push("Captured limit");
  const result = graphRunSummary(run);
  assert.equal(result.sourceChanges.length, 1);
  assert.deepEqual(result.sourceChanges[0], {
    nodeId: "gate",
    attemptId: "gate-0",
    requestId: "request-gate",
    alias: "source",
    capturedAt: 2,
    snapshot,
  });
  result.sourceChanges[0]!.snapshot.files[0]!.diff = "+changed projection";
  assert.equal(snapshot.files[0]!.diff, "+captured");
});

test("permission/question and unknown sessions resolve current exact attempts, never prior iteration sessions", () => {
  for (const status of [
    "WaitingForPermission",
    "WaitingForUser",
    "Unknown",
    "Interrupted",
  ] as const) {
    const run = summaryRun();
    nextSummaryIteration(run);
    const current = {
      ...structuredClone(run.nodeAttempts[0]!),
      attemptId: "task-1",
      iterationId: "iteration-1",
      iteration: 1,
      sessionId: "session-current",
      status,
    };
    run.nodeAttempts.unshift(current);
    run.status = status;
    const result = graphRunSummary(run);
    assert.equal(result.execution.currentStep!.attemptId, "task-1");
    assert.deepEqual(
      result.actionableSessions.map((attempt) => attempt.sessionId),
      ["session-current"],
    );
    assert.equal(result.actionableSessions[0]!.nodeId, "task");
  }
});

test("Stop requested survives late completed attempt until run terminal proof; unrelated sessions are not invented", () => {
  const run = summaryRun();
  const tool = addCheck(run);
  run.status = "CancelRequested";
  run.cancelRequestedAt = 3;
  tool.status = "CancelRequested";
  assert.equal(graphRunSummary(run).execution.stopRequested, true);
  assert.deepEqual(
    graphRunSummary(run).actionableSessions.map((item) => item.sessionId),
    ["session-check"],
  );
  tool.status = "Completed";
  assert.equal(graphRunSummary(run).execution.stopRequested, true);
  run.status = "Cancelled";
  assert.equal(graphRunSummary(run).execution.stopRequested, false);
});

test("approval/checkpoint action projections reuse existing admission state and exact saved targets", () => {
  const run = summaryRun(),
    gate = run.approvalAttempts![0]!;
  gate.status = "WaitingForApproval";
  delete gate.decision;
  run.status = "WaitingForApproval";
  run.routing!.cursorNodeId = "gate";
  assert.equal(graphRunSummary(run).human.gates[0]!.canDecide, true);
  gate.resumeRequired = true;
  run.status = "AwaitingContinuation";
  assert.equal(graphRunSummary(run).human.gates[0]!.canContinue, true);
  assert.equal(graphRunSummary(run).human.gates[0]!.canDecide, false);
  run.routing!.checkpoints.push({
    id: "checkpoint",
    digest: "captured",
    decisionId: "decision",
    iterationId: "iteration-0",
    successorNodeId: "gate",
    createdAt: 2,
    resumeRequired: true,
  });
  assert.deepEqual(graphRunSummary(run).checkpoint, {
    id: "checkpoint",
    digest: "captured",
    successorNodeId: "gate",
  });
  run.status = "Unknown";
  assert.equal(graphRunSummary(run).checkpoint, undefined);
  assert.equal(graphRunSummary(run).human.gates[0]!.canContinue, false);
});

test("legacy runs preserve captured instructions, status, target and lack of result without fake final text", () => {
  const run: GraphLegacyRun = {
    id: "legacy",
    attemptId: "legacy-attempt",
    requestId: "legacy-request",
    commandId: "command",
    inputId: "input",
    sessionId: "session-legacy",
    target: { workspacePath: "C:/old", workspaceIdentity: "old:identity" },
    definition: {
      revision: 1,
      name: "Old",
      taskName: "Old task",
      instructions: "Old captured instruction",
      nodes: [{ id: "task", type: "task", position: { x: 0, y: 0 } }],
      edges: [],
    },
    modelSelection: { providerId: "fixture", modelId: "fixture" },
    mode: "build",
    status: "Interrupted",
    createdAt: 1,
    updatedAt: 2,
  };
  const result = graphRunSummary(run);
  assert.equal(result.requestText, "Old captured instruction");
  assert.deepEqual(result.result, { kind: "absent" });
  assert.equal(result.human.state, "not-required");
  assert.equal(result.evidence.state, "no-tests");
  assert.equal(result.actionableSessions[0]!.sessionId, "session-legacy");
  assert.equal(result.target.workspaceIdentity, "old:identity");
});

test("late terminal reconciliation keeps uncertain route inspection available without implying replay or approval", () => {
  const run = summaryRun();
  run.status = "Interrupted";
  assert.deepEqual(
    graphRunSummary(run).actionableSessions.map((item) => item.sessionId),
    ["session-task"],
  );
  run.release = {
    releasedAt: 4,
    reason: "Audited inactive",
    inspection: { inspectedAt: 4, state: "inactive", reason: "Exact proof", attempts: [] },
  };
  assert.deepEqual(graphRunSummary(run).actionableSessions, []);
  assert.equal(graphRunSummary(run).execution.status, "Interrupted");
});

test("an uncertain cancellation retains Stop requested until authoritative inactivity or a terminal run", () => {
  const run = summaryRun();
  run.cancelRequestedAt = 3;
  for (const status of ["Unknown", "Interrupted", "CancelRequested"] as const) {
    run.status = status;
    assert.equal(graphRunSummary(run).execution.stopRequested, true);
  }
  run.recovery = {
    inspectedAt: 4,
    state: "inactive",
    reason: "Exact original native inactivity proof",
    attempts: [],
  };
  assert.equal(graphRunSummary(run).execution.stopRequested, false);
  assert.equal(graphRunSummary(run).execution.status, "CancelRequested");
});
