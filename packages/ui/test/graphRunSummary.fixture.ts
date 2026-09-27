import type {
  GraphApprovalAttempt,
  GraphSequentialRun,
  GraphToolAttempt,
  GraphToolVerification,
} from "@zcode/services";

/** Unit-only captured records, not native execution evidence or a replacement for native checks. */
export function summaryRun(): GraphSequentialRun {
  const settings = {
    modelSelection: { providerId: "fixture", modelId: "fixture" },
    mode: "build" as const,
    planEnabled: false,
  };
  const run: GraphSequentialRun = {
    id: "run",
    version: 5,
    requestId: "request",
    requestFingerprint: "f".repeat(64),
    target: { workspacePath: "C:/synthetic", workspaceIdentity: "fixture:captured" },
    definition: {
      version: 5,
      revision: 1,
      name: "Captured workflow",
      nodes: [
        { id: "start", type: "start", request: "Captured request", position: { x: 0, y: 0 } },
        {
          id: "task",
          type: "task",
          name: "Implement",
          instructions: "Original",
          instructionMode: "literal",
          inputs: [],
          configuration: { kind: "inherit" },
          position: { x: 1, y: 0 },
        },
        {
          id: "gate",
          type: "approval",
          name: "Review result",
          reviewInstructions: "Review captured source",
          evidence: [{ alias: "source", source: { kind: "source" } }],
          commentPolicy: "optional",
          position: { x: 2, y: 0 },
        },
        { id: "end", type: "end", outputNodeId: "task", position: { x: 3, y: 0 } },
      ],
      edges: [
        { source: "start", target: "task" },
        { source: "task", target: "gate" },
        { source: "gate", target: "end" },
      ],
      routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 24, deadlineMs: 1_800_000 } },
    },
    defaults: settings,
    plannedPath: ["task", "gate"],
    startInput: "Captured request",
    nodeAttempts: [
      {
        nodeId: "task",
        attemptId: "task-0",
        commandId: "command",
        inputId: "input",
        status: "Completed",
        dispatchPhase: "accepted",
        settings: { ...settings, source: "workspace" },
        createdAt: 1,
        updatedAt: 2,
        sessionId: "session-task",
        runtimeIdentity: "runtime",
        terminalProof: {
          sourceCommandId: "command",
          state: "completedSuccess",
          logEpoch: "epoch",
          seq: 2,
        },
        finalOutput: { text: "Agent said PASS", turnId: "turn", rowId: 1 },
      },
    ],
    approvalAttempts: [],
    toolAttempts: [],
    artifacts: [],
    artifactBindings: [],
    routing: {
      configurationDigest: "c".repeat(64),
      recipeConfigurationDigest: "d".repeat(64),
      currentIterationId: "iteration-0",
      cursorNodeId: "end",
      iterations: [
        {
          id: "iteration-0",
          index: 0,
          createdAt: 1,
          attemptIds: { task: "task-0", gate: "gate-0" },
          visitedNodeIds: ["task", "gate"],
        },
      ],
      conditionAttempts: [],
      admissions: 1,
      deadlineAt: 1_800_001,
      checkpoints: [],
      continuations: [],
    },
    status: "Completed",
    createdAt: 1,
    updatedAt: 3,
    result: { text: "Agent said PASS", turnId: "turn", rowId: 1 },
  };
  run.nodeAttempts[0]!.iterationId = "iteration-0";
  run.nodeAttempts[0]!.iteration = 0;
  run.approvalAttempts!.push(approvedGate(run));
  return run;
}

export function approvedGate(run: GraphSequentialRun, nodeId = "gate"): GraphApprovalAttempt {
  return {
    nodeId,
    attemptId: `${nodeId}-0`,
    iterationId: "iteration-0",
    iteration: 0,
    status: "Approved",
    createdAt: 1,
    updatedAt: 3,
    request: {
      id: `request-${nodeId}`,
      version: 1,
      runId: run.id,
      nodeId,
      attemptId: `${nodeId}-0`,
      target: structuredClone(run.target),
      graphDigest: "a".repeat(64),
      digest: "b".repeat(64),
      title: "Captured gate",
      reviewText: "Review exact source",
      commentPolicy: "optional",
      successorNodeId: "end",
      evidence: [
        {
          alias: "source",
          source: { kind: "source" },
          digest: "c".repeat(64),
          snapshot: {
            baseline: "base",
            scope: "tracked worktree diff",
            files: [{ path: "source.ts", status: "modified", diff: "+captured" }],
            complete: true,
            issues: [],
          },
        },
      ],
      complete: true,
      issues: [],
      createdAt: 2,
    },
    decision: {
      id: `decision-${nodeId}`,
      requestId: `request-${nodeId}`,
      requestVersion: 1,
      requestDigest: "b".repeat(64),
      value: "approve",
      comment: "Reviewed",
      decidedAt: 3,
      actor: { kind: "local-user", hostSessionId: "host" },
    },
  };
}

