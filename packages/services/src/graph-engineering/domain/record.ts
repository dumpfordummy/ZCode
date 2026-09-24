import {
  runStatus,
  terminalProofSchema,
  finalOutput,
  phase,
  nodeAttemptSchema,
} from "./native-record.js";
export { terminalProofSchema } from "./native-record.js";
import { z } from "zod";
import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import { recordIntegrityErrors } from "./record-integrity.js";
import { approvalAttemptSchema, approvalRecordErrors } from "./approval-record.js";
import { toolAttemptSchema, toolRecordErrors } from "./tool-records.js";
import { graphArtifactSchema } from "./artifact-schemas.js";
import { routingStateSchema } from "./routing-record-schema.js";
import { runProvenanceSchema } from "./workflow-provenance-schema.js";
import { routingRecordErrors } from "./routing-record.js";
import {
  definitionSchema,
  legacyDefinitionSchema,
  targetSchema,
  workspaceKey,
} from "./definition.js";
import { parallelRecordSchema } from "./parallel-schema.js";
import {
  GRAPH_TEXT_LIMIT,
  graphSettingsSchema,
  sequentialDefinitionSchema,
  sequentialReadiness,
} from "./sequential.js";

const id = z.string().min(1).max(200);
const time = z.number().finite().nonnegative();
const inactivityProof = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("tool-terminal"),
      // Tool 与 Agent 使用同一原生 opaque runtime identity，长工作目录不能被实体 ID 上限截断。
      runtimeIdentity: z.string().min(1),
      sessionId: id,
      operationId: id,
      completedAt: time,
      status: z.enum(["completed", "failed", "cancelled"]),
    })
    .strict(),
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
    if (["NeedsHuman", "BudgetExhausted", "NoProgress"].includes(run.status))
      ctx.addIssue({ code: "custom", message: "Routing stops require version 5." });
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
const sequentialRunSchema = z
  .object({
    ...lifecycle,
    version: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    routing: routingStateSchema.optional(),
    provenance: runProvenanceSchema.optional(),
    requestFingerprint: z.string().min(1),
    definition: sequentialDefinitionSchema,
    defaults: graphSettingsSchema,
    plannedPath: z.array(id).min(1).max(32),
    startInput: z.string().max(GRAPH_TEXT_LIMIT),
    nodeAttempts: z.array(nodeAttemptSchema).max(48),
    approvalAttempts: z.array(approvalAttemptSchema).max(48).optional(),
    toolAttempts: z.array(toolAttemptSchema).max(48).optional(),
    artifacts: z.array(graphArtifactSchema).max(2048).optional(),
    artifactBindings: z
      .array(
        z
          .object({
            nodeId: id,
            attemptId: id,
            selector: z.string().min(1).max(1024),
            artifactId: id,
          })
          .strict(),
      )
      .max(2048)
      .optional(),
    cancelRequestedAt: time.optional(),
    result: finalOutput.optional(),
    resultArtifactId: id.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    const readiness = sequentialReadiness(run.definition);
    for (const message of approvalRecordErrors(run)) ctx.addIssue({ code: "custom", message });
    for (const message of toolRecordErrors(run)) ctx.addIssue({ code: "custom", message });
    if (run.version === 5) {
      if (
        Boolean(run.definition.template) !== Boolean(run.provenance) ||
        (run.provenance &&
          JSON.stringify(run.provenance.template) !== JSON.stringify(run.definition.template))
      )
        ctx.addIssue({
          code: "custom",
          message: "Template run must preserve its exact frozen provenance.",
        });
      for (const message of routingRecordErrors(run)) ctx.addIssue({ code: "custom", message });
      return;
    }
    if (
      run.routing ||
      run.plannedPath.length > 24 ||
      run.nodeAttempts.length > 8 ||
      (run.approvalAttempts?.length ?? 0) > 8 ||
      (run.toolAttempts?.length ?? 0) > 8 ||
      (run.artifacts?.length ?? 0) > 320 ||
      (run.artifactBindings?.length ?? 0) > 320 ||
      [...run.nodeAttempts, ...(run.toolAttempts ?? []), ...(run.approvalAttempts ?? [])].some(
        (a) => a.iterationId !== undefined || a.iteration !== undefined,
      ) ||
      run.toolAttempts?.some(
        (a) =>
          a.verification?.observationValid !== undefined ||
          a.verification?.outcome !== undefined ||
          a.verification?.tests !== undefined,
      ) ||
      ["NeedsHuman", "BudgetExhausted", "NoProgress"].includes(run.status)
    )
      ctx.addIssue({
        code: "custom",
        message: "Version-5 attempt/routing state cannot appear in historical versions.",
      });
    if (
      readiness.errors.length ||
      JSON.stringify(run.plannedPath) !== JSON.stringify(readiness.path) ||
      JSON.stringify(run.nodeAttempts.map((a) => a.nodeId)) !==
        JSON.stringify(
          run.plannedPath.filter(
            (id) => run.definition.nodes.find((n) => n.id === id)?.type === "task",
          ),
        ) ||
      run.updatedAt < run.createdAt ||
      run.startInput !== run.definition.nodes.find((n) => n.type === "start")?.request
    )
      ctx.addIssue({ code: "custom", message: "Frozen graph plan is inconsistent." });
    let incomplete = false;
    let blockedPredecessor = false;
    for (const id of run.plannedPath) {
      const tool = run.toolAttempts?.find((a) => a.nodeId === id);
      if (tool) {
        if (
          incomplete &&
          tool.dispatchPhase !== "planned" &&
          (blockedPredecessor || !["creating", "created"].includes(tool.dispatchPhase))
        )
          ctx.addIssue({
            code: "custom",
            message: "A Tool was dispatched before predecessor completion.",
          });
        if (tool.status !== "Completed") {
          incomplete = true;
          blockedPredecessor = true;
        }
        continue;
      }
      const a = run.nodeAttempts.find((a) => a.nodeId === id);
      if (!a) {
        const gate = run.approvalAttempts?.find((g) => g.nodeId === id);
        if (gate?.status !== "Approved") {
          incomplete = true;
          if (!(gate?.status === "StaleEvidence" && gate.decision?.value === "approve"))
            blockedPredecessor = true;
        }
        continue;
      }
      if (
        incomplete &&
        a.dispatchPhase !== "planned" &&
        (blockedPredecessor || !["creating", "created"].includes(a.dispatchPhase))
      )
        ctx.addIssue({
          code: "custom",
          message: "A successor was admitted before predecessor completion.",
        });
      if (a.status !== "Completed") {
        incomplete = true;
        blockedPredecessor = true;
      }
    }
    if (run.status === "Completed") {
      const end = run.definition.nodes.find((n) => n.type === "end");
      const output = run.nodeAttempts.find((a) => a.nodeId === end?.outputNodeId)?.finalOutput;
      const toolOutput = run.toolAttempts?.find((a) => a.nodeId === end?.outputNodeId);
      const artifact = run.artifacts?.find(
        (a) =>
          a.id === run.resultArtifactId &&
          a.nodeId === toolOutput?.nodeId &&
          a.attemptId === toolOutput?.attemptId &&
          a.validation === "valid",
      );
      if (
        incomplete ||
        (toolOutput
          ? !artifact || run.result !== undefined
          : !output || JSON.stringify(output) !== JSON.stringify(run.result))
      )
        ctx.addIssue({
          code: "custom",
          message: "Completed graph requires the selected frozen End output.",
        });
    }
  });
export const recordSchema = z
  .object({
    parallel: parallelRecordSchema.optional(),
    parallelParent: z
      .object({ target: targetSchema, runId: z.string().min(1), slot: z.string().min(1) })
      .strict()
      .optional(),
    version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    workspaceKey: z.string(),
    definition: definitionSchema,
    runs: z.array(z.union([legacyRunSchema, sequentialRunSchema])),
  })
  .strict()
  .superRefine((record, ctx) => {
    for (const message of recordIntegrityErrors(record)) ctx.addIssue({ code: "custom", message });
    if (record.parallel?.runs.some((run) => workspaceKey(run.target) !== record.workspaceKey))
      ctx.addIssue({ code: "custom", message: "Parallel owner workspace mismatch." });
    if (record.parallelParent && workspaceKey(record.parallelParent.target) === record.workspaceKey)
      ctx.addIssue({ code: "custom", message: "Parallel parent cannot be its own child." });
  });
