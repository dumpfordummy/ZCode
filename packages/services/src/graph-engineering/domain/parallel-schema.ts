import { z } from "zod";
import { graphSettingsSchema } from "./sequential.js";
import { targetSchema } from "./definition.js";
import { graphRecipeSchema } from "./artifact-schemas.js";
import { zcodeExecutionEnvironmentPreviewSchema } from "@zcode/shared";
import { parallelIntegrityErrors } from "./parallel-integrity.js";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const path = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.includes(":") &&
      value.split("/").every((p) => p && p !== "." && p !== ".." && p.toLowerCase() !== ".git"),
    "Unsafe relative path",
  );
export const parallelPlanSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    name: z.string().trim().min(1).max(200),
    request: z.string().trim().min(1).max(10000),
    sharedContract: z.string().trim().min(1).max(10000),
    resultRequirements: z.string().trim().min(1).max(10000),
    concurrency: z.union([z.literal(1), z.literal(2)]),
    deadlineMs: z.number().int().min(1000).max(3600000),
    admissionBudget: z.number().int().min(1).max(5),
    branches: z
      .array(
        z
          .object({
            id,
            name: z.string().trim().min(1).max(200),
            selected: z.boolean(),
            instructions: z.string().trim().min(1).max(20000),
            files: z.array(path).min(1).max(32),
            additions: z.array(path).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    buildRecipeId: id,
    testRecipeId: id,
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (
      new Set(plan.branches.map((b) => b.id)).size !== plan.branches.length ||
      plan.branches.some((b) => ["integration", "validation"].includes(b.id))
    )
      ctx.addIssue({ code: "custom", message: "Unique nonreserved branch IDs required." });
    if (!plan.branches.some((b) => b.selected))
      ctx.addIssue({ code: "custom", message: "Select at least one branch." });
    for (const b of plan.branches)
      if (b.additions.some((p) => !b.files.includes(p)) || new Set(b.files).size !== b.files.length)
        ctx.addIssue({
          code: "custom",
          message: "Additions must be unique explicitly owned files.",
        });
  });
const base = z
  .object({
    workspacePath: z.string().min(1),
    head: z.string().regex(/^[a-f0-9]{40,64}$/),
    digest: hash,
    trackedPaths: z.array(path).min(1).max(20000),
  })
  .strict();
const workspace = z
  .object({
    ownerId: id,
    slot: id,
    workspacePath: z.string().min(1),
    base,
    token: id,
    configDigest: hash,
    cleaned: z.boolean().optional(),
  })
  .strict();
const inventory = z
  .object({
    environment: zcodeExecutionEnvironmentPreviewSchema,
    providerId: z.string(),
    modelId: z.string(),
    destination: z.string(),
    modelDigest: hash,
    digest: hash,
    unknowns: z.array(z.string()),
  })
  .strict();
const preview = z
  .object({ digest: hash, base, inventory, recipes: z.array(graphRecipeSchema).length(2) })
  .strict();
const proposal = z
  .object({
    branchId: id,
    digest: hash,
    sourceDigest: hash,
    files: z
      .array(
        z
          .object({
            path,
            before: z.string().max(131072),
            after: z.string().max(131072),
            kind: z.enum(["edit", "add", "delete"]),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
const child = z
  .object({
    id,
    requestId: id,
    selected: z.boolean(),
    workspace: workspace.optional(),
    inventory: inventory.optional(),
    definitionRevision: z.number().int().nonnegative().optional(),
    runId: z.string().optional(),
    admission: z.enum(["reserved", "acknowledged"]).optional(),
    proposal: proposal.optional(),
  })
  .strict();
export const parallelRunSchema = z
  .object({
    id,
    requestId: id,
    requestFingerprint: z.string(),
    target: targetSchema,
    plan: parallelPlanSchema,
    settings: graphSettingsSchema,
    preview,
    phase: z.enum([
      "Preparing",
      "Prepared",
      "Workers",
      "JoinReview",
      "Integrating",
      "Validating",
      "Completed",
      "Stopped",
      "Interrupted",
    ]),
    createdAt: z.number(),
    updatedAt: z.number(),
    deadlineAt: z.number().optional(),
    admissions: z.number().int().min(0).max(5),
    children: z.array(child).min(1).max(2),
    integration: child,
    validation: child,
    preparedDigest: hash.optional(),
    joinDigest: hash.optional(),
    planDecision: z
      .object({
        id,
        digest: hash,
        approved: z.boolean(),
        comment: z.string().max(2000),
        at: z.number(),
      })
      .strict()
      .optional(),
    integrationDecision: z
      .object({
        id,
        digest: hash,
        approved: z.boolean(),
        resolutions: z.record(z.string(), z.string()),
        comment: z.string().max(2000),
        at: z.number(),
      })
      .strict()
      .optional(),
    expectedProposal: proposal.optional(),
    message: z.string().max(4000).optional(),
    cancelledAt: z.number().optional(),
    released: z
      .object({ at: z.number(), reason: z.string().min(1).max(2000) })
      .strict()
      .optional(),
    preservedSlots: z.array(id),
    retentionDecisions: z
      .array(
        z
          .object({
            slots: z.array(id).min(1).max(3),
            preserve: z.boolean(),
            at: z.number(),
            reason: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
    cleanup: z.array(
      z
        .object({ slot: id, at: z.number(), reason: z.string().min(1).max(2000).optional() })
        .strict(),
    ),
  })
  .strict()
  .superRefine((run, ctx) => {
    for (const message of parallelIntegrityErrors(run)) ctx.addIssue({ code: "custom", message });
  });
export const parallelRecordSchema = z
  .object({ plan: parallelPlanSchema.optional(), runs: z.array(parallelRunSchema).max(100) })
  .strict()
  .superRefine((record, ctx) => {
    if (
      new Set(record.runs.map((r) => r.id)).size !== record.runs.length ||
      new Set(record.runs.map((r) => r.requestId)).size !== record.runs.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate parallel run or request identity." });
  });