export function addCheck(
  run: GraphSequentialRun,
  id = "check",
  kind: "test" | "build" | "command" = "test",
): GraphToolAttempt {
  const node = {
    id,
    type: "tool" as const,
    name: `Captured ${id}`,
    recipeId: id,
    position: { x: 1, y: 1 },
  };
  run.definition.nodes.splice(-2, 0, node);
  run.plannedPath.splice(-1, 0, id);
  const verification: GraphToolVerification = {
    classification: kind,
    processKnown: true,
    exitSuccessful: true,
    reportFresh: kind === "test",
    reportParsed: kind === "test",
    acceptancePassed: true,
    issues: [],
    ...(kind === "test"
      ? {
          observationValid: true,
          outcome: "pass" as const,
          testCount: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
          tests: [{ name: `${id}.assertion`, status: "passed" as const }],
        }
      : {}),
  };
  const attempt: GraphToolAttempt = {
    nodeId: id,
    attemptId: `${id}-0`,
    iterationId: "iteration-0",
    iteration: 0,
    operationId: `operation-${id}`,
    recipeDigest: "d".repeat(64),
    status: "Completed",
    dispatchPhase: "accepted",
    createdAt: 1,
    updatedAt: 2,
    sessionId: `session-${id}`,
    runtimeIdentity: "runtime",
    sourceDigest: "s".repeat(64),
    buildDigest: "b".repeat(64),
    recipe: {
      id,
      name: id,
      executable: "fixture",
      args: [],
      cwd: ".",
      timeoutMs: 1000,
      sourcePaths: ["source.ts"],
      expectedOutputs: [],
      verifier:
        kind === "test"
          ? {
              kind,
              format: "zcode-json-v1",
              reportPath: "result.json",
              minimumTests: 1,
              requiredTests: [],
              buildNodeId: "build",
            }
          : { kind },
    },
    operation: {
      operationId: `operation-${id}`,
      sessionId: `session-${id}`,
      recipeId: id,
      requestDigest: "d".repeat(64),
      cwd: ".",
      status: "completed",
      processStarted: true,
      startedAt: 1,
      completedAt: 2,
      result: {
        status: "completed",
        exitCode: 0,
        stdout: { text: "", bytes: 0, truncated: false },
        stderr: { text: "", bytes: 0, truncated: false },
        durationMs: 1,
        timedOut: false,
        cancelled: false,
        processExitObserved: true,
      },
    },
    verification,
  };
  run.toolAttempts!.push(attempt);
  run.routing!.iterations[0]!.attemptIds[id] = attempt.attemptId;
  run.routing!.iterations[0]!.visitedNodeIds.splice(-1, 0, id);
  const artifactId = `artifact-${id}`;
  run.artifacts!.push({
    id: artifactId,
    runId: run.id,
    nodeId: id,
    attemptId: attempt.attemptId,
    workspaceKey: run.target.workspaceIdentity!,
    type: kind === "test" ? "json" : "command",
    provenance: kind === "test" ? "native-test" : "native-command",
    bytes: 1,
    digest: "a".repeat(64),
    capturedAt: 2,
    validation: "valid",
    sourceBaseline: attempt.sourceDigest,
    operationId: attempt.operationId,
  });
  run.artifactBindings!.push({
    nodeId: id,
    attemptId: attempt.attemptId,
    selector: kind === "test" ? "verification" : "command",
    artifactId,
  });
  return attempt;
}

export function failCheck(attempt: GraphToolAttempt) {
  attempt.status = "Failed";
  attempt.verification = {
    ...attempt.verification!,
    exitSuccessful: false,
    acceptancePassed: false,
    outcome: "fail",
    passed: 0,
    failed: 1,
    tests: [{ name: "failed.assertion", status: "failed" }],
    issues: ["The native test report contains failures."],
  };
  attempt.operation!.status = "failed";
  attempt.operation!.result!.status = "failed";
  attempt.operation!.result!.exitCode = 1;
}

export function nextSummaryIteration(run: GraphSequentialRun) {
  const old = run.routing!.iterations[0]!;
  run.routing!.currentIterationId = "iteration-1";
  run.routing!.iterations.push({
    id: "iteration-1",
    index: 1,
    createdAt: 4,
    attemptIds: Object.fromEntries(Object.keys(old.attemptIds).map((id) => [id, `${id}-1`])),
    visitedNodeIds: [],
  });
  run.routing!.cursorNodeId = "task";
  run.status = "AwaitingContinuation";
}
