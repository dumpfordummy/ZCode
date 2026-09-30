import type { GraphApprovalNode, GraphRun, GraphSequentialRun } from "@zcode/services";
import { graphApprovalActionState } from "./graphApprovalView.js";
import { graphRunEvidence } from "./graphRunEvidence.js";
import { graphRunIsUnresolved } from "./graphEditing.js";
import { graphRoutingCanContinue, graphSelectedAttempt } from "./graphRoutingView.js";
import { graphSummaryActiveStatuses, graphSummaryAttempt } from "./graphRunSelection.js";
import type {
  GraphRunGate,
  GraphRunSession,
  GraphRunSourceChange,
  GraphRunStep,
  GraphRunSummary,
} from "./graphRunSummaryTypes.js";
export type {
  GraphRunSummary,
  GraphRunGate,
  GraphRunSession,
  GraphRunSourceChange,
  GraphRunStep,
} from "./graphRunSummaryTypes.js";

const notRequestedOutcomes = new Set([
  "Failed",
  "NeedsHuman",
  "Cancelled",
  "BudgetExhausted",
  "NoProgress",
]);

function gateProjection(run: GraphSequentialRun, node: GraphApprovalNode): GraphRunGate {
  const gate = graphSummaryAttempt(run, node.id, run.approvalAttempts),
    request = gate?.request,
    decision = gate?.decision;
  const issues: string[] = [];
  const identity = (target: GraphRun["target"]) =>
    target.workspaceIdentity?.trim() || target.workspacePath;
  const requestMatches = Boolean(
    request &&
    request.runId === run.id &&
    request.nodeId === node.id &&
    request.attemptId === gate?.attemptId &&
    identity(request.target) === identity(run.target) &&
    request.target.workspacePath === run.target.workspacePath,
  );
  const complete = Boolean(
    requestMatches &&
    request?.complete &&
    !request.issues.length &&
    request.evidence.every(
      (item) =>
        !item.issue &&
        (!item.snapshot ||
          (item.snapshot.complete &&
            !item.snapshot.issues.length &&
            item.snapshot.files.every((file) => !file.issue))),
    ),
  );
  if (!gate) issues.push("missing-current-gate");
  else if (!request) issues.push("missing-approval-request");
  else if (!requestMatches) issues.push("mismatched-approval-request");
  else if (!complete) issues.push("incomplete-approval-request");
  if (run.status === "StaleEvidence" || gate?.status === "StaleEvidence")
    issues.push("stale-approval-request");
  const decisionMatches = Boolean(
    request &&
    decision &&
    decision.requestId === request.id &&
    decision.requestVersion === request.version &&
    decision.requestDigest === request.digest,
  );
  if (decision && !decisionMatches) issues.push("mismatched-approval-decision");
  const approved =
    !issues.length &&
    decisionMatches &&
    gate?.status === "Approved" &&
    decision?.value === "approve";
  const rejected =
    !issues.length &&
    decisionMatches &&
    gate?.status === "Rejected" &&
    decision?.value === "reject";
  // 从未派发：没有请求、没有决定，且尝试记录缺失或仍是 Pending/Skipped。
  const neverDispatched =
    !request && !decision && (!gate || ["Pending", "Skipped"].includes(gate.status));
  const outcomeUnresolved = ["Unknown", "Interrupted", "StaleEvidence"].includes(run.status);
  const active = graphRunIsUnresolved(run) && !outcomeUnresolved;
  // Completed/Rejected 而没有闸门记录属于事实不一致，保守地标为 unknown，而不是“未请求”。
  const state: GraphRunGate["state"] = approved
    ? "approved"
    : rejected
      ? "rejected"
      : neverDispatched && !outcomeUnresolved
        ? active
          ? "not-reached"
          : notRequestedOutcomes.has(run.status)
            ? "not-requested"
            : "unknown"
        : issues.length || outcomeUnresolved
          ? "unknown"
          : "pending";
  // 尚未到达或未请求不是缺陷：不显示 missing-* 问题码。
  if (state === "not-reached" || state === "not-requested") issues.length = 0;
  const actions = gate ? graphApprovalActionState(run, gate) : { decide: false, continue: false };
  return {
    nodeId: node.id,
    name: node.name,
    state,
    complete,
    issues,
    ...(gate ? { attemptId: gate.attemptId, status: gate.status } : {}),
    ...(request
      ? { requestId: request.id, requestVersion: request.version, requestDigest: request.digest }
      : {}),
    ...(decision ? { decision: structuredClone(decision) } : {}),
    canDecide: complete && !issues.length && actions.decide,
    canContinue: complete && !issues.length && actions.continue,
  };
}

/** rejected > approved(all) > pending > unknown > not-requested > not-reached. */
function aggregateHumanState(gates: GraphRunGate[]): GraphRunSummary["human"]["state"] {
  if (!gates.length) return "not-required";
  const has = (state: GraphRunGate["state"]) => gates.some((gate) => gate.state === state);
  if (has("rejected")) return "rejected";
  if (gates.every((gate) => gate.state === "approved")) return "approved";
  for (const state of ["pending", "unknown", "not-requested"] as const)
    if (has(state)) return state;
  return "not-reached";
}

function selectedGateNodes(run: GraphSequentialRun): GraphApprovalNode[] {
  const iteration = run.routing?.iterations.find(
    (item) => item.id === run.routing?.currentIterationId,
  );
  return run.definition.nodes.filter((node): node is GraphApprovalNode => {
    if (node.type !== "approval") return false;
    if (run.version !== 5) return run.plannedPath.includes(node.id);
    const gate = graphSummaryAttempt(run, node.id, run.approvalAttempts);
    return (
      node.id === run.definition.routing?.finalGateId ||
      Boolean(iteration?.visitedNodeIds.includes(node.id)) ||
      node.id === run.routing?.cursorNodeId ||
      Boolean(gate && !["Pending", "Skipped"].includes(gate.status))
    );
  });
}

