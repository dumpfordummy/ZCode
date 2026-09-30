import { graphRunIsUnresolved } from "./graphEditing.js";

/**
 * Renderer-side view of the Host's one-unresolved-run admission rule (UX-M1 spec section 2).
 *
 * The Host stays authoritative. This only lets the renderer refuse earlier and more conservatively,
 * from the latest Host projection, on every path that would instantiate, save a replacement,
 * prepare a runnable submission or admit work: not only on the visible Start button.
 */
export type GraphAdmission =
  | { blocked: false }
  | { blocked: true; reason: "run-active"; runId: string };

interface AdmissionRun {
  id: string;
  status: string;
  release?: unknown;
  requestId?: string;
}

/**
 * `reconcilingRequestId`: a retained submission whose acknowledgment was lost is re-sent with the
 * same request id and is idempotent at the Host. The unresolved run that request already created is
 * not a second admission, so it must not block that retry (existing lost-submission recovery).
 */
export function graphAdmission(
  runs: readonly AdmissionRun[],
  options: { reconcilingRequestId?: string } = {},
): GraphAdmission {
  const occupying = runs.find(
    (run) =>
      graphRunIsUnresolved(run) &&
      !(
        options.reconcilingRequestId !== undefined && run.requestId === options.reconcilingRequestId
      ),
  );
  return occupying
    ? { blocked: true, reason: "run-active", runId: occupying.id }
    : { blocked: false };
}

/** Thrown by the hook-level refusal when an alternate path reaches admission while a run is unresolved. */
export class GraphAdmissionBlockedError extends Error {
  readonly runId: string;
  constructor(runId: string) {
    super(`Graph admission is blocked: run ${runId} is still unresolved.`);
    this.name = "GraphAdmissionBlockedError";
    this.runId = runId;
  }
}

/** Throws unless admission is open. Used at the lowest renderer path before any mutation. */
export function assertGraphAdmission(
  runs: readonly AdmissionRun[],
  options: { reconcilingRequestId?: string } = {},
): void {
  const admission = graphAdmission(runs, options);
  if (admission.blocked) throw new GraphAdmissionBlockedError(admission.runId);
}
