import type { GraphParallelRun } from "../parallel-contract.js";
import { parallelChildren } from "./parallel.js";

/** Persisted ownership is validated before any native/path operation can use it. */
export function parallelIntegrityErrors(run: GraphParallelRun): string[] {
  const errors: string[] = [];
  const children = parallelChildren(run);
  const selected = run.children.filter((child) => child.selected);
  if (
    run.target.workspacePath !== run.preview.base.workspacePath ||
    run.children.length !== run.plan.branches.length ||
    run.children.some(
      (child, index) =>
        child.id !== run.plan.branches[index]?.id ||
        child.selected !== run.plan.branches[index]?.selected,
    ) ||
    run.integration.id !== "integration" ||
    !run.integration.selected ||
    run.validation.id !== "validation" ||
    !run.validation.selected ||
    new Set(children.map((child) => child.requestId)).size !== children.length
  )
    errors.push("Parallel frozen branch identities are inconsistent.");
  const paths = [...selected, run.integration].flatMap((child) =>
    child.workspace ? [child.workspace.workspacePath] : [],
  );
  if (new Set(paths).size !== paths.length || paths.includes(run.target.workspacePath))
    errors.push("Parallel writable directories must be distinct from each other and the original.");
  for (const child of children) {
    if (
      child.workspace &&
      (child.workspace.ownerId !== run.id ||
        child.workspace.slot !== (child.id === "validation" ? "integration" : child.id) ||
        JSON.stringify(child.workspace.base) !== JSON.stringify(run.preview.base))
    )
      errors.push("Parallel workspace base/owner/slot mismatch.");
    if (
      (!child.selected && (child.workspace || child.admission || child.runId || child.proposal)) ||
      (child.admission && (!child.workspace || !child.inventory)) ||
      (child.admission === "acknowledged" &&
        (!child.runId || child.definitionRevision === undefined)) ||
      (child.proposal &&
        (child.proposal.branchId !== child.id || child.admission !== "acknowledged"))
    )
      errors.push("Parallel child admission/proposal is inconsistent.");
  }
  if (
    run.validation.workspace &&
    JSON.stringify(run.validation.workspace) !== JSON.stringify(run.integration.workspace)
  )
    errors.push("Combined validation must use the exact integration workspace.");
  const admissions = children.reduce(
    (total, child) => total + (child.admission ? (child.id === "validation" ? 2 : 1) : 0),
    0,
  );
  if (run.admissions !== admissions || admissions > run.plan.admissionBudget)
    errors.push("Parallel admission budget accounting is inconsistent.");
  if (
    (run.planDecision && run.planDecision.digest !== run.preparedDigest) ||
    (run.integrationDecision && run.integrationDecision.digest !== run.joinDigest) ||
    (admissions > 0 && !run.planDecision?.approved) ||
    (run.integration.admission && (!run.integrationDecision?.approved || !run.expectedProposal)) ||
    (run.validation.admission && !run.integration.admission)
  )
    errors.push("Parallel admission requires its frozen approved review.");
  if (
    ["Prepared", "Workers", "JoinReview", "Integrating", "Validating", "Completed"].includes(
      run.phase,
    ) &&
    (!run.preparedDigest ||
      [...selected, run.integration].some((child) => !child.workspace || !child.inventory))
  )
    errors.push("Parallel prepared state is incomplete.");
  if (
    ["JoinReview", "Integrating", "Validating", "Completed"].includes(run.phase) &&
    (!run.joinDigest || selected.some((child) => !child.proposal))
  )
    errors.push("Join requires proposals from every selected branch.");
  if (run.phase === "Completed" && run.validation.admission !== "acknowledged")
    errors.push("Completion requires combined validation.");
  if (
    run.updatedAt < run.createdAt ||
    (run.deadlineAt !== undefined && !run.planDecision?.approved)
  )
    errors.push("Parallel timeline is inconsistent.");
  const slots = [...run.children, run.integration].map((child) => child.id);
  if (
    new Set(run.preservedSlots).size !== run.preservedSlots.length ||
    run.preservedSlots.some((slot) => !slots.includes(slot)) ||
    run.cleanup.some((item) => !slots.includes(item.slot)) ||
    run.retentionDecisions?.some((decision) => decision.slots.some((slot) => !slots.includes(slot)))
  )
    errors.push("Parallel retention references a foreign slot.");
  return errors;
}
