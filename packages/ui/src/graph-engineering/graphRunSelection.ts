import type { GraphSequentialRun } from "@zcode/services";
import { graphSelectedAttempt } from "./graphRoutingView.js";

/** Reuse inspector identity selection; never fall back to another repair iteration. */
export function graphSummaryAttempt<
  T extends { nodeId: string; attemptId: string; iterationId?: string },
>(run: GraphSequentialRun, nodeId: string, attempts: T[] | undefined): T | undefined {
  const selected = graphSelectedAttempt(run, nodeId);
  return attempts?.find(
    (attempt) =>
      attempt.nodeId === nodeId &&
      attempt.attemptId === selected?.attemptId &&
      (run.version !== 5 || attempt.iterationId === run.routing?.currentIterationId),
  );
}

export const graphSummaryActiveStatuses = new Set([
  "Starting",
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
  "CancelRequested",
  "Interrupted",
  "Unknown",
]);
