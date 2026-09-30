import type { GraphWorkspaceView } from "@zcode/services";

export interface GraphSessionOwner {
  runId: string;
  nodeId: string;
  attemptId: string;
}

/**
 * Which run step owns a native session. Matching is by the exact session id recorded on the
 * attempt; the caller passes the view of the same workspace target, so a run of another
 * workspace can never match. Newest runs are searched first.
 */
export function graphSessionOwner(
  view: Pick<GraphWorkspaceView, "runs">,
  sessionId: string,
): GraphSessionOwner | null {
  const runs = [...view.runs].sort((a, b) => b.createdAt - a.createdAt);
  for (const run of runs) {
    if (run.version === undefined) {
      const task = run.definition.nodes.find((node) => node.type === "task");
      if (task && run.sessionId === sessionId)
        return { runId: run.id, nodeId: task.id, attemptId: run.attemptId };
      continue;
    }
    for (const attempt of [...run.nodeAttempts, ...(run.toolAttempts ?? [])].reverse())
      if (attempt.sessionId === sessionId)
        return { runId: run.id, nodeId: attempt.nodeId, attemptId: attempt.attemptId };
  }
  return null;
}
