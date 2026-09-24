import type { GraphIteration, GraphSequentialRun } from "../contract.js";
import type { GraphOptions } from "./state.js";
import { skipPending } from "./attempts.js";

export function frozenRoutingConfiguration(run: GraphSequentialRun) {
  return {
    definition: run.definition,
    defaults: run.defaults,
    settings: run.nodeAttempts
      .filter((a) => (a.iteration ?? 0) === 0)
      .map((a) => ({ nodeId: a.nodeId, settings: a.settings })),
    tools: run.toolAttempts
      ?.filter((a) => (a.iteration ?? 0) === 0)
      .map((a) => ({ nodeId: a.nodeId, recipe: a.recipe, recipeDigest: a.recipeDigest })),
  };
}

/** Append-only identities. The iteration map, never array order, selects live evidence. */
export function appendIteration(
  run: GraphSequentialRun,
  options: Pick<GraphOptions, "id" | "now">,
): GraphIteration {
  const routing = run.routing!;
  const index = routing.iterations.length;
  const now = options.now();
  const iteration: GraphIteration = {
    id: options.id(),
    index,
    createdAt: now,
    attemptIds: {},
    visitedNodeIds: [],
  };
  if (index) {
    skipPending(run, now);
    for (const template of run.nodeAttempts.filter((a) => a.iteration === 0)) {
      const commandId = options.id();
      run.nodeAttempts.push({
        nodeId: template.nodeId,
        attemptId: options.id(),
        commandId,
        inputId: commandId,
        iterationId: iteration.id,
        iteration: index,
        status: "Pending",
        dispatchPhase: "planned",
        settings: structuredClone(template.settings),
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const template of run.toolAttempts?.filter((a) => a.iteration === 0) ?? [])
      run.toolAttempts!.push({
        nodeId: template.nodeId,
        attemptId: options.id(),
        operationId: options.id(),
        iterationId: iteration.id,
        iteration: index,
        recipe: structuredClone(template.recipe),
        recipeDigest: template.recipeDigest,
        status: "Pending",
        dispatchPhase: "planned",
        createdAt: now,
        updatedAt: now,
      });
    for (const template of run.approvalAttempts?.filter((a) => a.iteration === 0) ?? [])
      run.approvalAttempts!.push({
        nodeId: template.nodeId,
        attemptId: options.id(),
        iterationId: iteration.id,
        iteration: index,
        status: "Pending",
        createdAt: now,
        updatedAt: now,
      });
  }
  for (const attempt of [
    ...run.nodeAttempts,
    ...(run.toolAttempts ?? []),
    ...(run.approvalAttempts ?? []),
  ]) {
    if (index && attempt.iteration !== index) continue;
    attempt.iterationId = iteration.id;
    attempt.iteration = index;
    iteration.attemptIds[attempt.nodeId] = attempt.attemptId;
  }
  for (const node of run.definition.nodes.filter((n) => n.type === "condition")) {
    const attemptId = options.id();
    routing.conditionAttempts.push({
      nodeId: node.id,
      attemptId,
      iterationId: iteration.id,
      iteration: index,
      status: "Pending",
      createdAt: now,
      updatedAt: now,
    });
    iteration.attemptIds[node.id] = attemptId;
  }
  routing.iterations.push(iteration);
  routing.currentIterationId = iteration.id;
  return iteration;
}
