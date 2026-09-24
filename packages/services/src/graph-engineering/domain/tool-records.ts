import { z } from "zod";
import { graphRecipeSchema } from "./artifact-schemas.js";
import type { GraphSequentialRun } from "../contract.js";
import { workspaceKey } from "./definition.js";

const id = z.string().min(1).max(200),
  time = z.number().finite().nonnegative();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const output = z
  .object({
    text: z.string().max(262144),
    bytes: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();
export const toolOperationSchema = z
  .object({
    operationId: id,
    sessionId: id,
    requestDigest: digest.optional(),
    recipeId: id.optional(),
    cwd: z.string().min(1).optional(),
    status: z.enum([
      "awaiting_permission",
      "running",
      "completed",
      "failed",
      "cancelled",
      "unknown",
    ]),
    processStarted: z.boolean(),
    startedAt: time.optional(),
    completedAt: time.optional(),
    result: z
      .object({
        status: z.enum(["completed", "failed", "timed_out", "cancelled", "spawn_error"]),
        exitCode: z.number().int().optional(),
        signal: z.string().optional(),
        stdout: output,
        stderr: output,
        durationMs: z.number().nonnegative(),
        timedOut: z.boolean(),
        cancelled: z.boolean(),
        processExitObserved: z.boolean().optional(),
      })
      .strict()
      .optional(),
    error: z.string().optional(),
  })
  .strict();
export const toolAttemptSchema = z
  .object({
    iterationId: id.optional(),
    iteration: z.number().int().min(0).max(5).optional(),
    nodeId: id,
    attemptId: id,
    operationId: id,
    recipe: graphRecipeSchema,
    recipeDigest: digest,
    status: z.enum([
      "Pending",
      "Skipped",
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
    ]),
    dispatchPhase: z.enum(["planned", "creating", "created", "sending", "accepted"]),
    createdAt: time,
    updatedAt: time,
    sessionId: id.optional(),
    // 原生运行时身份包含真实绝对路径，不是 200 字符的实体 ID；仍按完整身份精确关联。
    runtimeIdentity: z.string().min(1).optional(),
    sourceDigest: digest.optional(),
    buildDigest: digest.optional(),
    outputDigest: digest.optional(),
    resolvedArgs: z.array(z.string()).max(64).optional(),
    beforeReportDigest: digest.optional(),
    outputsBefore: z
      .array(
        z.union([
          z.object({ path: z.string(), exists: z.literal(false) }).strict(),
          z
            .object({
              path: z.string(),
              exists: z.literal(true),
              bytes: z.number().int().nonnegative(),
              digest,
              modifiedAt: time,
            })
            .strict(),
        ]),
      )
      .max(32)
      .optional(),
    operation: toolOperationSchema.optional(),
    verification: z
      .object({
        observationValid: z.boolean().optional(),
        outcome: z.enum(["pass", "fail"]).optional(),
        tests: z
          .array(
            z
              .object({
                name: z.string().min(1).max(200),
                status: z.enum(["passed", "failed", "skipped"]),
                message: z.string().max(2000).optional(),
              })
              .strict(),
          )
          .max(1000)
          .optional(),
        processKnown: z.boolean(),
        exitSuccessful: z.boolean(),
        reportFresh: z.boolean(),
        reportParsed: z.boolean(),
        acceptancePassed: z.boolean(),
        classification: z.enum(["command", "build", "test"]),
        testCount: z.number().int().nonnegative().optional(),
        passed: z.number().int().nonnegative().optional(),
        failed: z.number().int().nonnegative().optional(),
        skipped: z.number().int().nonnegative().optional(),
        issues: z.array(z.string()),
      })
      .strict()
      .optional(),
    message: z.string().optional(),
  })
  .strict();
export function toolRecordErrors(run: GraphSequentialRun): string[] {
  const issues: string[] = [];
  const tools = run.toolAttempts ?? [],
    artifacts = run.artifacts ?? [],
    bindings = run.artifactBindings ?? [];
  if (
    run.version < 4 &&
    (tools.length ||
      artifacts.length ||
      bindings.length ||
      run.resultArtifactId ||
      run.nodeAttempts.some((a) => a.outputValidation))
  )
    issues.push("Z4 evidence requires version 4.");
  if (
    run.version !== 5 &&
    JSON.stringify(tools.map((a) => a.nodeId)) !==
      JSON.stringify(
        run.plannedPath.filter(
          (id) => run.definition.nodes.find((n) => n.id === id)?.type === "tool",
        ),
      )
  )
    issues.push("Tool attempts do not match the frozen path.");
  for (const a of tools) {
    const node = run.definition.nodes.find((n) => n.id === a.nodeId);
    if (
      node?.type !== "tool" ||
      node.recipeId !== a.recipe.id ||
      a.updatedAt < a.createdAt ||
      (["created", "sending", "accepted"].includes(a.dispatchPhase) &&
        (!a.sessionId || !a.runtimeIdentity || !a.resolvedArgs || !a.sourceDigest))
    )
      issues.push("Tool dispatch correlation is invalid.");
    if (
      a.operation &&
      (a.operation.operationId !== a.operationId ||
        a.operation.sessionId !== a.sessionId ||
        (a.operation.status !== "unknown" &&
          (a.operation.recipeId !== a.recipe.id || !a.operation.requestDigest || !a.operation.cwd)))
    )
      issues.push("Tool operation does not belong to the exact attempt.");
    if (
      a.status === "Completed" &&
      (!a.operation?.completedAt ||
        a.operation.status !== "completed" ||
        !a.operation.processStarted ||
        a.operation.result?.processExitObserved !== true ||
        a.operation.result?.exitCode !== 0 ||
        a.operation.result.status !== "completed" ||
        !a.verification?.acceptancePassed ||
        a.verification.issues.length ||
        !a.verification.processKnown ||
        !a.verification.exitSuccessful ||
        (a.recipe.verifier.kind === "test" &&
          (!a.verification.reportFresh ||
            !a.verification.reportParsed ||
            !a.verification.testCount ||
            !a.verification.passed)))
    )
      issues.push("Completed Tool requires all configured native evidence.");
    if (a.verification?.observationValid) {
      const v = a.verification,
        tests = v.tests ?? [],
        result = a.operation?.result;
      const counts = { passed: 0, failed: 0, skipped: 0 };
      for (const test of tests) counts[test.status]++;
      if (
        run.version !== 5 ||
        a.recipe.verifier.kind !== "test" ||
        v.classification !== "test" ||
        !v.processKnown ||
        !v.reportFresh ||
        !v.reportParsed ||
        !a.sourceDigest ||
        !a.buildDigest ||
        !a.operation?.processStarted ||
        a.operation.completedAt === undefined ||
        !["completed", "failed"].includes(a.operation.status) ||
        !result?.processExitObserved ||
        !["completed", "failed"].includes(result.status) ||
        result.exitCode === undefined ||
        result.timedOut ||
        result.cancelled ||
        result.signal ||
        result.stdout.truncated ||
        result.stderr.truncated ||
        !tests.length ||
        new Set(tests.map((t) => t.name)).size !== tests.length ||
        v.testCount !== tests.length ||
        v.passed !== counts.passed ||
        v.failed !== counts.failed ||
        v.skipped !== counts.skipped ||
        (v.outcome === "fail"
          ? !counts.failed
          : v.outcome !== "pass" || counts.failed > 0 || !v.acceptancePassed)
      )
        issues.push(
          "Valid verification observations require definitive exact native Test evidence.",
        );
      if (
        a.recipe.verifier.kind === "test" &&
        (tests.length < a.recipe.verifier.minimumTests ||
          (a.recipe.verifier.expectedTests !== undefined &&
            tests.length !== a.recipe.verifier.expectedTests) ||
          (!counts.passed && !counts.failed) ||
          a.recipe.verifier.requiredTests.some(
            (name) => !tests.some((t) => t.name === name && t.status !== "skipped"),
          ))
      )
        issues.push("Verification observation test identities/counts are incomplete.");
      const ref = bindings.find(
        (b) => b.attemptId === a.attemptId && b.selector === "verification",
      );
      if (
        !ref ||
        !artifacts.some(
          (artifact) =>
            artifact.id === ref.artifactId &&
            artifact.attemptId === a.attemptId &&
            artifact.operationId === a.operationId &&
            artifact.type === "json" &&
            artifact.provenance === "native-test" &&
            artifact.validation === "valid" &&
            artifact.sourceBaseline === a.sourceDigest,
        )
      )
        issues.push("Verification observation requires its exact immutable native Test artifact.");
    }
  }
  const seen = new Set<string>();
  for (const artifact of artifacts) {
    const attempt = [...run.nodeAttempts, ...tools].find(
      (a) => a.nodeId === artifact.nodeId && a.attemptId === artifact.attemptId,
    );
    if (
      !attempt ||
      seen.has(artifact.id) ||
      artifact.runId !== run.id ||
      artifact.workspaceKey !== workspaceKey(run.target) ||
      (artifact.operationId &&
        (!("operationId" in attempt) || attempt.operationId !== artifact.operationId)) ||
      (artifact.inputId && (!("inputId" in attempt) || attempt.inputId !== artifact.inputId)) ||
      (artifact.commandId &&
        (!("commandId" in attempt) || attempt.commandId !== artifact.commandId)) ||
      (artifact.sessionId && artifact.sessionId !== attempt.sessionId)
    )
      issues.push("Artifact ownership/correlation is invalid.");
    seen.add(artifact.id);
  }
  const selectors = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.attemptId}:${binding.selector}`;
    if (
      selectors.has(key) ||
      !artifacts.some(
        (a) =>
          a.id === binding.artifactId &&
          a.nodeId === binding.nodeId &&
          a.attemptId === binding.attemptId,
      )
    )
      issues.push("Artifact selector correlation is invalid.");
    selectors.add(key);
  }
  return issues;
}
