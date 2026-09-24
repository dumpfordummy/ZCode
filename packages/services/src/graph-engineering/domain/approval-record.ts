import { z } from "zod";
import type { GraphSequentialRun } from "../contract.js";

const id = z.string().min(1).max(200);
const time = z.number().finite().nonnegative();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repair-feedback") }).strict(),
  z.object({ kind: z.literal("start") }).strict(),
  z.object({ kind: z.literal("node"), nodeId: id }).strict(),
  z.object({ kind: z.literal("source") }).strict(),
  z
    .object({
      kind: z.literal("artifact"),
      nodeId: id,
      selector: z.string().min(1).max(500),
      pointer: z.string().max(1024).optional(),
    })
    .strict(),
]);
const snapshot = z
  .object({
    baseline: z.string(),
    scope: z.string(),
    complete: z.boolean(),
    issues: z.array(z.string()),
    files: z.array(
      z
        .object({
          path: z.string(),
          status: z.string(),
          beforeText: z.string().optional(),
          afterText: z.string().optional(),
          diff: z.string().optional(),
          issue: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
const evidence = z
  .object({
    alias: z.string().max(64),
    source,
    digest,
    text: z.string().max(100_000).optional(),
    snapshot: snapshot.optional(),
    sourceSessionId: id.optional(),
    sourceInputId: id.optional(),
    sourceCommandId: id.optional(),
    artifactId: id.optional(),
    issue: z.string().optional(),
  })
  .strict();
export const approvalAttemptSchema = z
  .object({
    iterationId: id.optional(),
    iteration: z.number().int().min(0).max(5).optional(),
    nodeId: id,
    attemptId: id,
    status: z.enum([
      "Pending",
      "WaitingForApproval",
      "Approved",
      "Rejected",
      "StaleEvidence",
      "Skipped",
    ]),
    createdAt: time,
    updatedAt: time,
    resumeRequired: z.boolean().optional(),
    message: z.string().optional(),
    request: z
      .object({
        id,
        version: z.number().int().positive(),
        runId: id,
        nodeId: id,
        attemptId: id,
        target: z
          .object({
            workspacePath: z.string().min(1),
            workspaceIdentity: z.string().optional(),
            remoteSessionId: z.string().optional(),
          })
          .strict(),
        graphDigest: digest,
        digest,
        title: z.string(),
        reviewText: z.string().max(100_000),
        commentPolicy: z.enum(["optional", "required"]),
        successorNodeId: id.nullable(),
        evidence: z.array(evidence).min(1).max(16),
        complete: z.boolean(),
        issues: z.array(z.string()),
        createdAt: time,
      })
      .strict()
      .optional(),
    decision: z
      .object({
        id,
        requestId: id,
        requestVersion: z.number().int().positive(),
        requestDigest: digest,
        value: z.enum(["approve", "reject"]),
        comment: z.string().max(2_000),
        decidedAt: time,
        actor: z.object({ kind: z.literal("local-user"), hostSessionId: id }).strict(),
      })
      .strict()
      .optional(),
    successorIntent: z.object({ id, successorNodeId: id.nullable() }).strict().optional(),
  })
  .strict();

export function approvalRecordErrors(run: GraphSequentialRun): string[] {
  const errors: string[] = [];
  const gates = run.approvalAttempts ?? [];
  const definitions = run.definition.nodes.filter((n) => n.type === "approval");
  if (
    run.version !== run.definition.version ||
    (run.version === 2 && gates.length) ||
    (run.version !== 5 &&
      (definitions.length !== gates.length ||
        new Set(gates.map((g) => g.nodeId)).size !== gates.length))
  )
    errors.push("Approval attempts do not match the frozen graph version and nodes.");
  for (const gate of gates) {
    const def = definitions.find((n) => n.id === gate.nodeId);
    const request = gate.request,
      decision = gate.decision;
    if (!def || gate.updatedAt < gate.createdAt) {
      errors.push("Invalid approval attempt.");
      continue;
    }
    if (
      request &&
      (request.runId !== run.id ||
        request.nodeId !== gate.nodeId ||
        request.attemptId !== gate.attemptId ||
        JSON.stringify(request.target) !== JSON.stringify(run.target) ||
        request.title !== def.name ||
        request.reviewText !== def.reviewInstructions ||
        request.commentPolicy !== def.commentPolicy ||
        request.successorNodeId !==
          (run.version === 5
            ? (run.definition.edges.find((e) => e.source === gate.nodeId)?.target ?? null)
            : (run.plannedPath[run.plannedPath.indexOf(gate.nodeId) + 1] ?? null)) ||
        request.evidence.length !== def.evidence.length ||
        request.evidence.some(
          (e, i) =>
            e.alias !== def.evidence[i]!.alias ||
            JSON.stringify(e.source) !== JSON.stringify(def.evidence[i]!.source),
        ) ||
        request.complete !==
          (request.issues.length === 0 &&
            request.evidence.every((e) => !e.issue && (!e.snapshot || e.snapshot.complete))))
    )
      errors.push("Approval request identity or frozen evidence configuration changed.");
    if (
      ["WaitingForApproval", "Approved", "Rejected", "StaleEvidence"].includes(gate.status) &&
      !request
    )
      errors.push("An actionable approval requires its persisted request.");
    if (
      decision &&
      (!request ||
        decision.requestId !== request.id ||
        decision.requestVersion !== request.version ||
        decision.requestDigest !== request.digest ||
        !request.complete ||
        (request.commentPolicy === "required" && !decision.comment.trim()))
    )
      errors.push("Approval decision does not match its complete request.");
    if (
      (gate.status === "Approved" && decision?.value !== "approve") ||
      (gate.status === "Rejected" && decision?.value !== "reject") ||
      (decision?.value === "approve" &&
        (!gate.successorIntent ||
          gate.successorIntent.successorNodeId !== request?.successorNodeId)) ||
      (gate.successorIntent && decision?.value !== "approve")
    )
      errors.push("Approval decision and successor intent disagree.");
  }
  if (run.status === "Rejected" && !gates.some((g) => g.status === "Rejected"))
    errors.push("Rejected run requires a rejected gate.");
  return errors;
}
