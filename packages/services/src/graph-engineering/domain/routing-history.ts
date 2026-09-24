import type { GraphSequentialRun } from "../contract.js";

/** A persisted route is an ordered execution lineage, not an arbitrary set of visited nodes. */
export function routingHistoryErrors(run: GraphSequentialRun): string[] {
  if (!run.routing) return ["Missing routing history."];
  const errors: string[] = [],
    region = run.definition.routing?.region;
  for (const iteration of run.routing.iterations) {
    let cursor =
      iteration.index === 0
        ? run.definition.edges.find(
            (e) => e.source === run.definition.nodes.find((n) => n.type === "start")?.id,
          )?.target
        : region?.repairEntryNodeId;
    for (const [index, id] of iteration.visitedNodeIds.entries()) {
      if (id !== cursor)
        errors.push("Visited nodes do not follow the exact selected iteration route.");
      const node = run.definition.nodes.find((n) => n.id === id),
        attemptId = iteration.attemptIds[id];
      const later = index < iteration.visitedNodeIds.length - 1;
      if (node?.type === "condition") {
        const attempt = run.routing.conditionAttempts.find((a) => a.attemptId === attemptId);
        if (attempt?.status !== "Evaluated")
          errors.push("Only an evaluated Condition can appear in an advanced route.");
        cursor = run.definition.edges.find(
          (e) => e.source === id && e.sourcePort === attempt?.selectedExit,
        )?.target;
      } else {
        const task = run.nodeAttempts.find((a) => a.attemptId === attemptId);
        const tool = run.toolAttempts?.find((a) => a.attemptId === attemptId);
        const gate = run.approvalAttempts?.find((a) => a.attemptId === attemptId);
        if (
          later &&
          ((task &&
            (task.status !== "Completed" || task.terminalProof?.state !== "completedSuccess")) ||
            (tool &&
              tool.status !== "Completed" &&
              !(
                tool.status === "Failed" &&
                tool.verification?.observationValid &&
                tool.verification.outcome === "fail" &&
                region?.bodyNodeIds.includes(id)
              )) ||
            (gate && gate.status !== "Approved"))
        )
          errors.push("A route advanced past an unproven predecessor.");
        cursor = run.definition.edges.find((e) => e.source === id)?.target;
      }
    }
    const last = iteration.visitedNodeIds.at(-1);
    if (iteration.id === run.routing.currentIterationId) {
      if (run.routing.cursorNodeId !== cursor && run.routing.cursorNodeId !== last)
        errors.push("The current cursor is outside its persisted selected route.");
    } else {
      const decision = run.routing.conditionAttempts.find(
        (a) => a.attemptId === iteration.attemptIds[region?.decisionNodeId ?? ""],
      );
      if (
        !region ||
        last !== region.decisionNodeId ||
        decision?.status !== "Evaluated" ||
        decision.selectedExit !== region.repairExit ||
        cursor !== region.repairEntryNodeId
      )
        errors.push("A later iteration requires the prior definitive repair decision.");
    }
    for (const attempt of [...(run.approvalAttempts ?? []), ...run.routing.conditionAttempts]) {
      if (attempt.iterationId !== iteration.id || ["Pending", "Skipped"].includes(attempt.status))
        continue;
      if (
        !iteration.visitedNodeIds.includes(attempt.nodeId) &&
        !(
          iteration.id === run.routing.currentIterationId &&
          run.routing.cursorNodeId === attempt.nodeId
        )
      )
        errors.push("An actionable control attempt is outside the admitted route.");
    }
  }
  return [...new Set(errors)];
}
