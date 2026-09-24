import { z } from "zod";

export const zcodeRecipeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    executable: z.string().trim().min(1).max(4096),
    args: z.array(z.string().max(8192)).max(64),
    cwdRelative: z.string().min(1).max(4096),
    timeoutMs: z.number().int().min(100).max(600_000),
    redactEnvironmentVariables: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .max(128),
      )
      .max(32)
      .optional(),
  })
  .strict();
export type ZCodeRecipe = z.infer<typeof zcodeRecipeSchema>;

export const zcodeRecipeRequestSchema = z
  .object({
    operationId: z.string().uuid(),
    recipe: zcodeRecipeSchema,
  })
  .strict();
export type ZCodeRecipeRequest = z.infer<typeof zcodeRecipeRequestSchema>;

const outputSchema = z
  .object({
    text: z.string().max(262144),
    bytes: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();
export const zcodeRecipeResultSchema = z
  .object({
    processExitObserved: z.boolean(),
    status: z.enum(["completed", "failed", "timed_out", "cancelled", "spawn_error"]),
    exitCode: z.number().int().optional(),
    signal: z.string().optional(),
    stdout: outputSchema,
    stderr: outputSchema,
    durationMs: z.number().nonnegative(),
    timedOut: z.boolean(),
    cancelled: z.boolean(),
  })
  .strict();
export type ZCodeRecipeResult = z.infer<typeof zcodeRecipeResultSchema>;

export const zcodeRecipeSnapshotSchema = z
  .object({
    operationId: z.string().uuid(),
    sessionId: z.string().min(1),
    requestDigest: z.string().optional(),
    recipeId: z.string().optional(),
    cwd: z.string().optional(),
    status: z.enum([
      "awaiting_permission",
      "running",
      "completed",
      "failed",
      "cancelled",
      "unknown",
    ]),
    processStarted: z.boolean(),
    startedAt: z.number().optional(),
    completedAt: z.number().optional(),
    result: zcodeRecipeResultSchema.optional(),
    error: z.string().max(4096).optional(),
  })
  .strict();
export type ZCodeRecipeSnapshot = z.infer<typeof zcodeRecipeSnapshotSchema>;

export const zcodeRecipeStartParamsSchema = z
  .object({ sessionId: z.string().min(1), request: zcodeRecipeRequestSchema })
  .strict();
export const zcodeRecipeTargetSchema = z
  .object({ sessionId: z.string().min(1), operationId: z.string().uuid() })
  .strict();
