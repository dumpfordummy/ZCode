import { graphRequiredRecipeKind } from "@zcode/services";
import type {
  GraphRun,
  GraphSequentialRun,
  GraphToolAttempt,
  GraphToolNode,
} from "@zcode/services";
import type { GraphRunCheck, GraphRunEvidence } from "./graphRunSummaryTypes.js";
import { graphSummaryAttempt } from "./graphRunSelection.js";
export type { GraphRunCheck, GraphRunEvidence } from "./graphRunSummaryTypes.js";

const awaiting = new Set([
  "Pending",
  "Starting",
  "Running",
  "WaitingForPermission",
  "WaitingForUser",
]);

function boundArtifact(run: GraphSequentialRun, attempt: GraphToolAttempt, selector: string) {
  const binding = run.artifactBindings?.find(
    (item) =>
      item.nodeId === attempt.nodeId &&
      item.attemptId === attempt.attemptId &&
      item.selector === selector,
  );
  return run.artifacts?.find(
    (artifact) =>
      artifact.id === binding?.artifactId &&
      artifact.runId === run.id &&
      artifact.nodeId === attempt.nodeId &&
      artifact.attemptId === attempt.attemptId &&
      artifact.operationId === attempt.operationId &&
      artifact.workspaceKey === (run.target.workspaceIdentity?.trim() || run.target.workspacePath),
  );
}

function testIssues(run: GraphSequentialRun, attempt: GraphToolAttempt): string[] {
  const verification = attempt.verification,
    issues: string[] = [];
  if (!verification) return ["missing-verification"];
  if (verification.observationValid !== true) issues.push("unconfirmed-observation");
  if (verification.classification !== "test" || attempt.recipe.verifier.kind !== "test")
    issues.push("mismatched-check-kind");
  if (!verification.processKnown || !verification.reportFresh || !verification.reportParsed)
    issues.push("incomplete-observation");
  if (!verification.testCount || !((verification.passed ?? 0) + (verification.failed ?? 0)))
    issues.push("no-executed-tests");
  if (verification.outcome === "pass") {
    if (
      attempt.status !== "Completed" ||
      !verification.acceptancePassed ||
      !verification.exitSuccessful ||
      !verification.passed ||
      verification.failed ||
      verification.issues.length
    )
      issues.push("failed-pass-criteria");
  } else if (verification.outcome !== "fail" || attempt.status !== "Failed" || !verification.failed)
    issues.push("missing-definitive-outcome");
  const artifact = boundArtifact(run, attempt, "verification");
  if (
    !artifact ||
    artifact.type !== "json" ||
    artifact.provenance !== "native-test" ||
    artifact.validation !== "valid" ||
    artifact.redacted ||
    artifact.sourceBaseline !== attempt.sourceDigest
  )
    issues.push("missing-valid-verification-artifact");
  if (
    attempt.recipe.verifier.kind === "test" &&
    attempt.recipe.verifier.format === "dotnet-vstest-trx-v1"
  ) {
    const receipt = boundArtifact(run, attempt, "normalization"),
      normalized = boundArtifact(run, attempt, "normalized-report");
    if (
      !attempt.normalizationReceiptId ||
      receipt?.id !== attempt.normalizationReceiptId ||
      [receipt, normalized].some(
        (item) =>
          !item ||
          item.type !== "json" ||
          item.provenance !== "native-test" ||
          item.validation !== "valid" ||
          item.redacted ||
          item.sourceBaseline !== attempt.sourceDigest,
      )
    )
      issues.push("missing-normalization-metadata");
  }
  return issues;
}

