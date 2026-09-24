import type { GraphApprovalAttempt, GraphSequentialRun } from "../contract.js";
import {
  currentApprovalAttempt,
  currentIteration,
  currentTaskAttempt,
  currentToolAttempt,
  nextRouteNode,
  routingInactive,
} from "./routing.js";

export function nextStep(run: GraphSequentialRun): string | undefined {
  if (run.version === 5) return nextRouteNode(run);
  return run.plannedPath.find((id) => {
    const task = run.nodeAttempts.find((a) => a.nodeId === id);
    const tool = run.toolAttempts?.find((a) => a.nodeId === id);
    if (tool) return tool.status !== "Completed";
    return task
      ? task.status !== "Completed"
      : run.approvalAttempts?.find((a) => a.nodeId === id)?.status !== "Approved";
  });
}

/** This is only eligibility; evidence/ownership must still be checked by the Host. */
export function resumableGate(run: GraphSequentialRun): GraphApprovalAttempt | undefined {
  if (
    run.version < 3 ||
    run.cancelRequestedAt !== undefined ||
    run.release ||
    run.status === "StaleEvidence" ||
    run.approvalAttempts?.some((g) => g.status === "StaleEvidence")
  )
    return undefined;
  if (run.version === 5) {
    if (run.routing?.stopReason || !routingInactive(run)) return undefined;
    const next = nextRouteNode(run);
    const gate = next ? currentApprovalAttempt(run, next) : undefined;
    if (gate?.status === "WaitingForApproval" && gate.request) return gate;
    if (gate?.status === "Approved" && gate.request && gate.decision && gate.successorIntent)
      return gate;
    return [...(run.approvalAttempts ?? [])]
      .reverse()
      .find(
        (a) =>
          a.iterationId === run.routing?.currentIterationId &&
          a.status === "Approved" &&
          a.decision &&
          a.successorIntent?.successorNodeId === run.routing?.cursorNodeId,
      );
  }
  if (
    run.toolAttempts?.some(
      (a) =>
        a.dispatchPhase !== "planned" &&
        (a.status !== "Completed" ||
          !a.verification?.acceptancePassed ||
          !a.operation?.completedAt),
    )
  )
    return undefined;
  if (
    run.nodeAttempts.some(
      (a) =>
        a.dispatchPhase !== "planned" &&
        (a.status !== "Completed" ||
          a.terminalProof?.state !== "completedSuccess" ||
          a.terminalProof.sourceCommandId !== a.commandId ||
          !a.sessionId ||
          !a.runtimeIdentity),
    )
  )
    return undefined;
  const next = nextStep(run);
  const pending = run.approvalAttempts?.find(
    (a) => a.nodeId === next && a.status === "WaitingForApproval" && a.request,
  );
  if (pending) return pending;
  return run.approvalAttempts?.find(
    (a) =>
      a.status === "Approved" &&
      a.decision &&
      a.successorIntent &&
      a.successorIntent.successorNodeId === (next ?? null),
  );
}

export function predecessorErrors(run: GraphSequentialRun, nodeId: string): string[] {
  if (run.version === 5) {
    const iteration = currentIteration(run);
    if (!iteration || !routingInactive(run))
      return ["A routed predecessor has active or unknown native work."];
    // 已批准关卡只核验它之前的路由；后继的创建预留不能反过来使原批准失效。
    const gateIndex = iteration.visitedNodeIds.indexOf(nodeId);
    const predecessors =
      gateIndex < 0 ? iteration.visitedNodeIds : iteration.visitedNodeIds.slice(0, gateIndex);
    for (const id of predecessors) {
      const task = currentTaskAttempt(run, id),
        tool = currentToolAttempt(run, id),
        gate = currentApprovalAttempt(run, id);
      if (
        task &&
        (task.status !== "Completed" ||
          task.terminalProof?.state !== "completedSuccess" ||
          task.terminalProof.sourceCommandId !== task.commandId)
      )
        return ["A routed predecessor lacks exact successful native input proof."];
      if (
        tool &&
        tool.status !== "Completed" &&
        !(
          tool.status === "Failed" &&
          tool.verification?.observationValid &&
          tool.verification.outcome === "fail" &&
          nodeId !== run.definition.routing?.finalGateId
        )
      )
        return ["A routed predecessor lacks acceptable native Tool evidence."];
      if (gate && gate.status !== "Approved")
        return ["A routed predecessor approval is incomplete."];
    }
    return [];
  }
  const index = run.plannedPath.indexOf(nodeId);
  if (index < 0) return ["The approval is outside the frozen execution path."];
  for (const id of run.plannedPath.slice(0, index)) {
    const tool = run.toolAttempts?.find((a) => a.nodeId === id);
    if (tool) {
      if (
        tool.status !== "Completed" ||
        !tool.verification?.acceptancePassed ||
        !tool.operation?.completedAt
      )
        return ["A predecessor Tool lacks verified native result evidence."];
      continue;
    }
    const task = run.nodeAttempts.find((a) => a.nodeId === id);
    if (task) {
      if (
        task.status !== "Completed" ||
        task.terminalProof?.state !== "completedSuccess" ||
        task.terminalProof.sourceCommandId !== task.commandId ||
        !task.sessionId ||
        !task.runtimeIdentity
      )
        return ["A predecessor lacks its original successful native terminal proof."];
    } else if (run.approvalAttempts?.find((a) => a.nodeId === id)?.status !== "Approved")
      return ["A predecessor approval has not been approved."];
  }
  return [];
}
