import type {
  GraphSequentialDefinition,
  GraphSequentialRun,
  GraphNativeSettings,
  GraphNodeAttempt,
  GraphToolAttempt,
  GraphApprovalAttempt,
  GraphConditionAttempt,
  GraphRunContinueCommand,
  GraphConditionNode,
  GraphPredicate,
  GraphInputBinding,
} from "@zcode/services";
export function upgradeGraphRouting(
  definition: GraphSequentialDefinition,
): GraphSequentialDefinition {
  return {
    ...structuredClone(definition),
    version: 5,
    routing: definition.routing ?? {
      finalGateId: definition.nodes.find((node) => node.type === "approval")?.id ?? "",
      limits: { maxNodeAdmissions: 32, deadlineMs: 1800000 },
    },
  };
}
export type GraphInspectableAttempt = (
  | GraphNodeAttempt
  | GraphToolAttempt
  | GraphApprovalAttempt
  | GraphConditionAttempt
) & { sessionId?: string; iteration?: number; iterationId?: string };
export function graphNodeAttempts(
  run: GraphSequentialRun,
  nodeId?: string,
): GraphInspectableAttempt[] {
  return [
    ...run.nodeAttempts,
    ...(run.toolAttempts ?? []),
    ...(run.approvalAttempts ?? []),
    ...(run.routing?.conditionAttempts ?? []),
  ].filter((item) => item.nodeId === nodeId);
}
export function graphSelectedAttempt(
  run: GraphSequentialRun,
  nodeId?: string,
  attemptId?: string,
): GraphInspectableAttempt | undefined {
  const attempts = graphNodeAttempts(run, nodeId);
  if (attemptId) return attempts.find((item) => item.attemptId === attemptId);
  const current = run.routing?.iterations.find(
    (item) => item.id === run.routing?.currentIterationId,
  );
  const owned = nodeId ? current?.attemptIds[nodeId] : undefined;
  return owned
    ? attempts.find((item) => item.attemptId === owned)
    : run.version === 5
      ? undefined
      : attempts.at(-1);
}
export function captureGraphRunConfirmation(
  definition: GraphSequentialDefinition,
  settings: GraphNativeSettings,
) {
  return structuredClone({ definition, settings });
}
export function captureGraphContinuation(
  retained: GraphRunContinueCommand | undefined,
  proposed: GraphRunContinueCommand,
): GraphRunContinueCommand {
  if (!retained) return structuredClone(proposed);
  const identity = (value: GraphRunContinueCommand) =>
    JSON.stringify([
      value.target.workspaceIdentity?.trim() || value.target.workspacePath,
      value.runId,
      value.checkpointId,
      value.checkpointDigest,
    ]);
  // 丢失继续回执必须重用同一检查点意图；不能因重复点击创建新的修复尝试。
  if (identity(retained) !== identity(proposed))
    throw new Error("An unconfirmed continuation retains its exact checkpoint identity.");
  return retained;
}
export function graphRoutingCanContinue(run: GraphSequentialRun): boolean {
  return (
    run.status === "AwaitingContinuation" &&
    !run.release &&
    !run.cancelRequestedAt &&
    !run.routing?.stopReason &&
    Boolean(run.routing?.checkpoints.some((item) => item.resumeRequired && !item.consumedAt))
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function predicate(value: unknown, depth = 0): value is GraphPredicate {
  if (!object(value) || depth > 8) return false;
  if (value.op === "all" || value.op === "any")
    return (
      Array.isArray(value.predicates) &&
      value.predicates.length <= 64 &&
      value.predicates.every((item) => predicate(item, depth + 1))
    );
  if (value.op === "not") return predicate(value.predicate, depth + 1);
  if (typeof value.alias !== "string" || typeof value.pointer !== "string") return false;
  if (value.op === "present") return true;
  return (
    ["eq", "neq", "gt", "gte", "lt", "lte"].includes(String(value.op)) &&
    (value.value === null ||
      typeof value.value === "string" ||
      typeof value.value === "boolean" ||
      (typeof value.value === "number" && Number.isFinite(value.value)))
  );
}
function binding(value: unknown): value is GraphInputBinding {
  if (!object(value) || typeof value.alias !== "string" || !object(value.source)) return false;
  const source = value.source;
  return (
    source.kind === "start" ||
    source.kind === "repair-feedback" ||
    (source.kind === "node" && typeof source.nodeId === "string") ||
    (source.kind === "artifact" &&
      typeof source.nodeId === "string" &&
      typeof source.selector === "string" &&
      (source.pointer === undefined || typeof source.pointer === "string"))
  );
}
function branch(value: unknown): value is GraphConditionNode["branches"][number] {
  return object(value) && typeof value.exit === "string" && predicate(value.predicate);
}
function verification(value: unknown): value is NonNullable<GraphConditionNode["verification"]> {
  return (
    object(value) &&
    Array.isArray(value.testNodeIds) &&
    value.testNodeIds.every((item) => typeof item === "string") &&
    typeof value.successExit === "string" &&
    (value.reviewerNodeId === undefined || typeof value.reviewerNodeId === "string")
  );
}
/** Draft shape safety only; the Host remains the strict readiness and execution authority. */
export function parseGraphConditionDraft(
  inputs: string,
  branches: string,
  proof: string,
): Pick<GraphConditionNode, "inputs" | "branches" | "verification"> {
  if ([inputs, branches, proof].some((value) => value.length > 32768))
    throw new Error("Condition JSON exceeds the draft size limit.");
  const nextInputs: unknown = JSON.parse(inputs),
    nextBranches: unknown = JSON.parse(branches),
    nextVerification: unknown = JSON.parse(proof);
  if (
    !Array.isArray(nextInputs) ||
    nextInputs.length > 8 ||
    !nextInputs.every(binding) ||
    !Array.isArray(nextBranches) ||
    nextBranches.length > 4 ||
    !nextBranches.every(branch) ||
    (nextVerification !== null && !verification(nextVerification))
  )
    throw new Error("Condition JSON has an invalid declarative structure.");
  return {
    inputs: nextInputs,
    branches: nextBranches,
    verification: nextVerification === null ? undefined : nextVerification,
  };
}
