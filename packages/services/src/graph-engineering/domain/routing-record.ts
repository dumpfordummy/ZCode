import type { GraphSequentialRun } from "../contract.js";
import {
  currentApprovalAttempt,
  currentIteration,
  currentTaskAttempt,
  currentToolAttempt,
  evaluateCondition,
  routingInactive,
} from "./routing.js";
import { routingReadiness } from "./routing-readiness.js";
import { resolveGraphInstructions } from "./bindings.js";
import { routeVerificationErrors } from "./routing-verification.js";
import { routingHistoryErrors } from "./routing-history.js";

/** Cold records cannot invent a fresh attempt, route, budget or machine acceptance. */
export function routingRecordErrors(run: GraphSequentialRun): string[] {
  const errors: string[] = [],
    state = run.routing,
    definition = run.definition.routing;
  if (run.version !== 5 || !state || !definition)
    return ["Version-5 run requires its frozen routing state."];
  errors.push(...routingHistoryErrors(run));
  const ready = routingReadiness(run.definition),
    iteration = currentIteration(run);
  if (
    ready.errors.length ||
    JSON.stringify(ready.path) !== JSON.stringify(run.plannedPath) ||
    !iteration ||
    state.iterations.at(-1)?.id !== state.currentIterationId ||
    !run.definition.nodes.some((n) => n.id === state.cursorNodeId) ||
    run.updatedAt < run.createdAt ||
    run.startInput !== run.definition.nodes.find((n) => n.type === "start")?.request
  )
    errors.push("Frozen routed plan, cursor or current iteration is inconsistent.");
  const nodes = run.definition.nodes.filter((n) => n.type !== "start" && n.type !== "end");
  const native = [...run.nodeAttempts, ...(run.toolAttempts ?? [])];
  const attempts = [...native, ...(run.approvalAttempts ?? []), ...state.conditionAttempts];
  const attemptById = new Map(attempts.map((a) => [a.attemptId, a]));
  if (attemptById.size !== attempts.length)
    errors.push("Routing attempt identities must be unique.");
  const mapped = new Set<string>(),
    iterationIds = new Set<string>();
  for (const [index, item] of state.iterations.entries()) {
    if (
      item.index !== index ||
      iterationIds.has(item.id) ||
      (index && item.createdAt < state.iterations[index - 1]!.createdAt) ||
      item.createdAt < run.createdAt ||
      Object.keys(item.attemptIds).length !== nodes.length ||
      Object.keys(item.attemptIds).some((id) => !nodes.some((n) => n.id === id)) ||
      new Set(item.visitedNodeIds).size !== item.visitedNodeIds.length ||
      item.visitedNodeIds.some((id) => !run.definition.nodes.some((n) => n.id === id))
    )
      errors.push("Iteration identity, chronology or node map is invalid.");
    iterationIds.add(item.id);
    for (const node of nodes) {
      const id = item.attemptIds[node.id],
        attempt = id ? attemptById.get(id) : undefined;
      const collection =
        node.type === "task"
          ? run.nodeAttempts
          : node.type === "tool"
            ? run.toolAttempts
            : node.type === "approval"
              ? run.approvalAttempts
              : state.conditionAttempts;
      if (
        !id ||
        !attempt ||
        mapped.has(id) ||
        attempt.nodeId !== node.id ||
        attempt.iterationId !== item.id ||
        attempt.iteration !== index ||
        !collection?.some((a) => a.attemptId === id)
      )
        errors.push("Iteration must map every node to its own exact typed attempt.");
      if (id) mapped.add(id);
    }
    if (
      index === 0
        ? item.feedback !== undefined
        : !definition.region ||
          !item.feedback ||
          item.feedback.previousIterationId !== state.iterations[index - 1]!.id
    )
      errors.push("Repair iteration requires exact prior-iteration feedback.");
    if (
      item.feedback &&
      (new Set(item.feedback.artifactIds).size !== item.feedback.artifactIds.length ||
        item.feedback.artifactIds.some(
          (id) =>
            !run.artifacts?.some(
              (a) =>
                a.id === id && state.iterations[index - 1]?.attemptIds[a.nodeId] === a.attemptId,
            ),
        ))
    )
      errors.push("Repair feedback must reference artifacts from the immediately prior iteration.");
  }
  if (
    mapped.size !== attempts.length ||
    state.iterations.length > (definition.region?.maxRepairIterations ?? 0) + 1
  )
    errors.push("Unexpected or over-budget iteration attempts.");
  const admitted = native.filter((a) => a.dispatchPhase !== "planned");
  if (
    state.admissions !== admitted.length ||
    state.admissions > definition.limits.maxNodeAdmissions ||
    state.deadlineAt !== run.createdAt + definition.limits.deadlineMs
  )
    errors.push("Persisted admissions/deadline do not match frozen bounds.");
  for (const attempt of native) {
    const item = state.iterations.find((i) => i.id === attempt.iterationId);
    if (attempt.dispatchPhase !== "planned" && !item?.visitedNodeIds.includes(attempt.nodeId))
      errors.push("A native admission must appear in its exact iteration route.");
    const original = native.find((a) => a.nodeId === attempt.nodeId && a.iteration === 0);
    if (
      original &&
      (("settings" in original &&
        "settings" in attempt &&
        JSON.stringify(original.settings) !== JSON.stringify(attempt.settings)) ||
        ("recipe" in original &&
          "recipe" in attempt &&
          (original.recipeDigest !== attempt.recipeDigest ||
            JSON.stringify(original.recipe) !== JSON.stringify(attempt.recipe))))
    )
      errors.push("Repair attempts must preserve frozen settings and recipes.");
  }
  for (const attempt of run.nodeAttempts) {
    if (attempt.resolvedInstructions === undefined && attempt.bindings === undefined) continue;
    const item = state.iterations.find((i) => i.id === attempt.iterationId);
    const node = run.definition.nodes.find((n) => n.id === attempt.nodeId);
    if (!item || node?.type !== "task" || !attempt.bindings) {
      errors.push("Resolved routing input has no matching attempt.");
      continue;
    }
    for (const binding of attempt.bindings) {
      if (
        binding.source.kind === "repair-feedback" &&
        (attempt.nodeId !== definition.region?.repairEntryNodeId ||
          binding.text !== item.feedback?.text)
      )
        errors.push("Repair instructions must use the exact prior feedback envelope.");
      if (binding.source.kind === "artifact") {
        const artifact = run.artifacts?.find((a) => a.id === binding.artifactId);
        if (
          !artifact ||
          item.attemptIds[artifact.nodeId] !== artifact.attemptId ||
          artifact.nodeId !== binding.source.nodeId ||
          artifact.validation !== "valid"
        )
          errors.push("Resolved routing artifact belongs to another iteration or is invalid.");
      }
    }
    try {
      const expected = resolveGraphInstructions(
        node,
        run.definition,
        run.nodeAttempts.filter((a) => item.attemptIds[a.nodeId] === a.attemptId),
        attempt.bindings.filter(
          (b) => b.source.kind === "artifact" || b.source.kind === "repair-feedback",
        ),
        run.provenance,
      );
      if (
        expected.instructions !== attempt.resolvedInstructions ||
        JSON.stringify(expected.bindings) !== JSON.stringify(attempt.bindings)
      )
        errors.push("Resolved instructions differ from exact frozen iteration bindings.");
    } catch {
      errors.push("Resolved routing instructions are inconsistent.");
    }
  }
  const decisions = new Set<string>();
  for (const condition of state.conditionAttempts) {
    const node = run.definition.nodes.find((n) => n.id === condition.nodeId),
      item = state.iterations.find((i) => i.id === condition.iterationId);
    if (node?.type !== "condition" || !item || condition.updatedAt < condition.createdAt) {
      errors.push("Invalid Condition attempt identity.");
      continue;
    }
    const bindings = condition.bindings ?? [];
    if (
      new Set(bindings.map((b) => b.alias)).size !== bindings.length ||
      bindings.some((b) => {
        const source = node.inputs.find((i) => i.alias === b.alias)?.source,
          artifact = run.artifacts?.find((a) => a.id === b.artifactId);
        return (
          source?.kind !== "artifact" ||
          !artifact ||
          artifact.digest !== b.digest ||
          artifact.nodeId !== source.nodeId ||
          artifact.attemptId !== item.attemptIds[artifact.nodeId] ||
          artifact.validation !== "valid" ||
          !run.artifactBindings?.some(
            (ref) => ref.artifactId === artifact.id && ref.selector === source.selector,
          )
        );
      })
    )
      errors.push("Condition inputs must identify exact valid iteration artifacts.");
    if (condition.status === "Evaluated") {
      const result = evaluateCondition(
        node,
        Object.fromEntries(bindings.map((b) => [b.alias, b.value])),
      );
      const edge = run.definition.edges.find(
        (e) => e.source === node.id && e.sourcePort === result.selectedExit,
      );
      if (
        bindings.length !== node.inputs.length ||
        result.errors.length ||
        condition.selectedExit !== result.selectedExit ||
        JSON.stringify(condition.values) !== JSON.stringify(result.values) ||
        !condition.decisionId ||
        decisions.has(condition.decisionId) ||
        condition.successorNodeId !== edge?.target
      )
        errors.push("Condition decision, values or permitted successor is inconsistent.");
    } else if (condition.selectedExit || condition.decisionId || condition.successorNodeId)
      errors.push("Only evaluated Conditions may authorize a successor.");
    if (condition.decisionId) decisions.add(condition.decisionId);
    errors.push(...routeVerificationErrors(run, node, condition));
  }
  const checkpoints = new Set<string>();
  for (const checkpoint of state.checkpoints) {
    const decision = state.conditionAttempts.find((a) => a.decisionId === checkpoint.decisionId),
      item = state.iterations.find((i) => i.id === checkpoint.iterationId);
    const repair =
      definition.region &&
      decision?.nodeId === definition.region.decisionNodeId &&
      decision.selectedExit === definition.region.repairExit;
    if (
      checkpoints.has(checkpoint.id) ||
      !decision ||
      !item ||
      decision.status !== "Evaluated" ||
      decision.successorNodeId !== checkpoint.successorNodeId ||
      (repair ? item.index !== decision.iteration + 1 : item.id !== decision.iterationId) ||
      checkpoint.createdAt < decision.createdAt ||
      (checkpoint.consumedAt !== undefined && checkpoint.consumedAt < checkpoint.createdAt)
    )
      errors.push("Route checkpoint does not match its exact persisted decision.");
    checkpoints.add(checkpoint.id);
  }
  if (
    new Set(state.continuations.map((c) => c.requestId)).size !== state.continuations.length ||
    state.continuations.some(
      (c) =>
        !state.checkpoints.some((p) => p.id === c.checkpointId && p.digest === c.checkpointDigest),
    )
  )
    errors.push("Continuation identity or checkpoint digest mismatch.");
  if (
    ["NeedsHuman", "NoProgress", "BudgetExhausted"].includes(run.status) &&
    (state.stopReason?.kind !== run.status || !routingInactive(run))
  )
    errors.push("Stopped routing status requires its reason and definitive inactivity.");
  if (
    ["Completed", "Failed", "Rejected", "Cancelled"].includes(run.status) &&
    !routingInactive(run)
  )
    errors.push("Terminal routed status cannot conceal active or unknown native work.");
  if (run.status === "Completed") {
    const end = run.definition.nodes.find((n) => n.type === "end"),
      gate = currentApprovalAttempt(run, definition.finalGateId);
    const task = end?.outputNodeId ? currentTaskAttempt(run, end.outputNodeId) : undefined,
      tool = end?.outputNodeId ? currentToolAttempt(run, end.outputNodeId) : undefined;
    if (
      state.stopReason ||
      !routingInactive(run) ||
      state.cursorNodeId !== end?.id ||
      gate?.status !== "Approved" ||
      (tool
        ? tool.status !== "Completed" ||
          !run.artifacts?.some(
            (a) =>
              a.id === run.resultArtifactId &&
              a.attemptId === tool.attemptId &&
              a.validation === "valid",
          ) ||
          run.result !== undefined
        : task?.status !== "Completed" ||
          !task.finalOutput ||
          JSON.stringify(task.finalOutput) !== JSON.stringify(run.result))
    )
      errors.push("Completed route requires final approval and its exact current selected result.");
  }
  return [...new Set(errors)];
}
