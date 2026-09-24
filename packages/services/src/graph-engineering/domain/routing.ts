import type {
  GraphConditionNode,
  GraphJsonValue,
  GraphPredicate,
  GraphSequentialRun,
} from "../contract.js";
import { predicateErrors, predicateNodeCount, pointerSegments } from "./routing-predicates.js";

export function currentIteration(run: GraphSequentialRun) {
  return run.version === 5
    ? run.routing?.iterations.find((i) => i.id === run.routing?.currentIterationId)
    : undefined;
}
export function currentTaskAttempt(run: GraphSequentialRun, nodeId: string) {
  const id = currentIteration(run)?.attemptIds[nodeId];
  return run.nodeAttempts.find(
    (a) => a.nodeId === nodeId && (run.version !== 5 || a.attemptId === id),
  );
}
export function currentToolAttempt(run: GraphSequentialRun, nodeId: string) {
  const id = currentIteration(run)?.attemptIds[nodeId];
  return run.toolAttempts?.find(
    (a) => a.nodeId === nodeId && (run.version !== 5 || a.attemptId === id),
  );
}
export function currentApprovalAttempt(run: GraphSequentialRun, nodeId: string) {
  const id = currentIteration(run)?.attemptIds[nodeId];
  return run.approvalAttempts?.find(
    (a) => a.nodeId === nodeId && (run.version !== 5 || a.attemptId === id),
  );
}
export function nextRouteNode(run: GraphSequentialRun): string | undefined {
  if (run.version === 5) {
    const cursor = run.routing?.cursorNodeId;
    return run.definition.nodes.find((n) => n.id === cursor)?.type === "end" ? undefined : cursor;
  }
  return run.plannedPath.find((id) => {
    const task = currentTaskAttempt(run, id),
      tool = currentToolAttempt(run, id);
    return tool
      ? tool.status !== "Completed"
      : task
        ? task.status !== "Completed"
        : currentApprovalAttempt(run, id)?.status !== "Approved";
  });
}
/** Unknown creation/admission and absent operation outcomes never prove safe continuation. */
export function routingInactive(run: GraphSequentialRun): boolean {
  return (
    run.nodeAttempts.every(
      (a) =>
        a.dispatchPhase === "planned" ||
        (a.dispatchPhase === "created" &&
          Boolean(a.sessionId && a.runtimeIdentity) &&
          !a.terminalProof) ||
        Boolean(
          a.sessionId &&
          a.runtimeIdentity &&
          a.terminalProof &&
          a.terminalProof.sourceCommandId === a.commandId &&
          a.terminalProof.turnId,
        ),
    ) &&
    (run.toolAttempts ?? []).every(
      (a) =>
        a.dispatchPhase === "planned" ||
        (a.dispatchPhase === "created" &&
          Boolean(a.sessionId && a.runtimeIdentity) &&
          !a.operation) ||
        Boolean(
          a.sessionId &&
          a.runtimeIdentity &&
          a.operation &&
          a.operation.operationId === a.operationId &&
          a.operation.sessionId === a.sessionId &&
          a.operation.completedAt !== undefined &&
          ["completed", "failed", "cancelled"].includes(a.operation.status) &&
          (!a.operation.processStarted || a.operation.result?.processExitObserved === true),
        ),
    )
  );
}
export function routeCheckpoint(run: GraphSequentialRun) {
  if (
    run.version !== 5 ||
    !run.routing ||
    run.cancelRequestedAt !== undefined ||
    run.release ||
    run.routing.stopReason ||
    !routingInactive(run)
  )
    return undefined;
  const checkpoint = run.routing.checkpoints.filter((c) => c.consumedAt === undefined).at(-1);
  if (
    !checkpoint ||
    checkpoint.iterationId !== run.routing.currentIterationId ||
    checkpoint.successorNodeId !== run.routing.cursorNodeId
  )
    return undefined;
  const attemptId = currentIteration(run)?.attemptIds[checkpoint.successorNodeId];
  const attempt = [...run.nodeAttempts, ...(run.toolAttempts ?? [])].find(
    (a) => a.attemptId === attemptId,
  );
  if (attempt) return attempt.dispatchPhase === "planned" ? checkpoint : undefined;
  const control = [...(run.approvalAttempts ?? []), ...run.routing.conditionAttempts].find(
    (a) => a.attemptId === attemptId,
  );
  return control?.status === "Pending" ? checkpoint : undefined;
}
export function evaluateCondition(node: GraphConditionNode, data: Record<string, GraphJsonValue>) {
  const values: Array<{
    alias: string;
    pointer: string;
    present: boolean;
    value?: GraphJsonValue;
  }> = [];
  const errors = node.branches.flatMap((b) => predicateErrors(b.predicate));
  if (
    !errors.length &&
    node.branches.reduce((count, b) => count + predicateNodeCount(b.predicate), 0) > 64
  )
    errors.push("Condition branches exceed 64 total predicate nodes.");
  const aliases = new Set(node.inputs.map((b) => b.alias));
  const evaluate = (predicate: GraphPredicate): boolean => {
    if ("predicates" in predicate) {
      const results = predicate.predicates.map(evaluate);
      return predicate.op === "all" ? results.every(Boolean) : results.some(Boolean);
    }
    if ("predicate" in predicate) return !evaluate(predicate.predicate);
    if (!aliases.has(predicate.alias) || !Object.hasOwn(data, predicate.alias))
      throw new Error(`Condition input ${predicate.alias} is missing.`);
    let value: GraphJsonValue | undefined = data[predicate.alias],
      present = true;
    for (const key of pointerSegments(predicate.pointer)) {
      if (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/.test(key))
        throw new Error("JSON array pointer requires a canonical index.");
      if (
        value === null ||
        typeof value !== "object" ||
        !Object.hasOwn(value, key) ||
        (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/.test(key))
      ) {
        present = false;
        value = undefined;
        break;
      }
      value = (value as Record<string, GraphJsonValue>)[key];
    }
    values.push({
      alias: predicate.alias,
      pointer: predicate.pointer,
      present,
      ...(present ? { value } : {}),
    });
    if (predicate.op === "present") return present;
    if (!present)
      throw new Error(`Condition operand ${predicate.alias}${predicate.pointer} is missing.`);
    if (value !== null && typeof value === "object")
      throw new Error("Condition comparison requires scalar values.");
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("Condition numbers must be finite.");
    if (typeof value !== typeof predicate.value || (value === null) !== (predicate.value === null))
      throw new Error("Condition comparison types differ.");
    if (predicate.op === "eq" || predicate.op === "neq")
      return predicate.op === "eq" ? value === predicate.value : value !== predicate.value;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      typeof predicate.value !== "number" ||
      !Number.isFinite(predicate.value)
    )
      throw new Error("Condition ordering requires finite numbers.");
    if (predicate.op === "gt") return value > predicate.value;
    if (predicate.op === "gte") return value >= predicate.value;
    if (predicate.op === "lt") return value < predicate.value;
    return value <= predicate.value;
  };
  if (errors.length) return { values, errors, selectedExit: undefined };
  let selectedExit: string | undefined;
  for (const branch of node.branches) {
    try {
      if (evaluate(branch.predicate)) selectedExit ??= branch.exit;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Condition value is invalid.");
    }
  }
  return {
    values,
    errors,
    selectedExit: errors.length ? undefined : (selectedExit ?? node.defaultExit),
  };
}
