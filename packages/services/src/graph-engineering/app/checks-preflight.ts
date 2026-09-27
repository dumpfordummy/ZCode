import type { GraphSequentialRun } from "../contract.js";
import type { GraphState } from "./state.js";

/** Same review is revalidated across every asynchronous native creation/persist boundary. */
export async function assertReviewedChecks(
  state: GraphState,
  run: GraphSequentialRun,
): Promise<void> {
  if (!run.purpose) return;
  const preview = run.purpose.preview;
  const current = await state.options.checks?.capture(
    run.target,
    preview.revision,
    preview.selection,
    preview.recipeDigest,
  );
  if (!current || current.digest !== preview.digest)
    throw new Error(
      "Reviewed checks/source/native configuration changed before dispatch. Prepare a new calibration; no command was retried.",
    );
}
