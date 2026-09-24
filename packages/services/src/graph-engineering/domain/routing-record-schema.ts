import { z } from "zod";
import type { GraphJsonValue } from "../contract.js";
import { parseBoundedGraphJson } from "./artifacts.js";

const id = z.string().min(1).max(200),
  time = z.number().finite().nonnegative(),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
const json = z.custom<GraphJsonValue>((value) => {
  try {
    return JSON.stringify(parseBoundedGraphJson(JSON.stringify(value))) === JSON.stringify(value);
  } catch {
    return false;
  }
}, "A bounded strict JSON value is required.");
const iteration = z
  .object({
    id,
    index: z.number().int().min(0).max(5),
    createdAt: time,
    attemptIds: z.record(z.string().min(1).max(200), id),
    visitedNodeIds: z.array(id).max(32),
    sourceDigest: digest.optional(),
    feedback: z
      .object({
        text: z.string().max(100_000),
        digest,
        artifactIds: z.array(id).max(32),
        previousIterationId: id,
      })
      .strict()
      .optional(),
    failureFingerprint: digest.optional(),
  })
  .strict();
const condition = z
  .object({
    nodeId: id,
    attemptId: id,
    iterationId: id,
    iteration: z.number().int().min(0).max(5),
    status: z.enum(["Pending", "Evaluated", "Invalid", "Skipped"]),
    createdAt: time,
    updatedAt: time,
    bindings: z
      .array(
        z
          .object({ alias: z.string().min(1).max(64), artifactId: id, digest, value: json })
          .strict(),
      )
      .max(8)
      .optional(),
    values: z
      .array(
        z
          .object({
            alias: z.string().min(1).max(64),
            pointer: z.string().max(1024),
            present: z.boolean(),
            value: json.optional(),
          })
          .strict(),
      )
      .max(256)
      .optional(),
    selectedExit: z.string().max(64).optional(),
    decisionId: id.optional(),
    successorNodeId: id.optional(),
    message: z.string().max(100_000).optional(),
  })
  .strict();
export const routingStateSchema = z
  .object({
    configurationDigest: digest,
    recipeConfigurationDigest: digest,
    currentIterationId: id,
    cursorNodeId: id,
    iterations: z.array(iteration).min(1).max(6),
    conditionAttempts: z.array(condition).max(48),
    admissions: z.number().int().min(0).max(64),
    deadlineAt: time,
    checkpoints: z
      .array(
        z
          .object({
            id,
            digest,
            decisionId: id,
            iterationId: id,
            successorNodeId: id,
            sourceDigest: digest.optional(),
            createdAt: time,
            resumeRequired: z.boolean().optional(),
            consumedAt: time.optional(),
          })
          .strict(),
      )
      .max(48),
    continuations: z
      .array(z.object({ requestId: id, checkpointId: id, checkpointDigest: digest }).strict())
      .max(48),
    stopReason: z
      .object({
        kind: z.enum(["NeedsHuman", "BudgetExhausted", "NoProgress"]),
        message: z.string().min(1).max(100_000),
        at: time,
      })
      .strict()
      .optional(),
  })
  .strict();
