import type { GraphRun } from "@zcode/services";
import { graphCommandLine } from "./graphCommandLine.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";

export interface GraphPermissionInfo {
  nodeId: string;
  name: string;
  attemptId: string;
  sessionId: string;
  kind: "task" | "tool";
  /**
   * Graph-known configuration only: the recipe command frozen with the run. It is not the exact
   * permission request; the pending request itself is owned by the native session and is
   * answered in that conversation. Absent when Graph has no configured command for the step.
   */
  configuredCommand?: string;
}

/** Steps currently waiting for a native permission, with what Graph itself knows about them. */
export function graphPermissionInfo(
  run: GraphRun,
  summary: GraphRunSummary,
): GraphPermissionInfo[] {
  return summary.actionableSessions
    .filter((session) => session.status === "WaitingForPermission")
    .map((session) => {
      const recipe =
        run.version !== undefined
          ? run.provenance?.recipes.find((item) => item.nodeId === session.nodeId)
          : undefined;
      return {
        nodeId: session.nodeId,
        name: session.name,
        attemptId: session.attemptId,
        sessionId: session.sessionId,
        kind: session.kind,
        ...(recipe ? { configuredCommand: graphCommandLine(recipe.command) } : {}),
      };
    });
}
