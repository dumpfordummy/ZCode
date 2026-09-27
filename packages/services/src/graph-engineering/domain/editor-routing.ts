import { z } from "zod";
import type { GraphPredicate, GraphSequentialDefinition } from "../contract.js";
import type {
  GraphRepairPolicyEdit,
  GraphRepairPresetProjection,
  GraphScalarConditionPreset,
} from "../editor-types.js";
import { validateReadiness } from "./definition.js";
import { sequentialDefinitionSchema } from "./sequential.js";
import { predicateErrors } from "./routing-predicates.js";

const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const scalarPreset = z
  .object({
    alias: identifier,
    pointer: z.string().max(1024),
    operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "present"]),
    value: z.union([z.null(), z.boolean(), z.number().finite(), z.string().max(2000)]).optional(),
    exit: identifier,
    defaultExit: identifier,
  })
  .strict();
const repairPolicy = z
  .object({
    additionalRepairs: z.number().int().min(0).max(5),
    deadlineMinutes: z
      .number()
      .positive()
      .max(1440)
      .refine(
        (value) => Number.isSafeInteger(value * 60_000) && value * 60_000 >= 1,
        "Choose a deadline representable in whole milliseconds.",
      ),
    maxNodeAdmissions: z.number().int().min(1).max(64),
    stopOnNoProgress: z.boolean(),
  })
  .strict();

function validated(graph: GraphSequentialDefinition): GraphSequentialDefinition {
  sequentialDefinitionSchema.parse(graph);
  const readiness = validateReadiness(graph);
  if (readiness.errors.length) throw new Error(readiness.errors.join("\n"));
  return graph;
}

/** Replace one explicit scalar branch; no new evaluator, inferred route or implicit edge. */
export function applyGraphConditionPreset(
  definition: GraphSequentialDefinition,
  nodeId: string,
  input: GraphScalarConditionPreset,
): GraphSequentialDefinition {
  const preset = scalarPreset.parse(input);
  const next = structuredClone(definition);
  const node = next.nodes.find((item) => item.id === nodeId);
  if (next.version !== 5 || node?.type !== "condition")
    throw new Error("Select a version-5 Condition to edit its scalar branch.");
  const branch = node.branches.find((item) => item.exit === preset.exit);
  if (!branch)
    throw new Error(
      "Select an existing explicit branch exit; new routes require Advanced editing.",
    );
  if (["all", "any", "not"].includes(branch.predicate.op))
    throw new Error("This complex predicate is Advanced-only; no existing predicate was replaced.");
  if (!node.inputs.some((binding) => binding.alias === preset.alias))
    throw new Error("The scalar predicate must select an existing explicit input alias.");
  if (preset.operator === "present" ? Object.hasOwn(preset, "value") : preset.value === undefined)
    throw new Error(
      "Presence has no comparison value; other scalar operators require an explicit value.",
    );
  if (["gt", "gte", "lt", "lte"].includes(preset.operator) && typeof preset.value !== "number")
    throw new Error("Ordered scalar comparisons require a finite numeric value.");
  const predicate: GraphPredicate =
    preset.operator === "present"
      ? { op: "present", alias: preset.alias, pointer: preset.pointer }
      : { op: preset.operator, alias: preset.alias, pointer: preset.pointer, value: preset.value! };
  const issues = predicateErrors(predicate);
  if (issues.length) throw new Error(issues.join("\n"));
  branch.predicate = predicate;
  node.defaultExit = preset.defaultExit;
  node.errorPolicy = "needs-human";
  return validated(next);
}

/** Recognize the current verified reviewer/repair pattern, retaining all expanded Test steps. */
export function graphRepairPreset(
  definition: GraphSequentialDefinition,
): GraphRepairPresetProjection {
  const region = definition.routing?.region;
  const decision = definition.nodes.find((node) => node.id === region?.decisionNodeId);
  const testNodeIds =
    decision?.type === "condition" ? [...(decision.verification?.testNodeIds ?? [])] : [];
  const base = {
    testNodeIds,
    ...(definition.routing ? { finalGateId: definition.routing.finalGateId } : {}),
  };
  const unsupported = (reason: string): GraphRepairPresetProjection => ({
    ...base,
    supported: false,
    reason,
  });
  if (
    definition.version !== 5 ||
    !region ||
    decision?.type !== "condition" ||
    !decision.verification?.reviewerNodeId
  )
    return unsupported(
      "Use the existing verified repair workflow to configure a guided repair policy; other routing remains Advanced-only.",
    );
  try {
    validated(definition);
  } catch (error) {
    return unsupported(
      `Correct the existing repair declarations in Advanced: ${(error as Error).message}`,
    );
  }
  const reviewer = decision.inputs.find(
    (binding) =>
      binding.source.kind === "artifact" &&
      binding.source.nodeId === decision.verification!.reviewerNodeId &&
      binding.source.selector === "structured" &&
      !binding.source.pointer,
  );
  const matches = (exit: string, value: string) => {
    const branch = decision.branches.find((item) => item.exit === exit);
    return (
      branch?.predicate.op === "eq" &&
      branch.predicate.alias === reviewer?.alias &&
      branch.predicate.pointer === "/outcome" &&
      branch.predicate.value === value
    );
  };
  const exitsToGate = [region.passExit, decision.defaultExit].every((exit) =>
    definition.edges.some(
      (edge) =>
        edge.source === decision.id &&
        edge.sourcePort === exit &&
        edge.target === definition.routing!.finalGateId,
    ),
  );
  if (
    decision.branches.length !== 2 ||
    !matches(region.passExit, "pass") ||
    !matches(region.repairExit, "needs_changes") ||
    !exitsToGate
  )
    return unsupported(
      "This custom repair classifier is Advanced-only; the guided preset requires explicit reviewer pass/needs_changes branches and a final human gate.",
    );
  return {
    ...base,
    supported: true,
    policy: {
      additionalRepairs: region.maxRepairIterations,
      deadlineMinutes: definition.routing!.limits.deadlineMs / 60_000,
      maxNodeAdmissions: definition.routing!.limits.maxNodeAdmissions,
      stopOnNoProgress: region.stopOnNoProgress,
    },
  };
}

/** Update independent existing limits without rewriting graph nodes, evidence or exit policy. */
export function applyGraphRepairPolicy(
  definition: GraphSequentialDefinition,
  input: GraphRepairPolicyEdit,
): GraphSequentialDefinition {
  const policy = repairPolicy.parse(input);
  const projection = graphRepairPreset(definition);
  if (!projection.supported) throw new Error(projection.reason);
  const next = structuredClone(definition);
  const region = next.routing!.region!;
  region.maxRepairIterations = policy.additionalRepairs;
  region.stopOnNoProgress = policy.stopOnNoProgress;
  next.routing!.limits = {
    maxNodeAdmissions: policy.maxNodeAdmissions,
    deadlineMs: policy.deadlineMinutes * 60_000,
  };
  return validated(next);
}
