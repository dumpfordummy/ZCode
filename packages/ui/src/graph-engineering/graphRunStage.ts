import type { GraphRunSummary } from "./graphRunSummaryTypes.js";

/**
 * UX-P2 presentation choices for a selected run. Pure functions of the existing run summary: they
 * pick a label, never an outcome. Nothing here derives verification, approval or ownership.
 */

export type GraphRunStage =
  | { kind: "running-task" | "running-tool"; step: string }
  | { kind: "none" };

export interface GraphStatusMismatch {
  kind: "permission" | "question" | "unconfirmed";
  step: string;
  /** The attempt's own status, shown verbatim; the run-level status is never rewritten. */
  status: string;
}

/** Highest first: a permission outranks a question, which outranks an unconfirmed status. */
const mismatchClasses: ReadonlyArray<readonly [GraphStatusMismatch["kind"], readonly string[]]> = [
  ["permission", ["WaitingForPermission"]],
  ["question", ["WaitingForUser"]],
  ["unconfirmed", ["Unknown", "Interrupted", "CancelRequested"]],
];

/**
 * UX-P2-F1, fail closed. A run that says `Starting`/`Running` while a current attempt is waiting for
 * the operator or its status is unconfirmed must not claim that nothing is needed. Current writers
 * assign the run status from the attempt in one record, so this only guards restored, imported or
 * inconsistent records; it is presentation only and never answers, approves, starts or replays.
 */
export function graphStatusMismatch(summary: GraphRunSummary): GraphStatusMismatch | undefined {
  const { status, currentStep } = summary.execution;
  if (status !== "Running" && status !== "Starting") return undefined;
  const attempts = [
    ...summary.actionableSessions.map((session) => ({
      step: session.name,
      status: session.status,
    })),
    ...(currentStep?.status ? [{ step: currentStep.name, status: currentStep.status }] : []),
  ];
  for (const [kind, statuses] of mismatchClasses) {
    const hit = attempts.find((attempt) => statuses.includes(attempt.status));
    if (hit) return { kind, step: hit.step, status: hit.status };
  }
  return undefined;
}

/**
 * The stage of a run that is executing and waiting on nobody. Permission, question, approval and
 * continuation waits keep their own banners, so they are never `running-*` here, and neither is a
 * run whose attempt disagrees with its own `Running` status.
 */
export function graphRunStage(summary: GraphRunSummary): GraphRunStage {
  const { status, currentStep } = summary.execution;
  if (!currentStep || (status !== "Running" && status !== "Starting")) return { kind: "none" };
  if (graphStatusMismatch(summary)) return { kind: "none" };
  if (currentStep.kind === "task") return { kind: "running-task", step: currentStep.name };
  if (currentStep.kind === "tool") return { kind: "running-tool", step: currentStep.name };
  return { kind: "none" };
}

const unconfirmedOutcomes = new Set(["Interrupted", "Unknown"]);
const notDispatched = new Set(["Pending", "Skipped"]);

/**
 * Locale key of the Human decision fact. `unknown` also covers a run whose own outcome is
 * unconfirmed (executor ownership uncertain): when no approval request or decision exists yet, the
 * truth is "undetermined", not "the approval record is incomplete". Any request, decision or
 * dispatched gate (including stale evidence) keeps the original `unknown` wording.
 */
export function graphHumanKey(summary: GraphRunSummary): string {
  const { human, execution } = summary;
  if (
    human.state === "unknown" &&
    unconfirmedOutcomes.has(execution.status) &&
    human.gates.every(
      (gate) =>
        !gate.requestId && !gate.decision && (!gate.status || notDispatched.has(gate.status)),
    )
  )
    return "human.unconfirmed";
  return `human.${human.state}`;
}

/** The cursor sits on the terminal End node. On its own this says nothing about success. */
export function graphIsEndStep(summary: GraphRunSummary): boolean {
  return summary.execution.currentStep?.kind === "end";
}

/**
 * UX-P2-F1: the End node is dropped as a "current step" only for a run that is recorded Completed
 * (the step strip already shows it). A run stopped, failed, cancelled, interrupted or waiting with
 * an End cursor keeps both the `Current step` fact and its inspect action, so an End cursor is never
 * read as proof of completion and such a run never reads "No action required".
 */
export function graphSettledAtEnd(summary: GraphRunSummary): boolean {
  return summary.execution.status === "Completed" && graphIsEndStep(summary);
}
