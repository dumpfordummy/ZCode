import type { GraphRunSummary } from "./graphRunSummaryTypes.js";

/**
 * UX-P2 presentation choices for a selected run. Pure functions of the existing run summary: they
 * pick a label, never an outcome. Nothing here derives verification, approval or ownership.
 */

export type GraphRunStage =
  | { kind: "running-task" | "running-tool"; step: string }
  | { kind: "none" };

/**
 * The stage of a run that is executing and waiting on nobody. Permission, question, approval and
 * continuation waits keep their own banners, so they are never `running-*` here.
 */
export function graphRunStage(summary: GraphRunSummary): GraphRunStage {
  const { status, currentStep } = summary.execution;
  if (!currentStep || (status !== "Running" && status !== "Starting")) return { kind: "none" };
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

/** The terminal End node is never an informative "current step": the step strip already shows it. */
export function graphIsEndStep(summary: GraphRunSummary): boolean {
  return summary.execution.currentStep?.kind === "end";
}
