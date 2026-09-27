import { z } from "zod";
import type {
  GraphSequentialRun,
  GraphToolAttempt,
  GraphTrxNormalizationReceipt,
} from "../contract.js";
import { dotnetTestTargetSchema } from "./artifact-schemas.js";
import { graphCanonical } from "./canonical.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  id = z.string().min(1).max(200);
const reference = z.object({ artifactId: id, digest }).strict();
export const trxReceiptSchema = z
  .object({
    version: z.literal(1),
    parserVersion: z.literal("dotnet-vstest-trx-v1"),
    reportId: z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/),
    operationId: id,
    sourceDigest: digest,
    buildDigest: digest,
    scope: dotnetTestTargetSchema,
    original: z
      .object({
        digest,
        bytes: z.number().int().min(1).max(262144),
        modifiedAt: z.number().finite().nonnegative(),
      })
      .strict(),
    preview: reference,
    normalized: reference,
  })
  .strict();
export function trxAttemptRecordErrors(
  run: GraphSequentialRun,
  attempt: GraphToolAttempt,
): string[] {
  const verifier = attempt.recipe.verifier;
  const trx = verifier.kind === "test" && verifier.format === "dotnet-vstest-trx-v1";
  if (!trx)
    return attempt.resolvedReportPath || attempt.normalizationReceiptId
      ? ["TRX receipt fields require an explicit TRX Test profile."]
      : [];
  const issues: string[] = [];
  if (
    attempt.resolvedReportPath !== undefined &&
    attempt.resolvedReportPath !==
      verifier.reportPath.replaceAll("{operationId}", attempt.operationId)
  )
    issues.push("TRX report path differs from its exact native operation.");
  if (
    attempt.status === "Completed" ||
    attempt.verification?.observationValid ||
    attempt.normalizationReceiptId
  ) {
    const receipt = run.artifacts?.find(
      (artifact) => artifact.id === attempt.normalizationReceiptId,
    );
    if (
      !receipt ||
      receipt.type !== "json" ||
      receipt.provenance !== "native-test" ||
      receipt.validation !== "valid" ||
      receipt.redacted ||
      receipt.operationId !== attempt.operationId ||
      receipt.attemptId !== attempt.attemptId ||
      receipt.sourceBaseline !== attempt.sourceDigest ||
      !run.artifactBindings?.some(
        (binding) =>
          binding.artifactId === receipt.id &&
          binding.attemptId === attempt.attemptId &&
          binding.selector === "normalization",
      )
    )
      issues.push(
        "Trusted TRX assertions require the exact complete immutable normalization receipt.",
      );
    if (!attempt.resolvedReportPath || attempt.beforeReportDigest)
      issues.push("Trusted TRX report must be newly produced at its unique invocation path.");
  }
  return issues;
}
export function validateTrxReceipt(
  value: unknown,
  run: GraphSequentialRun,
  attempt: GraphToolAttempt,
): GraphTrxNormalizationReceipt {
  const receipt = trxReceiptSchema.parse(value),
    verifier = attempt.recipe.verifier;
  if (
    verifier.kind !== "test" ||
    verifier.format !== "dotnet-vstest-trx-v1" ||
    receipt.operationId !== attempt.operationId ||
    receipt.sourceDigest !== attempt.sourceDigest ||
    receipt.buildDigest !== attempt.buildDigest ||
    graphCanonical(receipt.scope) !== graphCanonical(verifier.target) ||
    receipt.original.modifiedAt < (attempt.operation?.startedAt ?? Infinity) ||
    Math.floor(receipt.original.modifiedAt) > (attempt.operation?.completedAt ?? -1)
  )
    throw new Error("TRX normalization receipt does not match the exact frozen invocation.");
  for (const [key, selector] of [
    ["preview", verifier.reportPath],
    ["normalized", "normalized-report"],
  ] as const) {
    const ref = receipt[key],
      artifact = run.artifacts?.find((item) => item.id === ref.artifactId);
    if (
      !artifact ||
      artifact.digest !== ref.digest ||
      artifact.attemptId !== attempt.attemptId ||
      artifact.operationId !== attempt.operationId ||
      artifact.sourceBaseline !== attempt.sourceDigest ||
      !run.artifactBindings?.some(
        (binding) =>
          binding.artifactId === artifact.id &&
          binding.attemptId === attempt.attemptId &&
          binding.selector === selector,
      )
    )
      throw new Error("TRX normalization receipt lost a correlated immutable artifact.");
    if (
      key === "preview" &&
      (artifact.type !== "file" ||
        artifact.provenance !== "workspace-file" ||
        artifact.sourcePath !== attempt.resolvedReportPath)
    )
      throw new Error("TRX original preview scope is inconsistent.");
    if (
      key === "normalized" &&
      (artifact.type !== "json" ||
        artifact.provenance !== "native-test" ||
        artifact.validation !== "valid" ||
        artifact.redacted)
    )
      throw new Error("TRX normalized assertions are incomplete.");
  }
  return receipt;
}
