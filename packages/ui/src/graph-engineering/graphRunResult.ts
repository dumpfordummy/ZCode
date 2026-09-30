import type { GraphRun } from "@zcode/services";
import { graphRunOutputs } from "./graphRunOutputs.js";
import type { GraphRunSummary } from "./graphRunSummaryTypes.js";

export type GraphRunResultKind =
  | "reviewer-output-invalid"
  | "test-failed"
  | "evidence-invalid"
  | "stopped"
  | "none";

export interface GraphRunResult {
  kind: GraphRunResultKind;
  /** Invalid structured outputs of the current attempts (reviewer JSON that failed validation). */
  invalidOutputs: Array<{ nodeId: string; name: string; attemptId: string; issues: string[] }>;
  failedChecks: Array<{ nodeId: string; name: string }>;
  invalidChecks: Array<{ nodeId: string; name: string }>;
  /** Only facts captured on the run; nothing here is a claim about the current workspace. */
  stillTrue: {
    passedChecks: string[];
    capturedChangeFiles: number;
    approvalNotRequested: boolean;
    approvalNotReached: boolean;
  };
  /** Host message for a stop that has no more specific cause. */
  message?: string;
}

const stoppedStatuses = new Set(["NeedsHuman", "Failed", "BudgetExhausted", "NoProgress"]);

/**
 * One classification per run, chosen from persisted facts in a fixed order:
 * invalid reviewer output, failed Test, invalid machine evidence, other stop.
 * Machine-check invalidity is never reported as reviewer output and vice versa.
 */
export function graphRunResult(run: GraphRun, summary: GraphRunSummary): GraphRunResult {
  const invalidOutputs = graphRunOutputs(run)
    .filter((output) => output.state === "invalid")
    .map(({ nodeId, name, attemptId, issues }) => ({ nodeId, name, attemptId, issues }));
  const failedChecks = summary.evidence.checks
    .filter((check) => check.state === "failed")
    .map(({ nodeId, name }) => ({ nodeId, name }));
  const invalidChecks = summary.evidence.checks
    .filter((check) => check.state === "invalid")
    .map(({ nodeId, name }) => ({ nodeId, name }));
  const kind: GraphRunResultKind = invalidOutputs.length
    ? "reviewer-output-invalid"
    : failedChecks.length
      ? "test-failed"
      : invalidChecks.length
        ? "evidence-invalid"
        : run.version !== undefined && stoppedStatuses.has(run.status)
          ? "stopped"
          : "none";
  return {
    kind,
    invalidOutputs,
    failedChecks,
    invalidChecks,
    stillTrue: {
      passedChecks: summary.evidence.checks
        .filter((check) => check.state === "passed")
        .map((check) => check.name),
      capturedChangeFiles: summary.sourceChanges.reduce(
        (count, entry) => count + entry.snapshot.files.length,
        0,
      ),
      approvalNotRequested: summary.human.state === "not-requested",
      approvalNotReached: summary.human.state === "not-reached",
    },
    ...(run.version !== undefined && run.message ? { message: run.message } : {}),
  };
}
