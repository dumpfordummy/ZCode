import { z } from "zod";
import {
  GRAPH_TEXT_LIMIT,
  GRAPH_RESOLVED_LIMIT,
  graphSettingsSchema,
  inputSourceSchema,
} from "./sequential.js";
const id = z.string().min(1).max(200);
const time = z.number().finite().nonnegative();
export const runStatus = z.enum([
  "NeedsHuman",
  "BudgetExhausted",
  "NoProgress",
  "Starting",
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
  "WaitingForApproval",
  "AwaitingContinuation",
  "StaleEvidence",
  "Rejected",
  "CancelRequested",
  "Completed",
  "Failed",
  "Cancelled",
  "Interrupted",
  "Unknown",
]);
export const terminalProofSchema = z
  .object({
    sourceCommandId: id,
    state: z.enum(["completedSuccess", "completedInterrupted", "failed"]),
    logEpoch: id,
    seq: z.number().int().nonnegative(),
    turnId: z.string().optional(),
  })
  .strict();
export const finalOutput = z
  .object({
    text: z.string().max(GRAPH_TEXT_LIMIT),
    turnId: z.string(),
    rowId: z.number().int().nonnegative(),
    entityId: z.string().optional(),
    assistantResponseId: z.string().optional(),
  })
  .strict();
export const phase = z.enum(["planned", "creating", "created", "sending", "accepted"]);
export const nodeAttemptSchema = z
  .object({
    iterationId: id.optional(),
    iteration: z.number().int().min(0).max(5).optional(),
    nodeId: id,
    attemptId: id,
    commandId: id,
    inputId: id,
    status: z.union([runStatus, z.enum(["Pending", "Skipped"])]),
    dispatchPhase: phase,
    settings: graphSettingsSchema.extend({ source: z.enum(["workspace", "node"]) }),
    createdAt: time,
    updatedAt: time,
    sessionId: id.optional(),
    runtimeIdentity: z.string().min(1).optional(),
    foregroundExecutionId: z.string().optional(),
    observationEpoch: z.string().optional(),
    resolvedInstructions: z.string().max(GRAPH_RESOLVED_LIMIT).optional(),
    bindings: z
      .array(
        z
          .object({
            alias: z.string(),
            source: inputSourceSchema,
            text: z.string().max(GRAPH_TEXT_LIMIT),
            sourceSessionId: id.optional(),
            sourceInputId: id.optional(),
            sourceCommandId: id.optional(),
            artifactId: id.optional(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
    terminalProof: terminalProofSchema.optional(),
    finalOutput: finalOutput.optional(),
    outputIssue: z.string().optional(),
    outputValidation: z
      .object({ status: z.enum(["valid", "invalid"]), issues: z.array(z.string()) })
      .strict()
      .optional(),
    message: z.string().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const expected =
      a.status === "Completed" ||
      (a.status === "Failed" && a.outputValidation?.status === "invalid")
        ? "completedSuccess"
        : a.status === "Cancelled"
          ? "completedInterrupted"
          : a.status === "Failed" && a.dispatchPhase !== "planned"
            ? "failed"
            : undefined;
    if (
      a.updatedAt < a.createdAt ||
      a.inputId !== a.commandId ||
      (expected && (!a.sessionId || !a.runtimeIdentity || a.terminalProof?.state !== expected)) ||
      (a.terminalProof &&
        (a.terminalProof.sourceCommandId !== a.commandId || a.terminalProof.state !== expected)) ||
      (a.finalOutput &&
        (a.terminalProof?.state !== "completedSuccess" ||
          a.finalOutput.turnId !== a.terminalProof.turnId)) ||
      (["created", "sending", "accepted"].includes(a.dispatchPhase) &&
        (!a.sessionId || !a.runtimeIdentity || a.resolvedInstructions === undefined))
    )
      ctx.addIssue({
        code: "custom",
        message: "Graph node evidence or dispatch correlation is invalid.",
      });
  });
