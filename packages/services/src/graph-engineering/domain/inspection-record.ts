import { z } from "zod";
import {
  inspectionSelectionSchema,
  inspectionProjectionSchema,
  zcodeRecipeRequestSchema,
} from "@zcode/shared";
export const inspectionRecordSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("project-inspection"),
    id: z.string().uuid(),
    status: z.enum([
      "review-ready",
      "verifying-sources",
      "awaiting-permission",
      "running",
      "succeeded",
      "denied",
      "cancelled",
      "expired",
      "source-changed",
      "runtime-changed",
      "invalid-output",
      "failed",
      "executor-lost",
      "unavailable",
    ]),
    target: z
      .object({
        workspacePath: z.string().max(4096),
        workspaceIdentity: z.string().max(4096).optional(),
      })
      .strict(),
    selection: inspectionSelectionSchema,
    request: zcodeRecipeRequestSchema.optional(),
    requestDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sessionId: z.string().max(4096).optional(),
    runtimeIdentity: z.string().max(8192).optional(),
    environmentDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    reserved: z.boolean(),
    projection: inspectionProjectionSchema.optional(),
    scopeComplete: z.literal(false),
    message: z.string().max(1000),
    timings: z
      .array(z.object({ phase: z.string().max(64), elapsedMs: z.number().nonnegative() }).strict())
      .max(64),
  })
  .strict();
export const inspectionHistorySchema = z.array(inspectionRecordSchema).max(16);
