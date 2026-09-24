import type {
  GraphApprovalAttempt,
  GraphApprovalCommand,
  GraphSequentialRun,
  IGraphEngineeringService,
} from "@zcode/services";

export type GraphDecisionIntent = Parameters<IGraphEngineeringService["decideApproval"]>[0];

export function graphApprovalCommand(
  run: GraphSequentialRun,
  gate: GraphApprovalAttempt,
): GraphApprovalCommand | null {
  const request = gate.request;
  return request
    ? {
        target: request.target,
        runId: run.id,
        nodeId: gate.nodeId,
        requestId: request.id,
        requestVersion: request.version,
        requestDigest: request.digest,
      }
    : null;
}

export function graphApprovalKey(command: GraphApprovalCommand): string {
  return JSON.stringify([
    command.target.workspaceIdentity?.trim() || command.target.workspacePath,
    command.runId,
    command.nodeId,
    command.requestId,
    command.requestVersion,
    command.requestDigest,
  ]);
}

export function captureGraphDecision(
  retained: GraphDecisionIntent | undefined,
  proposed: GraphDecisionIntent,
): GraphDecisionIntent {
  if (!retained) return structuredClone(proposed);
  // 决定 ACK 丢失后必须沿用原始内容和标识；切换节点或重复按键不能产生第二个授权意图。
  if (
    graphApprovalKey(retained) !== graphApprovalKey(proposed) ||
    retained.value !== proposed.value ||
    retained.comment !== proposed.comment
  )
    throw new Error(
      "An unconfirmed decision retains its original choice and comment. Retry that same decision or inspect its saved result.",
    );
  return retained;
}

export function graphApprovalActionState(run: GraphSequentialRun, gate: GraphApprovalAttempt) {
  const blocked =
    Boolean(run.release) ||
    [
      "NeedsHuman",
      "BudgetExhausted",
      "NoProgress",
      "Completed",
      "Rejected",
      "Failed",
      "Cancelled",
      "CancelRequested",
      "Unknown",
      "Interrupted",
      "StaleEvidence",
    ].includes(run.status);
  const ready = !blocked && Boolean(gate.request?.complete);
  return {
    decide:
      ready &&
      run.status === "WaitingForApproval" &&
      gate.status === "WaitingForApproval" &&
      !gate.resumeRequired &&
      !gate.decision,
    continue:
      ready &&
      run.status === "AwaitingContinuation" &&
      Boolean(gate.resumeRequired) &&
      ["WaitingForApproval", "Approved"].includes(gate.status),
  };
}
