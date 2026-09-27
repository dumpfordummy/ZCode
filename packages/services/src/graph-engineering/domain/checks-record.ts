import { z } from "zod";
import { zcodeExecutionEnvironmentPreviewSchema } from "@zcode/shared";
import type { GraphSequentialRun } from "../contract.js";
import { graphRecipeSchema } from "./artifact-schemas.js";
import { checksSelectionSchema, compileChecksDefinition } from "./project-checks.js";
import { graphCanonical } from "./canonical.js";
import { effectiveGraphRecipe } from "./effective-recipe.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const checksStartSchema = z
  .object({
    selection: checksSelectionSchema,
    expectedDigest: digest,
    digest,
    acknowledgedUnknowns: z.boolean(),
  })
  .strict();
export const checksPurposeSchema = z
  .object({
    kind: z.literal("checks"),
    acceptedAt: z.number().finite().nonnegative(),
    acknowledgedUnknowns: z.boolean(),
    preview: z
      .object({
        kind: z.literal("checks-preview"),
        version: z.literal(1),
        digest,
        revision: z.number().int().nonnegative(),
        recipeDigest: digest,
        sourceDigest: digest,
        selection: checksSelectionSchema,
        recipes: z.array(graphRecipeSchema).min(1).max(8),
        environment: zcodeExecutionEnvironmentPreviewSchema,
        effects: z.array(z.string().max(4096)).max(32),
        unknowns: z.array(z.string().max(4096)).max(128),
      })
      .strict(),
  })
  .strict();
export function checksRecordErrors(run: GraphSequentialRun): string[] {
  if (!run.purpose) return [];
  const { preview } = run.purpose;
  const issues: string[] = [];
  if (
    run.version !== 4 ||
    run.definition.template ||
    run.provenance ||
    run.routing ||
    run.nodeAttempts.length ||
    run.approvalAttempts?.length ||
    preview.revision !== run.definition.revision ||
    run.purpose.acceptedAt !== run.createdAt ||
    (preview.unknowns.length && !run.purpose.acknowledgedUnknowns)
  )
    issues.push("Checks purpose must preserve its explicit Tool-only admission.");
  try {
    const compiled = compileChecksDefinition(preview.selection, preview.recipes, preview.revision);
    if (graphCanonical(compiled.definition) !== graphCanonical(run.definition))
      issues.push("Checks definition does not match its frozen selection.");
    const reviewed: typeof preview.recipes = [];
    for (const node of compiled.definition.nodes) {
      if (node.type !== "tool") continue;
      const expected = effectiveGraphRecipe(
        compiled.definition,
        node.id,
        compiled.recipes.find((r) => r.id === node.recipeId)!,
      );
      reviewed.push(expected);
      const attempt = run.toolAttempts?.find((a) => a.nodeId === node.id);
      if (!attempt || graphCanonical(expected) !== graphCanonical(attempt.recipe))
        issues.push("Checks attempt lost its reviewed recipe/mapping.");
    }
    if (graphCanonical(reviewed) !== graphCanonical(preview.recipes))
      issues.push("Checks preview recipes differ from the reviewed effective commands.");
    if (
      run.requestFingerprint !==
      graphCanonical({
        target: run.target,
        revision: run.definition.revision,
        ...run.defaults,
        checks: {
          selection: preview.selection,
          expectedDigest: preview.recipeDigest,
          digest: preview.digest,
          acknowledgedUnknowns: run.purpose.acknowledgedUnknowns,
        },
      })
    )
      issues.push("Checks request identity differs from its frozen preview.");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Invalid checks selection.");
  }
  return issues;
}
