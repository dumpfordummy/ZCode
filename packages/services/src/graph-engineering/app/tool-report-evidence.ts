import type {
  GraphSequentialRun,
  GraphToolAttempt,
  GraphTrxNormalizationReceipt,
} from "../contract.js";
import type { GraphState } from "./state.js";
import type { GraphArtifacts } from "./artifacts.js";
import { toolArtifactBase } from "./tool-command-evidence.js";
import { verifyToolReport } from "../domain/tool-verification.js";
import { currentToolAttempt } from "../domain/routing.js";

/** Raw preview is never an authority source. Original bytes are parsed by the injected trusted capture. */
export async function captureToolReport(
  state: GraphState,
  artifacts: GraphArtifacts,
  run: GraphSequentialRun,
  attempt: GraphToolAttempt,
  authoritative: boolean,
) {
  const verifier = attempt.recipe.verifier;
  if (verifier.kind !== "test") throw new Error("A Test verifier is required.");
  const base = toolArtifactBase(state, run, attempt),
    store = state.options.artifacts!;
  const expected = {
    ...verifier,
    operationId: attempt.operationId,
    sourceDigest: attempt.sourceDigest!,
    buildDigest: attempt.buildDigest!,
  };
  const issues: string[] = [];
  if (verifier.format === "zcode-json-v1") {
    const report = await store.captureFile({
      ...base,
      artifactId: state.options.id(),
      path: verifier.reportPath,
    });
    artifacts.add(run, report, verifier.reportPath);
    if (report.validation !== "valid")
      throw new Error(report.issue ?? "Test report is incomplete.");
    const fingerprint = await state.options.recipes!.fingerprint(run.target, [verifier.reportPath]);
    const file = fingerprint.files[0];
    const same =
      fingerprint.files.length === 1 &&
      file?.path === verifier.reportPath &&
      file.bytes === report.bytes &&
      file.digest === report.digest;
    if (!same)
      issues.push("Test report bytes changed between retained capture and freshness observation.");
    const fresh = same && fingerprint.digest !== attempt.beforeReportDigest;
    if (!fresh) issues.push("Test report is unchanged from before this invocation.");
    const content = await artifacts.read(run, report.id);
    return { report, fresh, checked: verifyToolReport(content.content, expected), issues };
  }
  if (!state.options.reports || !attempt.resolvedReportPath)
    throw new Error("Trusted TRX capture is unavailable.");
  const operation = attempt.operation!;
  const captured = await state.options.reports.captureTrx(
    run.target,
    attempt.resolvedReportPath,
    verifier.target,
    operation.startedAt!,
    operation.completedAt!,
  );
  const preview = await store.put({
    ...base,
    artifactId: state.options.id(),
    type: "file",
    provenance: "workspace-file",
    sourcePath: attempt.resolvedReportPath,
    content: captured.content,
  });
  artifacts.add(run, preview, verifier.reportPath);
  if (!captured.report || captured.issue) throw new Error(captured.issue ?? "TRX is not complete.");
  const content = JSON.stringify({
    format: "zcode-test-v1",
    operationId: attempt.operationId,
    sourceDigest: attempt.sourceDigest,
    buildDigest: attempt.buildDigest,
    tests: captured.report.tests,
  });
  const checked = verifyToolReport(content, expected);
  const result = operation.result!;
  const build = currentToolAttempt(run, verifier.buildNodeId);
  // 解析/持久化也跨异步边界；不能把捕获前的来源摘要与捕获后的报告混为一次有效证明。
  if (
    (await state.options.recipes!.fingerprint(run.target, attempt.recipe.sourcePaths)).digest !==
    attempt.sourceDigest
  )
    issues.push("Declared source changed while capturing the genuine test report.");
  if (
    !build ||
    (await state.options.recipes!.fingerprint(run.target, build.recipe.expectedOutputs)).digest !==
      attempt.buildDigest
  )
    issues.push("Captured Build outputs changed while normalizing the genuine test report.");
  const matchesExit =
    checked.outcome === "pass"
      ? result.exitCode === 0
      : // 已验证的 VSTest 断言失败退出码为 1；Windows 崩溃码等非零退出不能授权修复。
        checked.outcome === "fail" && result.exitCode === 1;
  const valid =
    authoritative &&
    !issues.length &&
    checked.provenanceValid &&
    checked.outcome !== "invalid" &&
    matchesExit;
  const normalized = await store.put({
    ...base,
    artifactId: state.options.id(),
    type: "json",
    provenance: "native-test",
    content,
    validation: valid ? "valid" : "invalid",
    ...(!valid
      ? {
          issue:
            "Normalized observations lack complete exact native/source/build/assertion authority.",
        }
      : {}),
  });
  artifacts.add(run, normalized, "normalized-report");
  if (!valid)
    return {
      report: normalized,
      fresh: true,
      checked,
      issues: [
        ...issues,
        "TRX observations do not establish complete native/source/build evidence.",
      ],
    };
  if (normalized.validation !== "valid" || normalized.redacted)
    throw new Error(
      "Normalized test assertions were redacted or truncated and cannot establish evidence.",
    );
  const receipt: GraphTrxNormalizationReceipt = {
    version: 1,
    parserVersion: "dotnet-vstest-trx-v1",
    reportId: captured.report.reportId,
    operationId: attempt.operationId,
    sourceDigest: attempt.sourceDigest!,
    buildDigest: attempt.buildDigest!,
    scope: structuredClone(verifier.target),
    original: captured.original,
    preview: { artifactId: preview.id, digest: preview.digest },
    normalized: { artifactId: normalized.id, digest: normalized.digest },
  };
  const retained = await store.put({
    ...base,
    artifactId: state.options.id(),
    type: "json",
    provenance: "native-test",
    validation: "valid",
    content: JSON.stringify(receipt),
  });
  artifacts.add(run, retained, "normalization");
  if (retained.validation !== "valid" || retained.redacted)
    throw new Error("TRX normalization receipt is incomplete.");
  attempt.normalizationReceiptId = retained.id;
  return { report: normalized, fresh: true, checked, issues };
}
