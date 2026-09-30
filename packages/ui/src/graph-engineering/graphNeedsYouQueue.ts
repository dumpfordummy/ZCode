import type { GraphRun } from "@zcode/services";
import { graphRunIsUnresolved } from "./graphEditing.js";
import { graphRunSummary } from "./graphRunSummary.js";

export interface GraphNeedsYouItem {
  runId: string;
  runName: string;
  kind: "permission" | "question" | "approval" | "continuation";
  nodeId: string;
  stepName: string;
  attemptId?: string;
  sessionId?: string;
}

/**
 * Pending human actions derived from the complete run projection the Host returned
 * (`view.runs`), never from the visible history page. A run that is not unresolved cannot need
 * the user. This is a projection of captured facts; it neither answers nor grants anything.
 */
export function graphNeedsYou(runs: readonly GraphRun[]): GraphNeedsYouItem[] {
  const items: GraphNeedsYouItem[] = [];
  for (const run of runs) {
    if (run.version === undefined || !graphRunIsUnresolved(run)) continue;
    const summary = graphRunSummary(run);
    for (const session of summary.actionableSessions) {
      if (session.status !== "WaitingForPermission" && session.status !== "WaitingForUser")
        continue;
      items.push({
        runId: run.id,
        runName: run.definition.name,
        kind: session.status === "WaitingForPermission" ? "permission" : "question",
        nodeId: session.nodeId,
        stepName: session.name,
        attemptId: session.attemptId,
        sessionId: session.sessionId,
      });
    }
    for (const gate of summary.human.gates) {
      if (gate.canDecide || gate.canContinue)
        items.push({
          runId: run.id,
          runName: run.definition.name,
          kind: gate.canDecide ? "approval" : "continuation",
          nodeId: gate.nodeId,
          stepName: gate.name,
          ...(gate.attemptId ? { attemptId: gate.attemptId } : {}),
        });
    }
    if (summary.checkpoint && !items.some((item) => item.runId === run.id))
      items.push({
        runId: run.id,
        runName: run.definition.name,
        kind: "continuation",
        nodeId: summary.checkpoint.successorNodeId,
        stepName: summary.checkpoint.successorNodeId,
      });
  }
  return items;
}