function checkProjection(
  run: GraphSequentialRun,
  node: GraphToolNode,
  attempt: GraphToolAttempt | undefined,
): GraphRunCheck {
  const required = graphRequiredRecipeKind(run.definition, node.id);
  const frozenKind =
    attempt?.recipe.verifier.kind ??
    run.toolAttempts?.find((item) => item.nodeId === node.id)?.recipe.verifier.kind;
  const hadFrozenTest = run.toolAttempts?.some(
    (item) => item.nodeId === node.id && item.recipe.verifier.kind === "test",
  );
  // 未执行/跳过的当前尝试仍属已配置 Test；历史配方只确定角色，不提供当前结果。
  const kind =
    required === "test" || hadFrozenTest
      ? "test"
      : required === "build"
        ? "build"
        : (frozenKind ?? "command");
  const result: GraphRunCheck = {
    nodeId: node.id,
    name: node.name,
    kind,
    state: "invalid",
    artifactIds: [],
    issues: [],
    ...(attempt
      ? {
          attemptId: attempt.attemptId,
          status: attempt.status,
          verification: attempt.verification ? structuredClone(attempt.verification) : undefined,
        }
      : {}),
  };
  if (!attempt) {
    result.issues.push("missing-current-attempt");
    return result;
  }
  result.artifactIds = (run.artifacts ?? [])
    .filter(
      (item) =>
        item.runId === run.id && item.nodeId === node.id && item.attemptId === attempt.attemptId,
    )
    .map((item) => item.id);
  if (awaiting.has(attempt.status) && !attempt.verification) {
    result.state = "not-run";
    return result;
  }
  if (kind !== "test") {
    if (attempt.operation?.processStarted && attempt.operation.result?.processExitObserved)
      result.state = "command-result";
    else result.issues.push("unconfirmed-command-result");
    return result;
  }
  result.issues.push(...testIssues(run, attempt));
  if (!result.issues.length)
    result.state = attempt.verification!.outcome === "pass" ? "passed" : "failed";
  return result;
}

/** Explicit history inspection uses the retained attempt, never the current iteration's evidence. */
export function graphRunCheck(run: GraphSequentialRun, selected: GraphToolAttempt): GraphRunCheck {
  const node = run.definition.nodes.find((item) => item.id === selected.nodeId);
  if (node?.type !== "tool")
    return {
      nodeId: selected.nodeId,
      name: selected.nodeId,
      kind: "command",
      state: "invalid",
      artifactIds: [],
      issues: ["missing-check-node"],
    };
  const attempt = run.toolAttempts?.find(
    (item) => item.nodeId === selected.nodeId && item.attemptId === selected.attemptId,
  );
  return checkProjection(run, node, attempt);
}

/** Captured-at-time projection only. Retained file availability and today's source need separate reads. */
export function graphRunEvidence(run: GraphRun): GraphRunEvidence {
  if (run.version === undefined)
    return { state: "no-tests", configuredTestCount: 0, checks: [], issues: [] };
  const checks = run.definition.nodes
    .filter((node): node is GraphToolNode => node.type === "tool")
    .map((node) => checkProjection(run, node, graphSummaryAttempt(run, node.id, run.toolAttempts)));
  const tests = checks.filter((check) => check.kind === "test");
  let state: GraphRunEvidence["state"];
  if (tests.length) {
    state = tests.some((check) => check.state === "invalid")
      ? "invalid"
      : tests.some((check) => check.state === "not-run")
        ? "not-run"
        : tests.some((check) => check.state === "failed")
          ? "tests-failed"
          : tests.every((check) => check.state === "passed")
            ? "tests-passed"
            : "invalid";
  } else if (checks.some((check) => check.state === "command-result")) state = "command-only";
  else if (
    run.result?.text ||
    run.definition.nodes.some(
      (node) =>
        node.type === "task" &&
        graphSummaryAttempt(run, node.id, run.nodeAttempts)?.finalOutput?.text,
    )
  )
    state = "agent-reported";
  else state = checks.some((check) => check.state === "not-run") ? "not-run" : "no-tests";
  return {
    state,
    configuredTestCount: tests.length,
    checks,
    issues: [...new Set(checks.flatMap((check) => check.issues))],
  };
}
