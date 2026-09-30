import type { GraphSequentialRun } from "@zcode/services";
import { graphNodeAttempts } from "./graphRoutingView.js";

export interface GraphTrailVisit {
  nodeId: string;
  /** Iteration index the visit belongs to (0 for the initial pass, >0 for repairs). */
  iteration: number;
  attemptId?: string;
  status?: string;
  /** True for the most recent visit of this node; earlier visits are repair history. */
  latest: boolean;
  /** True when the routing cursor is on this node and no terminal state was recorded for it. */
  current: boolean;
}

export interface GraphRunTrail {
  /** Actual visits in execution order. Never a projection of the fixed graph order. */
  visits: GraphTrailVisit[];
  /** Definition nodes not visited in this run: other branches, repair paths, unreached steps. */
  notVisited: string[];
  /** Number of iterations (>1 means at least one repair loop ran). */
  iterations: number;
}

/**
 * The step trail lists what the run actually did, in the order it did it, iteration by
 * iteration. For routed (version 5) runs the order comes from the persisted visit records, so a
 * branch or a repair loop is shown as what happened and unvisited nodes are grouped separately
 * rather than implied as a fixed sequence. Older sequential runs use their frozen planned path.
 */
export function graphRunTrail(run: GraphSequentialRun): GraphRunTrail {
  const visits: GraphTrailVisit[] = [];
  const statusOf = (nodeId: string, attemptId?: string) =>
    attemptId
      ? graphNodeAttempts(run, nodeId).find((item) => item.attemptId === attemptId)?.status
      : undefined;
  const iterations = run.routing?.iterations ?? [];
  if (run.version === 5 && iterations.length) {
    for (const iteration of iterations)
      for (const nodeId of iteration.visitedNodeIds) {
        const attemptId = iteration.attemptIds[nodeId];
        visits.push({
          nodeId,
          iteration: iteration.index,
          ...(attemptId ? { attemptId } : {}),
          ...(statusOf(nodeId, attemptId) ? { status: statusOf(nodeId, attemptId) } : {}),
          latest: false,
          current: false,
        });
      }
    // 路由光标所在但尚未记录为已访问的节点：当前正在等待/执行，仍属当前迭代。
    const cursor = run.routing?.cursorNodeId;
    const currentIteration = iterations.find((item) => item.id === run.routing?.currentIterationId);
    if (cursor && currentIteration && !currentIteration.visitedNodeIds.includes(cursor)) {
      const attemptId = currentIteration.attemptIds[cursor];
      visits.push({
        nodeId: cursor,
        iteration: currentIteration.index,
        ...(attemptId ? { attemptId } : {}),
        ...(statusOf(cursor, attemptId) ? { status: statusOf(cursor, attemptId) } : {}),
        latest: false,
        current: true,
      });
    }
  } else {
    for (const nodeId of run.plannedPath) {
      const attempts = graphNodeAttempts(run, nodeId);
      const attempt = attempts.at(-1);
      visits.push({
        nodeId,
        iteration: 0,
        ...(attempt ? { attemptId: attempt.attemptId, status: attempt.status } : {}),
        latest: false,
        current: false,
      });
    }
  }
  const lastIndex = new Map<string, number>();
  visits.forEach((visit, index) => lastIndex.set(visit.nodeId, index));
  const result = visits.map((visit, index) => ({
    ...visit,
    latest: lastIndex.get(visit.nodeId) === index,
  }));
  // 光标所在节点若已有尝试，则以其最新一次访问为“当前”；否则保留上面标记的新增访问。
  const cursor = run.version === 5 ? run.routing?.cursorNodeId : undefined;
  if (cursor)
    result.forEach((visit) => {
      if (visit.nodeId === cursor && visit.latest) visit.current = true;
    });
  const visited = new Set(result.map((visit) => visit.nodeId));
  return {
    visits: result,
    notVisited: run.definition.nodes.map((node) => node.id).filter((id) => !visited.has(id)),
    iterations: iterations.length || 1,
  };
}
