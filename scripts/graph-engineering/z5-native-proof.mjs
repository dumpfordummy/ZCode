import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SOURCE_PATHS,
  BUILD_PATHS,
  fingerprint,
  testFixture,
  verifyFixtureResult,
} from "./z4-fixture.mjs";
import { assertRunnerUnchanged, GOOD_SOURCE } from "./z5-fixture.mjs";
import {
  attemptFor,
  capture,
  ledger,
  modelCount,
  nativeSessions,
  openNativeAttempt,
  readArtifact,
  readGraphRecord,
  selectAttempt,
  showGraph,
} from "./z5-native-observe.mjs";

export function assertNativeIdentity(run, inputs) {
  const agents = run.nodeAttempts.filter(
    (item) => item.sessionId && inputs.some((row) => row.session_id === item.sessionId),
  );
  assert.equal(new Set(agents.map((item) => item.sessionId)).size, agents.length);
  assert.equal(new Set(agents.map((item) => item.commandId)).size, agents.length);
  const tools = run.toolAttempts.filter((item) => item.operation?.processStarted);
  assert.equal(
    new Set([...agents, ...tools].map((item) => item.sessionId)).size,
    agents.length + tools.length,
  );
  assert.equal(new Set(tools.map((item) => item.operationId)).size, tools.length);
  for (const attempt of tools)
    assert.equal(
      inputs.some((row) => row.session_id === attempt.sessionId),
      false,
    );
  for (const attempt of agents) {
    // 原生账本 id 是队列项身份；Graph inputId 保留 sourceCommandId，按真实 session 和命令关联。
    const matching = inputs.filter((row) => row.session_id === attempt.sessionId);
    assert.equal(matching.length, 1);
    const input = matching[0];
    assert.equal(input.session_id, attempt.sessionId);
    assert.equal(attempt.inputId, attempt.commandId);
    assert.equal(input.id, input.payload.intent.queueItemId);
    assert.equal(input.payload.text, attempt.resolvedInstructions);
    assert.equal(input.payload.intent.sourceCommandId, attempt.commandId);
    const iteration = run.routing.iterations.find((item) => item.id === attempt.iterationId);
    assert.equal(iteration.attemptIds[attempt.nodeId], attempt.attemptId);
  }
  return { agents, tools };
}
export async function proveIterations(isolation, window, summary, ids, run, expectedPasses) {
  const inputs = await ledger(isolation);
  const identity = assertNativeIdentity(run, inputs);
  const sessions = nativeSessions(isolation, run);
  assert.equal(sessions.length, identity.agents.length + identity.tools.length);
  for (const session of sessions) {
    assert.equal(path.resolve(session.directory), path.resolve(run.target.workspacePath));
    assert.equal(session.parent_id, null);
  }
  assert.equal(run.routing.iterations.length, expectedPasses.length);
  assert.deepEqual(
    run.routing.iterations.map((item) => item.index),
    expectedPasses.map((_, index) => index),
  );
  const sourceDigests = run.routing.iterations.map((item) => item.sourceDigest);
  assert.equal(
    new Set(sourceDigests).size,
    summary.scenario === "no-progress" ? 1 : expectedPasses.length,
  );
  if (summary.scenario === "no-progress")
    assert.equal(
      run.routing.iterations[0].failureFingerprint,
      run.routing.iterations[1].failureFingerprint,
    );
  if (summary.scenario === "exhausted")
    assert.equal(
      new Set(run.routing.iterations.map((item) => item.failureFingerprint)).size,
      expectedPasses.length,
    );
  summary.iterationEvidence = [];
  for (const iteration of run.routing.iterations) {
    const build = attemptFor(run, iteration, ids.build),
      test = attemptFor(run, iteration, ids.test),
      reviewer = attemptFor(run, iteration, ids.reviewer);
    assert.equal(build.status, "Completed");
    assert.equal(test.operation.result.exitCode, expectedPasses[iteration.index] === 3 ? 0 : 1);
    assert.equal(test.verification.observationValid, true);
    assert.equal(test.verification.passed, expectedPasses[iteration.index]);
    assert.equal(test.verification.failed, 3 - expectedPasses[iteration.index]);
    assert.equal(test.sourceDigest, build.sourceDigest);
    assert.equal(test.buildDigest, build.outputDigest);
    const observation = await readArtifact(window, run, test, "verification");
    const report = await readArtifact(window, run, test, "results/test-report.json");
    assert.equal(report.artifact.id, observation.value.reportArtifactId);
    assert.equal(report.value.operationId, observation.value.operationId);
    assert.deepEqual(report.value.tests, observation.value.tests);
    await capture(isolation, window, summary, `z5-iteration-${iteration.index}-native-test-report`);
    assert.equal(observation.value.artifactId, observation.artifact.id);
    assert.equal(observation.value.iterationId, iteration.id);
    assert.equal(observation.value.operationId, test.operationId);
    const review = JSON.parse(reviewer.finalOutput.text);
    assert.deepEqual(review.evidenceReferences, [observation.artifact.id]);
    const decision = attemptFor(run, iteration, ids.decision);
    await selectAttempt(window, decision);
    assert.equal(
      await window.getByTestId("graph-condition-inspector").getAttribute("data-selected-exit"),
      expectedPasses[iteration.index] === 3 ? "pass" : "needs_changes",
    );
    await capture(isolation, window, summary, `z5-iteration-${iteration.index}-route`);
    await openNativeAttempt(isolation, window, summary, reviewer);
    await showGraph(window);
    if (iteration.index > 0) {
      const repair = attemptFor(run, iteration, ids.repair);
      assert.equal(
        repair.bindings.find((item) => item.source.kind === "repair-feedback").text,
        iteration.feedback.text,
      );
      const feedback = JSON.parse(iteration.feedback.text);
      assert.equal(feedback.previousIterationId, run.routing.iterations[iteration.index - 1].id);
      assert.deepEqual(
        feedback.observations.map((item) => item.artifactId),
        iteration.feedback.artifactIds,
      );
      await openNativeAttempt(isolation, window, summary, repair);
      await showGraph(window);
    }
    summary.iterationEvidence.push({
      iteration,
      buildAttemptId: build.attemptId,
      testAttemptId: test.attemptId,
      reviewerAttemptId: reviewer.attemptId,
      verification: observation,
      report,
      nativeInputCount: identity.agents.filter((item) => item.iterationId === iteration.id).length,
    });
  }
  await assertRunnerUnchanged(isolation);
  return identity;
}
export async function independentSuccess(isolation, summary) {
  assert.equal(await readFile(path.join(isolation.workspace, "MathOps.cs"), "utf8"), GOOD_SOURCE);
  const proof = {
    source: await fingerprint(isolation, SOURCE_PATHS),
    build: await fingerprint(isolation, BUILD_PATHS),
  };
  summary.independentTest = await testFixture(isolation, proof);
  await verifyFixtureResult(isolation, proof, summary.independentTest);
  await assertRunnerUnchanged(isolation);
}
export async function reopenCompleted(isolation, window, summary) {
  const before = (await readGraphRecord(isolation)).runs.at(-1),
    inputs = await ledger(isolation);
  const requests = modelCount(isolation);
  await isolation.stopApp();
  window = await isolation.launch();
  await showGraph(window);
  const after = (await readGraphRecord(isolation)).runs.at(-1);
  assert.deepEqual(after, before);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  await capture(isolation, window, summary, "z5-completed-history-reopened");
  return window;
}
