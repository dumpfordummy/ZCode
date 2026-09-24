import { z } from "zod";
import type { GraphPredicate } from "../contract.js";
import { predicateErrors, predicateNodeCount, pointerSegments } from "./routing-predicates.js";
import { validateGraphRelativePath } from "./artifact-schemas.js";

const id = z.string().min(1).max(200);
const alias = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const pointer = z.string().superRefine((value, ctx) => {
  try {
    pointerSegments(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
  }
});
export const conditionNodeSchema = z
  .object({
    id,
    position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
    type: z.literal("condition"),
    name: z.string().max(200),
    inputs: z
      .array(
        z
          .object({
            alias,
            source: z
              .object({
                kind: z.literal("artifact"),
                nodeId: id,
                selector: z.string().min(1).max(500),
                pointer: pointer.optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(8),
    branches: z
      .array(
        z
          .object({
            exit: alias,
            predicate: z.custom<GraphPredicate>(
              (value) => predicateErrors(value).length === 0,
              "A bounded typed condition predicate is required.",
            ),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    defaultExit: alias,
    errorPolicy: z.literal("needs-human"),
    verification: z
      .object({
        testNodeIds: z.array(id).min(1).max(8),
        reviewerNodeId: id.optional(),
        successExit: alias,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (
      node.branches.every((b) => predicateErrors(b.predicate).length === 0) &&
      node.branches.reduce((count, b) => count + predicateNodeCount(b.predicate), 0) > 64
    )
      ctx.addIssue({
        code: "custom",
        message: "Condition branches exceed 64 total predicate nodes.",
      });
  });
export const routingDefinitionSchema = z
  .object({
    finalGateId: id,
    limits: z
      .object({
        maxNodeAdmissions: z.number().int().min(1).max(64),
        deadlineMs: z.number().int().min(1).max(86_400_000),
      })
      .strict(),
    region: z
      .object({
        id,
        name: z.string().trim().min(1).max(200),
        entryNodeId: id,
        repairEntryNodeId: id,
        decisionNodeId: id,
        bodyNodeIds: z.array(id).min(3).max(32),
        repairExit: alias,
        passExit: alias,
        maxRepairIterations: z.number().int().min(0).max(5),
        stopOnNoProgress: z.boolean(),
        sourcePaths: z
          .array(
            z.string().superRefine((value, ctx) => {
              try {
                validateGraphRelativePath(value);
              } catch (error) {
                ctx.addIssue({ code: "custom", message: (error as Error).message });
              }
            }),
          )
          .min(1)
          .max(32),
      })
      .strict()
      .optional(),
  })
  .strict();