function capturedSources(run: GraphSequentialRun, gates: GraphRunGate[]): GraphRunSourceChange[] {
  const result: GraphRunSourceChange[] = [];
  for (const gate of gates) {
    const attempt = run.approvalAttempts?.find((item) => item.attemptId === gate.attemptId),
      request = attempt?.request;
    if (
      !attempt ||
      !request ||
      request.runId !== run.id ||
      request.nodeId !== gate.nodeId ||
      request.attemptId !== attempt.attemptId
    )
      continue;
    for (const evidence of request.evidence)
      if (evidence.source.kind === "source" && evidence.snapshot)
        result.push({
          nodeId: gate.nodeId,
          attemptId: attempt.attemptId,
          requestId: request.id,
          alias: evidence.alias,
          capturedAt: request.createdAt,
          snapshot: structuredClone(evidence.snapshot),
        });
  }
  return result;
}

function currentStep(run: GraphSequentialRun): GraphRunStep | undefined {
  const id =
    run.version === 5
      ? run.routing?.cursorNodeId
      : run.plannedPath.find((nodeId) => {
          const attempt = graphSelectedAttempt(run, nodeId);
          return (
            attempt && !["Completed", "Approved", "Skipped", "Evaluated"].includes(attempt.status)
          );
        });
  const node = run.definition.nodes.find((item) => item.id === id);
  if (!node) return undefined;
  const attempt = graphSelectedAttempt(run, node.id);
  return {
    nodeId: node.id,
    name: "name" in node ? node.name : node.id,
    kind: node.type,
    ...(attempt ? { attemptId: attempt.attemptId, status: attempt.status } : {}),
  };
}

function actionableSessions(run: GraphSequentialRun): GraphRunSession[] {
  if (run.release) return [];
  const sessions: GraphRunSession[] = [];
  for (const node of run.definition.nodes) {
    if (node.type !== "task" && node.type !== "tool") continue;
    const attempt =
      node.type === "task"
        ? graphSummaryAttempt(run, node.id, run.nodeAttempts)
        : graphSummaryAttempt(run, node.id, run.toolAttempts);
    if (attempt?.sessionId)
      sessions.push({
        nodeId: node.id,
        name: node.name,
        attemptId: attempt.attemptId,
        sessionId: attempt.sessionId,
        kind: node.type,
        status: attempt.status,
      });
  }
  const active = sessions.filter((attempt) => graphSummaryActiveStatuses.has(attempt.status));
  // 晚到终态可完成尝试却不恢复 Unknown/Interrupted 路由；仍允许查看已拥有会话，不暗示重放。
  return active.length || !["Unknown", "Interrupted"].includes(run.status) ? active : sessions;
}

/** Independent captured facts; no files, native session reads, revalidation or action admission. */
export function graphRunSummary(run: GraphRun): GraphRunSummary {
  const result: GraphRunSummary = {
    runId: run.id,
    target: structuredClone(run.target),
    requestText: run.version === undefined ? run.definition.instructions : run.startInput,
    result:
      run.version !== undefined && run.result
        ? { kind: "text", text: run.result.text }
        : run.version !== undefined && run.resultArtifactId
          ? { kind: "artifact", artifactId: run.resultArtifactId }
          : { kind: "absent" },
    execution: {
      status: run.status,
      // 原生 Cancel 回执可能变成 Unknown；在终态或 inactivity 证明前仍须保留已保存的停止请求。
      stopRequested:
        graphRunIsUnresolved(run) &&
        run.recovery?.state !== "inactive" &&
        (run.status === "CancelRequested" ||
          (run.version !== undefined && run.cancelRequestedAt !== undefined)),
    },
    evidence: graphRunEvidence(run),
    human: { state: "not-required", gates: [], issues: [] },
    sourceChanges: [],
    actionableSessions: [],
  };
  if (run.version === undefined) {
    const task = run.definition.nodes.find((node) => node.type === "task");
    if (task)
      result.execution.currentStep = {
        nodeId: task.id,
        name: run.definition.taskName,
        kind: "task",
        attemptId: run.attemptId,
        status: run.status,
      };
    if (task && run.sessionId && !run.release && graphSummaryActiveStatuses.has(run.status))
      result.actionableSessions.push({
        nodeId: task.id,
        name: run.definition.taskName,
        attemptId: run.attemptId,
        sessionId: run.sessionId,
        kind: "task",
        status: run.status,
      });
    return result;
  }
  result.execution.currentStep = currentStep(run);
  const gates = selectedGateNodes(run).map((node) => gateProjection(run, node));
  result.human = {
    state: aggregateHumanState(gates),
    gates,
    issues: [...new Set(gates.flatMap((gate) => gate.issues))],
  };
  result.sourceChanges = capturedSources(run, gates);
  result.actionableSessions = actionableSessions(run);
  if (graphRoutingCanContinue(run)) {
    const checkpoint = run.routing?.checkpoints.find(
      (item) =>
        item.resumeRequired &&
        !item.consumedAt &&
        item.iterationId === run.routing?.currentIterationId,
    );
    if (checkpoint)
      result.checkpoint = {
        id: checkpoint.id,
        digest: checkpoint.digest,
        successorNodeId: checkpoint.successorNodeId,
      };
  }
  return result;
}
