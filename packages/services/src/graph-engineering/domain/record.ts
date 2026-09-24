import { z } from "zod";
import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { releaseAuditErrors } from "./release-validation.js";
import {
  definitionSchema,
  legacyDefinitionSchema,
  targetSchema,
  validateDefinition,
  workspaceKey,
} from "./definition.js";
import {
  GRAPH_RESOLVED_LIMIT,
  GRAPH_TEXT_LIMIT,
  graphSettingsSchema,
  inputSourceSchema,
  sequentialDefinitionSchema,
  sequentialReadiness,
} from "./sequential.js";

const id = z.string().min(1).max(200);
const time = z.number().finite().nonnegative();
const runStatus = z.enum([
  "Starting",
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
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
const finalOutput = z
  .object({
    text: z.string().max(GRAPH_TEXT_LIMIT),
    turnId: z.string(),
    rowId: z.number().int().nonnegative(),
    entityId: z.string().optional(),
    assistantResponseId: z.string().optional(),
  })
  .strict();
const phase = z.enum(["planned", "creating", "created", "sending", "accepted"]);
const inactivityProof = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("input-terminal"),
      runtimeIdentity: z.string().min(1),
      sessionId: id,
      inputId: id,
      commandId: id,
      terminalProof: terminalProofSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("runtime-retired"),
      runtimeIdentity: z.string().min(1),
      workspaceKey: z.string().min(1),
      retiredAt: time,
    })
    .strict(),
  z.object({ kind: z.literal("never-submitted"), commandId: id, dispatchPhase: phase }).strict(),
]);
const inspection = z
  .object({
    inspectedAt: time,
    state: z.enum(["inactive", "active", "unknown"]),
    reason: z.string(),
    attempts: z.array(
      z
        .object({
          attemptId: id,
          state: z.enum(["inactive", "active", "unknown"]),
          reason: z.string(),
          proof: inactivityProof.optional(),
          foregroundExecutionId: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
const release = z
  .object({ releasedAt: time, reason: z.string().trim().min(1).max(2_000), inspection })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.inspection.state !== "inactive" ||
      !value.inspection.attempts.length ||
      value.inspection.attempts.some((a) => a.state !== "inactive" || !a.proof)
    )
      ctx.addIssue({
        code: "custom",
        message: "Graph release requires inactivity evidence for every attempt.",
      });
  });
const lifecycle = {
  id,
  requestId: id,
  target: targetSchema,
  status: runStatus,
  createdAt: time,
  updatedAt: time,
  message: z.string().optional(),
  recovery: inspection.optional(),
  release: release.optional(),
};
const legacyRunSchema = z
  .object({
    ...lifecycle,
    version: z.undefined().optional(),
    attemptId: id,
    definition: legacyDefinitionSchema,
    modelSelection: modelSelectionSchema,
    mode: submissionModeSchema,
    planEnabled: z.boolean().optional(),
    commandId: id,
    inputId: id,
    sessionId: id.optional(),
    runtimeIdentity: z.string().min(1).optional(),
    foregroundExecutionId: z.string().optional(),
    terminalProof: terminalProofSchema.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    const expected =
      run.status === "Completed"
        ? "completedSuccess"
        : run.status === "Cancelled"
          ? "completedInterrupted"
          : run.status === "Failed"
            ? "failed"
            : undefined;
    if (
      run.updatedAt < run.createdAt ||
      run.inputId !== run.commandId ||
      (expected &&
        (!run.sessionId || !run.runtimeIdentity || run.terminalProof?.state !== expected)) ||
      (run.terminalProof && (!expected || run.terminalProof.sourceCommandId !== run.commandId))
    )
      ctx.addIssue({
        code: "custom",
        message: "Graph attempt terminal proof or correlation is invalid.",
      });
  });
const nodeAttemptSchema = z
  .object({
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
          })
          .strict(),
      )
      .max(16)
      .optional(),
    terminalProof: terminalProofSchema.optional(),
    finalOutput: finalOutput.optional(),
    outputIssue: z.string().optional(),
    message: z.string().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const expected =
      a.status === "Completed"
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
const sequentialRunSchema = z
  .object({
    ...lifecycle,
    version: z.literal(2),
    requestFingerprint: z.string().min(1),
    definition: sequentialDefinitionSchema,
    defaults: graphSettingsSchema,
    plannedPath: z.array(id).min(1).max(8),
    startInput: z.string().max(GRAPH_TEXT_LIMIT),
    nodeAttempts: z.array(nodeAttemptSchema).min(1).max(8),
    cancelRequestedAt: time.optional(),
    result: finalOutput.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    const readiness = sequentialReadiness(run.definition);
    if (
      readiness.errors.length ||
      JSON.stringify(run.plannedPath) !== JSON.stringify(readiness.path) ||
      JSON.stringify(run.nodeAttempts.map((a) => a.nodeId)) !== JSON.stringify(run.plannedPath) ||
      run.updatedAt < run.createdAt ||
      run.startInput !== run.definition.nodes.find((n) => n.type === "start")?.request
    )
      ctx.addIssue({ code: "custom", message: "Frozen graph plan is inconsistent." });
    let incomplete = false;
    for (const a of run.nodeAttempts) {
      if (incomplete && a.dispatchPhase !== "planned")
        ctx.addIssue({
          code: "custom",
          message: "A successor was admitted before predecessor completion.",
        });
      if (a.status !== "Completed") incomplete = true;
    }
    if (run.status === "Completed") {
      const end = run.definition.nodes.find((n) => n.type === "end");
      const output = run.nodeAttempts.find((a) => a.nodeId === end?.outputNodeId)?.finalOutput;
      if (incomplete || !output || JSON.stringify(output) !== JSON.stringify(run.result))
        ctx.addIssue({
          code: "custom",
          message: "Completed graph requires the selected frozen End output.",
        });
    }
  });
export const recordSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    workspaceKey: z.string(),
    definition: definitionSchema,
    runs: z.array(z.union([legacyRunSchema, sequentialRunSchema])),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (
      record.version === 1 &&
      (record.definition.version === 2 || record.runs.some((r) => r.version === 2))
    )
      ctx.addIssue({ code: "custom", message: "Version-2 data requires a version-2 envelope." });
    const unique = (ids: string[], label: string) => {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: "custom", message: `Duplicate graph ${label}.` });
    };
    unique(
      record.runs.map((r) => r.id),
      "id",
    );
    unique(
      record.runs.map((r) => r.requestId),
      "requestId",
    );
    const attempts = record.runs.flatMap<{
      attemptId: string;
      commandId: string;
      sessionId?: string;
    }>((r) => (r.version === 2 ? r.nodeAttempts : [r]));
    for (const key of ["attemptId", "commandId", "sessionId"] as const)
      unique(
        attempts.flatMap((a) => (a[key] ? [a[key]!] : [])),
        key,
      );
    for (const run of record.runs) {
      for (const message of releaseAuditErrors(run)) ctx.addIssue({ code: "custom", message });
      if (
        workspaceKey(run.target) !== record.workspaceKey ||
        run.definition.revision > record.definition.revision
      )
        ctx.addIssue({
          code: "custom",
          message: "Graph attempt workspace or revision is invalid.",
        });
      try {
        validateDefinition(run.definition);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid historical definition." });
      }
    }
  });
