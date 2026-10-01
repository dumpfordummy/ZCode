import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { assertNativeIdentity } from "./z5-native-proof.mjs";
import { ledger, nativeSessions, readArtifact } from "./z5-native-observe.mjs";
import { REQUEST, TEST_NAME } from "./reviewer-native-fixture.mjs";

export async function proveReviewerNative(isolation, window, summary, run, files) {
  assert.equal(run.definition.template.parameters.request, REQUEST);
  assert.ok(run.startInput.includes(REQUEST));
  assert.equal(run.definition.template.version, 2);
  const failedTest = summary.scenario === "test-failure";
  const invalid = ["prose-fence", "unbound-report"].includes(summary.scenario);
  const identity = assertNativeIdentity(run, await ledger(isolation));
  assert.equal(identity.agents.length, failedTest ? 2 : 3);
  assert.equal(identity.tools.length, 2);
  assert.equal(nativeSessions(isolation, run).length, failedTest ? 4 : 5);
  assert.equal(
    await readFile(path.join(isolation.workspace, "zz-demo.txt"), "utf8"),
    failedTest ? "still-before" : "after",
  );
  for (const name of ["build.mjs", "test.mjs"])
    assert.equal(await readFile(path.join(isolation.workspace, name), "utf8"), files[name]);
  const options = { cwd: isolation.workspace, env: isolation.env, windowsHide: true };
  assert.equal(
    (await promisify(execFile)("git", ["ls-files", "--", "zz-demo.txt"], options)).stdout.trim(),
    "",
  );
  assert.equal(
    (await promisify(execFile)("git", ["check-ignore", "zz-demo.txt"], options)).stdout.trim(),
    "zz-demo.txt",
  );
  const build = run.toolAttempts.find((item) => item.nodeId === "build");
  const test = run.toolAttempts.find((item) => item.nodeId === "test");
  assert.equal(build.status, "Completed");
  assert.equal(test.sourceDigest, build.sourceDigest);
  assert.equal(test.buildDigest, build.outputDigest);
  for (const attempt of [build, test]) {
    assert.equal(attempt.recipe.executable, "node");
    assert.equal(attempt.operation.operationId, attempt.operationId);
    assert.equal(attempt.operation.sessionId, attempt.sessionId);
    assert.equal(attempt.operation.result.processExitObserved, true);
    assert.equal(attempt.operation.result.exitCode, attempt === test && failedTest ? 1 : 0);
    assert.ok(attempt.operation.startedAt <= attempt.operation.completedAt);
  }
  assert.equal(test.verification.observationValid, true);
  assert.equal(test.verification.testCount, 1);
  assert.equal(test.verification.failed, failedTest ? 1 : 0);
  assert.equal(test.verification.acceptancePassed, !failedTest);
  const verification = await readArtifact(window, run, test, "verification");
  const report = await readArtifact(window, run, test, "results/report.json");
  assert.equal(verification.value.reportArtifactId, report.artifact.id);
  for (const field of ["operationId", "sourceDigest", "buildDigest"])
    assert.equal(report.value[field], test[field]);
  assert.deepEqual(report.value.tests, verification.value.tests);
  assert.equal(report.value.tests[0].name, TEST_NAME);
  summary.machineEvidence = { build, test, verification, report };
  const review = run.nodeAttempts.find((item) => item.nodeId === "reviewer");
  const gate = run.approvalAttempts.find((item) => item.nodeId === "final-gate");
  if (failedTest) {
    assert.equal(run.status, "NeedsHuman");
    assert.equal(test.status, "Failed");
    assert.equal(run.routing.stopReason.kind, "NeedsHuman");
    assert.ok(!review.sessionId);
    assert.ok(!gate.request);
    assert.equal(
      isolation.fixture.requests.some((item) => item.native && item.stage === "reviewer"),
      false,
    );
  } else {
    assert.ok(review.resolvedInstructions.includes(REQUEST));
    assert.deepEqual(
      review.bindings.filter((item) => item.artifactId).map((item) => item.artifactId),
      [verification.artifact.id],
    );
    assert.equal(review.outputValidation.status, invalid ? "invalid" : "valid");
    if (invalid) {
      assert.equal(run.status, "NeedsHuman");
      assert.equal(review.status, "Failed");
      assert.equal(run.routing.stopReason.kind, "NeedsHuman");
      assert.match(review.message, /output validation failed/i);
      if (summary.scenario === "unbound-report")
        assert.match(review.outputIssue, /evidenceReferences/);
      assert.ok(!gate.request);
    } else {
      const result = JSON.parse(review.finalOutput.text);
      assert.equal(result.outcome, summary.scenario);
      assert.deepEqual(result.evidenceReferences, [verification.artifact.id]);
      assert.equal(gate.status, "WaitingForApproval");
      assert.equal(run.status, "WaitingForApproval");
      assert.ok(gate.request.evidence.some((item) => item.alias === "review"));
      assert.ok(!gate.decision);
    }
  }
  assert.deepEqual(isolation.fixture.errors, []);
  // 通过全部断言之后，把「被证明了什么」压缩成可直接检查的记录（不含提示词或源码内容之外的数据）。
  summary.proof = {
    runStatus: run.status,
    sourceEdit: {
      file: "zz-demo.txt",
      content: await readFile(path.join(isolation.workspace, "zz-demo.txt"), "utf8"),
    },
    build: {
      operationId: build.operationId,
      status: build.status,
      exitCode: build.operation.result.exitCode,
      sourceDigest: build.sourceDigest,
      outputDigest: build.outputDigest,
    },
    test: {
      operationId: test.operationId,
      status: test.status,
      exitCode: test.operation.result.exitCode,
      sourceDigest: test.sourceDigest,
      buildDigest: test.buildDigest,
      testCount: test.verification.testCount,
      acceptancePassed: test.verification.acceptancePassed,
      passingAssertions: report.value.tests
        .filter((item) => item.status === "passed")
        .map((item) => item.name),
    },
    matchingEvidence: {
      testSourceEqualsBuildSource: test.sourceDigest === build.sourceDigest,
      testBuildEqualsBuildOutput: test.buildDigest === build.outputDigest,
      reportMatchesOperation: report.value.operationId === test.operationId,
      verificationArtifactId: verification.artifact.id,
      reportArtifactId: report.artifact.id,
    },
    reviewer:
      failedTest || invalid
        ? { status: review.status, outputValidation: review.outputValidation.status }
        : {
            status: review.status,
            outputValidation: review.outputValidation.status,
            outcome: JSON.parse(review.finalOutput.text).outcome,
            evidenceReferences: JSON.parse(review.finalOutput.text).evidenceReferences,
            boundArtifactIds: review.bindings
              .filter((item) => item.artifactId)
              .map((item) => item.artifactId),
          },
    finalGate: { status: gate?.status, decisionRecorded: Boolean(gate?.decision) },
    nativeAgentInputs: identity.agents.length,
    nativeToolOperations: identity.tools.length,
    modelRequests: isolation.fixture.requests.filter((item) => item.model).length,
  };
  summary.reviewer = review;
  summary.finalGate = gate;
  summary.assertions.push(
    "Built-in generic v2; genuine native Analyze/Edit/Build/Test; ignored untracked source; accepted current machine report; strict reviewer decision/validation; no automatic human approval.",
  );
}
