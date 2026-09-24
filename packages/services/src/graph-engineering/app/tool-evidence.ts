import type { GraphSequentialRun, GraphToolAttempt, GraphToolVerification } from "../contract.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphState } from "./state.js";
import { verifyToolReport } from "../domain/tool-verification.js";
import { currentToolAttempt } from "../domain/routing.js";

/** Observes declared files; it never executes recipes or reads paths from agent output. */
export class GraphToolEvidence {
  constructor(
    private readonly state: GraphState,
    private readonly artifacts: GraphArtifacts,
  ) {}
  async prepare(run: GraphSequentialRun, attempt: GraphToolAttempt): Promise<void> {
    const recipes = this.state.options.recipes!;
    const recipe = attempt.recipe;
    const reportPath = recipe.verifier.kind === "test" ? recipe.verifier.reportPath : "";
    await recipes.validatePaths(run.target, [
      ...recipe.expectedOutputs,
      ...(reportPath ? [reportPath] : []),
    ]);
    attempt.sourceDigest = (await recipes.fingerprint(run.target, recipe.sourcePaths)).digest;
    if (recipe.verifier.kind === "build")
      attempt.outputsBefore = await recipes.observeFiles(run.target, recipe.expectedOutputs);
    if (recipe.verifier.kind === "test") {
      const buildId = recipe.verifier.buildNodeId;
      const build = currentToolAttempt(run, buildId);
      if (
        !build ||
        build.status !== "Completed" ||
        build.recipe.verifier.kind !== "build" ||
        !build.outputDigest ||
        build.sourceDigest !== attempt.sourceDigest
      )
        throw new Error("Test requires this run's successful build of the exact declared source.");
      attempt.buildDigest = (
        await recipes.fingerprint(run.target, build.recipe.expectedOutputs)
      ).digest;
      if (attempt.buildDigest !== build.outputDigest)
        throw new Error("Build outputs changed before this test invocation.");
      try {
        attempt.beforeReportDigest = (await recipes.fingerprint(run.target, [reportPath])).digest;
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") throw error;
      }
    }
    const values: Record<string, string> = {
      operationId: attempt.operationId,
      sourceDigest: attempt.sourceDigest,
      buildDigest: attempt.buildDigest ?? "",
      reportPath,
    };
    attempt.resolvedArgs = recipe.args.map((arg) =>
      arg.replace(
        /\{(operationId|sourceDigest|buildDigest|reportPath)\}/g,
        (_match, key: string) => values[key]!,
      ),
    );
  }
  async finish(run: GraphSequentialRun, attempt: GraphToolAttempt): Promise<void> {
    const operation = attempt.operation!;
    const result = operation.result;
    const recipe = attempt.recipe;
    const verification: GraphToolVerification = {
      processKnown:
        operation.processStarted && Boolean(result?.processExitObserved && operation.completedAt),
      exitSuccessful:
        operation.status === "completed" &&
        result?.status === "completed" &&
        result.exitCode === 0 &&
        result.processExitObserved === true,
      reportFresh: false,
      reportParsed: false,
      acceptancePassed: false,
      classification: recipe.verifier.kind,
      issues: [],
    };
    const issues = verification.issues;
    let observation:
      | { reportArtifactId: string; checked: ReturnType<typeof verifyToolReport> }
      | undefined;
    if (!verification.processKnown)
      issues.push("No authoritative started process and terminal result were returned.");
    if (!verification.exitSuccessful) issues.push("The native command did not exit successfully.");
    if (result?.stdout.truncated || result?.stderr.truncated)
      issues.push("Native output exceeded its cap; command evidence is incomplete.");
    const base = {
      target: run.target,
      runId: run.id,
      nodeId: attempt.nodeId,
      attemptId: attempt.attemptId,
      operationId: attempt.operationId,
      sessionId: attempt.sessionId,
      sourceBaseline: attempt.sourceDigest,
      capturedAt: this.state.options.now(),
    };
    const store = this.state.options.artifacts!;
    // 绝对 cwd 已由同一工作区/原生操作身份保留；内容使用声明的相对目录，避免隐私路径脱敏改变验证载荷。
    const command = await store.put({
      ...base,
      artifactId: this.state.options.id(),
      type: "command",
      provenance: "native-command",
      content: JSON.stringify({ ...operation, cwd: undefined, cwdRelative: recipe.cwd }),
      validation: issues.length ? "invalid" : "valid",
      ...(issues.length ? { issue: issues.join("\n") } : {}),
    });
    this.artifacts.add(run, command, "command");
    if (command.validation !== "valid")
      issues.push(command.issue ?? "Command artifact is incomplete.");
    const commandIssueCount = issues.length;
    try {
      if (
        (await this.state.options.recipes!.fingerprint(run.target, recipe.sourcePaths)).digest !==
        attempt.sourceDigest
      )
        issues.push("Declared source changed during command execution.");
      if (recipe.verifier.kind === "build") {
        const fingerprint = await this.state.options.recipes!.fingerprint(
          run.target,
          recipe.expectedOutputs,
        );
        attempt.outputDigest = fingerprint.digest;
        const after = await this.state.options.recipes!.observeFiles(
          run.target,
          recipe.expectedOutputs,
        );
        // 新鲜度与内容摘要来自不同读取时，必须核对同一组字节，不能混用文件替换前后的证据。
        if (
          fingerprint.files.length !== recipe.expectedOutputs.length ||
          after.length !== recipe.expectedOutputs.length ||
          recipe.expectedOutputs.some((path) => {
            const captured = fingerprint.files.find((file) => file.path === path);
            const observed = after.find((file) => file.path === path);
            return (
              !captured ||
              !observed?.exists ||
              captured.bytes !== observed.bytes ||
              captured.digest !== observed.digest
            );
          })
        )
          issues.push("Build output bytes changed between fingerprint and freshness observations.");
        for (const file of after) {
          const before = attempt.outputsBefore?.find((f) => f.path === file.path);
          // 零退出码不能把旧构建文件变为本次证据；每个声明产物必须在此原生调用期间新建或更新。
          if (
            !before ||
            !file.exists ||
            file.modifiedAt < (operation.startedAt ?? Infinity) ||
            (before.exists && file.modifiedAt === before.modifiedAt)
          )
            issues.push(`Build output ${file.path} was not freshly produced by this invocation.`);
        }
      }
      if (recipe.verifier.kind === "test") {
        const verifier = recipe.verifier;
        const build = currentToolAttempt(run, verifier.buildNodeId)!;
        if (
          (await this.state.options.recipes!.fingerprint(run.target, build.recipe.expectedOutputs))
            .digest !== attempt.buildDigest
        )
          issues.push("Build outputs changed during the test.");
        const report = await store.captureFile({
          ...base,
          artifactId: this.state.options.id(),
          path: verifier.reportPath,
        });
        this.artifacts.add(run, report, verifier.reportPath);
        if (report.validation !== "valid")
          throw new Error(report.issue ?? "Test report is incomplete.");
        const reportFingerprint = await this.state.options.recipes!.fingerprint(run.target, [
          verifier.reportPath,
        ]);
        const reportFile = reportFingerprint.files[0];
        const sameReport =
          reportFingerprint.files.length === 1 &&
          reportFile?.path === verifier.reportPath &&
          reportFile.bytes === report.bytes &&
          reportFile.digest === report.digest;
        if (!sameReport)
          issues.push(
            "Test report bytes changed between retained capture and freshness observation.",
          );
        verification.reportFresh =
          sameReport && reportFingerprint.digest !== attempt.beforeReportDigest;
        if (!verification.reportFresh)
          issues.push("Test report is unchanged from before this invocation.");
        const content = await this.artifacts.read(run, report.id);
        const checked = verifyToolReport(content.content, {
          ...verifier,
          operationId: attempt.operationId,
          sourceDigest: attempt.sourceDigest!,
          buildDigest: attempt.buildDigest!,
        });
        // 失败断言与基础设施不确定性分开判定；非零退出码本身不能授权修复。
        if (
          run.version === 5 &&
          checked.provenanceValid &&
          checked.outcome !== "invalid" &&
          verification.processKnown &&
          verification.reportFresh &&
          issues.length === commandIssueCount &&
          result &&
          ["completed", "failed"].includes(result.status) &&
          ["completed", "failed"].includes(operation.status) &&
          Number.isInteger(result.exitCode) &&
          !result.timedOut &&
          !result.cancelled &&
          !result.signal &&
          !result.stdout.truncated &&
          !result.stderr.truncated &&
          !command.redacted &&
          command.validation !== "incomplete" &&
          ((checked.outcome === "pass" && verification.exitSuccessful) ||
            (checked.outcome === "fail" && result.exitCode !== 0))
        )
          observation = { reportArtifactId: report.id, checked };
        verification.reportParsed = checked.reportParsed;
        Object.assign(verification, {
          testCount: checked.testCount,
          passed: checked.passed,
          failed: checked.failed,
          skipped: checked.skipped,
        });
        issues.push(...checked.issues);
        const test = await store.put({
          ...base,
          artifactId: this.state.options.id(),
          type: "test",
          provenance: "native-test",
          content: JSON.stringify({
            operationId: attempt.operationId,
            reportArtifactId: report.id,
            ...checked,
          }),
          validation: issues.length ? "invalid" : "valid",
          ...(issues.length ? { issue: issues.join("\n") } : {}),
        });
        this.artifacts.add(run, test, "test");
      }
      for (const path of recipe.expectedOutputs) {
        const output = await store.captureFile({
          ...base,
          artifactId: this.state.options.id(),
          path,
        });
        this.artifacts.add(run, output, path);
        // 二进制构建产物保留可见的不可预览记录；精确字节哈希另由构建指纹证明，不能伪装成文本。
        if (output.validation !== "valid" && recipe.verifier.kind !== "build") {
          observation = undefined;
          issues.push(output.issue ?? `Output ${path} is incomplete.`);
        }
      }
    } catch (error) {
      observation = undefined;
      issues.push(error instanceof Error ? error.message : "Native output validation failed.");
    }
    if (observation) {
      const artifactId = this.state.options.id();
      const retained = await store.put({
        ...base,
        artifactId,
        type: "json",
        provenance: "native-test",
        validation: "valid",
        content: JSON.stringify({
          artifactId,
          runId: run.id,
          nodeId: attempt.nodeId,
          attemptId: attempt.attemptId,
          iterationId: attempt.iterationId,
          operationId: attempt.operationId,
          sourceDigest: attempt.sourceDigest,
          buildDigest: attempt.buildDigest,
          reportArtifactId: observation.reportArtifactId,
          outcome: observation.checked.outcome,
          tests: observation.checked.tests,
          testCount: observation.checked.testCount,
          passed: observation.checked.passed,
          failed: observation.checked.failed,
          skipped: observation.checked.skipped,
        }),
      });
      this.artifacts.add(run, retained, "verification");
      verification.observationValid = retained.validation === "valid" && !retained.redacted;
      if (verification.observationValid) {
        verification.outcome = observation.checked.outcome === "pass" ? "pass" : "fail";
        verification.tests = observation.checked.tests;
      }
    }
    verification.acceptancePassed = issues.length === 0;
    attempt.verification = verification;
    attempt.status =
      run.cancelRequestedAt !== undefined || result?.cancelled
        ? "Cancelled"
        : verification.acceptancePassed
          ? "Completed"
          : "Failed";
    attempt.message = issues.length ? issues.join("\n") : undefined;
  }
}
