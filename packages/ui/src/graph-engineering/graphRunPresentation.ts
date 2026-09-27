import type { GraphSequentialRun } from "@zcode/services";
import type { GraphRunEvidence } from "./graphRunSummaryTypes.js";

export function graphEvidenceLabels(evidence: GraphRunEvidence) {
  const noTests = evidence.configuredTestCount === 0;
  return {
    primary:
      noTests && evidence.state === "not-run" ? "checksNotRun" : `evidence.${evidence.state}`,
    note: noTests && evidence.state !== "no-tests" ? "evidence.no-tests" : undefined,
  };
}

export function graphEvidenceActionLabels(evidence: GraphRunEvidence) {
  return [
    ...(evidence.checks.some((check) => check.state === "failed") ? ["inspectFailure"] : []),
    ...(evidence.checks.some((check) => check.state === "invalid") ? ["inspectEvidence"] : []),
  ];
}

export function graphInspectionArtifacts(
  run: GraphSequentialRun,
  nodeId?: string,
  attemptId?: string,
) {
  const isEnd = run.definition.nodes.find((node) => node.id === nodeId)?.type === "end";
  const workspaceKey = run.target.workspaceIdentity?.trim() || run.target.workspacePath;
  // 当前迭代没有尝试时不能回退显示旧工件；历史选择与 End 结果仍只匹配确切捕获标识。
  return (run.artifacts ?? []).filter(
    (artifact) =>
      artifact.runId === run.id &&
      artifact.workspaceKey === workspaceKey &&
      ((artifact.nodeId === nodeId &&
        attemptId !== undefined &&
        artifact.attemptId === attemptId) ||
        (isEnd && artifact.id === run.resultArtifactId)),
  );
}
