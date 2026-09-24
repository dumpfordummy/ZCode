import assert from "node:assert/strict";
import { readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createIsolation } from "./isolation.mjs";
import { BAD_SOURCE, GOOD_SOURCE, REQUIRED_TESTS, RUNNER } from "./z4-csharp-source.mjs";
import {
  BUILD_PATHS,
  SOURCE_PATHS,
  buildFixture,
  fingerprint,
  prepareCSharpFixture,
  testFixture,
} from "./z4-fixture.mjs";
import { REPORT_PATH } from "./z4-recipes.mjs";
import { startZ4Fixture } from "./z4-provider-fixture.mjs";
import { createNativeToolGraph, createOutputGraph } from "./z4-native-editor.mjs";
import { openRunNode } from "./z2-native-helpers.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { decide, waitGate } from "./z3-native-helpers.mjs";
import { finishCompanion, restartCompleted, startCompanion } from "./z4-native-lifecycle.mjs";
import { verifyArtifactTamper } from "./z4-native-artifact-fault.mjs";
import {
  allowTool,
  capture,
  finishEvidence,
  ledger,
  modelCount,
  openToolPermission,
  readArtifactUi,
  readGraphRecord,
  selectNode,
  showGraph,
  waitReadyReceipt,
  waitStatus,
  waitTool,
  verifyManifestUi,
} from "./z4-native-helpers.mjs";

const scenario =
  process.argv.find((argument) => argument.startsWith("--scenario="))?.slice(11) ?? "build-only";
assert.ok(
  [
    "build-only",
    "complete",
    "model-pass",
    "zero",
    "missing",
    "stale",
    "wrong-source",
    "wrong-build",
    "cancel",
    "redaction",
    "json-field",
    "json-whole",
    "json-invalid",
    "json-oversized",
    "json-html",
    "tool-agent",
  ].includes(scenario),
);
const structured = scenario.startsWith("json-");
const configuredProvider = process.argv.includes("--configured-provider");
const uiFirstWait = process.argv.includes("--ui-first-wait");
const isolation = await createIsolation({
  noProvider:
    !configuredProvider &&
    !structured &&
    !["complete", "model-pass", "cancel", "tool-agent"].includes(scenario),
  fixtureFactory: (workspace) =>
    startZ4Fixture(workspace, {
      html: scenario === "json-html",
      output:
        scenario === "json-invalid"
          ? '{"outcome":"pass","outcome":"needs_changes","summary":"duplicate keys","findings":[]}'
          : scenario === "json-oversized"
            ? JSON.stringify({ outcome: "pass", summary: "x".repeat(300000), findings: [] })
            : undefined,
    }),
});
const summary = {
  scenario,
  configuredProvider,
  uiFirstWait,
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window, failure;
isolation.uiFirstWait = uiFirstWait;
console.error(`Z4 isolated profile: ${isolation.home}`);
const syntheticSecret = scenario === "redaction" ? `Z4_ONLY_SYNTHETIC_${randomUUID()}` : undefined;
if (syntheticSecret) isolation.env.Z4_FIXTURE_SECRET = syntheticSecret;
try {
  summary.fixture = await prepareCSharpFixture(isolation, {
    buggy: ["complete", "model-pass"].includes(scenario),
  });
  await writeFile(
    path.join(isolation.home, "z4-source-before.cs"),
    await readFile(path.join(isolation.workspace, "MathOps.cs")),
  );
  if (scenario === "stale") {
    const oldBuild = await buildFixture(isolation);
    summary.staleReportOrigin = await testFixture(isolation, oldBuild, {
      operationId: "actual-earlier-process",
      reportPath: REPORT_PATH,
    });
    for (const file of BUILD_PATHS) {
      const exact = await realpath(path.join(isolation.workspace, file));
      assert.ok(exact.startsWith(`${await realpath(isolation.workspace)}${path.sep}`));
      await unlink(exact);
    }
  }
  window = await isolation.launch();
  if (scenario === "cancel") await startCompanion(window, summary);
  const ids = structured
    ? await createOutputGraph(window, summary, scenario === "json-whole" ? "" : "/summary")
    : await createNativeToolGraph(window, isolation, summary, scenario);
  summary.ids = ids;
  await capture(isolation, window, summary, "z4-graph-design");
  if (await window.getByTestId("graph-run-button").isDisabled())
    throw new Error(
      await window
        .getByTestId("graph-readiness-errors")
        .textContent()
        .catch(() => "The configured native graph must be ready."),
    );
  await window.getByTestId("graph-run-button").click();
  await showGraph(window);
  if (structured) {
    const invalid = ["json-invalid", "json-oversized"].includes(scenario);
    const run = await waitStatus(window, isolation, invalid ? "Failed" : "Completed");
    assert.equal(run.version, 4);
    assert.equal(run.nodeAttempts[0].terminalProof.state, "completedSuccess");
    assert.equal((await ledger(isolation)).length, invalid ? 1 : 2);
    const structuredArtifact = run.artifacts.find((item) => item.type === "json");
    if (invalid) {
      assert.equal(run.nodeAttempts[1].sessionId, undefined);
      assert.equal(run.nodeAttempts[0].outputValidation.status, "invalid");
      assert.ok(run.artifacts.some((item) => item.validation !== "valid"));
    } else {
      assert.equal(structuredArtifact.validation, "valid");
      const expected =
        scenario === "json-whole"
          ? isolation.fixture.output
          : JSON.parse(isolation.fixture.output).summary;
      assert.equal(run.nodeAttempts[1].bindings[0].text, expected);
      assert.equal(await readArtifactUi(window, run, structuredArtifact), isolation.fixture.output);
      if (scenario === "json-html") {
        assert.equal(await window.locator("#z4-artifact-injected").count(), 0);
        assert.equal(await window.evaluate(() => window.z4Injected), undefined);
        summary.assertions.push(
          "HTML-like content remains exact text in a native artifact preview; it creates no DOM element or handler execution.",
        );
      }
      assert.equal(await openRunNode(window, ids.agent), run.nodeAttempts[0].sessionId);
      await showGraph(window);
    }
    summary.assertions.push(
      "Exact native final output is attributed to its original command; validated artifact handoffs are explicit, while invalid/capped output admits no dependent input or repair prompt.",
    );
    await selectNode(window, ids.agent);
    await capture(isolation, window, summary, "z4-structured-output-result");
  } else {
    if (scenario === "complete") {
      const pending = await waitStatus(window, isolation, "WaitingForPermission");
      assert.equal(await openRunNode(window, ids.agent), pending.nodeAttempts[0].sessionId);
      await approveNativePermissionOnce(window);
      await showGraph(window);
      await waitGate(window, isolation, ids.gates[0]);
      assert.equal(
        (await readGraphRecord(isolation)).runs.at(-1).toolAttempts[0].sessionId,
        undefined,
      );
      await capture(isolation, window, summary, "z4-code-review");
      await decide(
        window,
        "approve",
        "Reviewed the actual C# edit. Native Build/Test permission remains separate.",
      );
    }
    const buildPending = await openToolPermission(isolation, window, summary, ids.build, "build");
    const expectedAgentInputs = (ids.agent ? 1 : 0) + (summary.companionSessionId ? 1 : 0);
    assert.equal((await ledger(isolation)).length, expectedAgentInputs);
    if (!ids.agent && !summary.companionSessionId) assert.equal(modelCount(isolation), 0);
    summary.buildBeforePermission = buildPending.attempt;
    await allowTool(window);
    const built = await waitTool(isolation, ids.build, (attempt) => attempt.status === "Completed");
    assert.equal(built.attempt.operation.processStarted, true);
    assert.equal(built.attempt.operation.result.exitCode, 0);
    assert.equal(built.attempt.verification.acceptancePassed, true);
    if (scenario === "build-only") {
      await waitStatus(window, isolation, "Completed");
      assert.equal((await ledger(isolation)).length, 0);
      assert.equal(modelCount(isolation), 0);
      summary.assertions.push(
        "Tool-only Build uses an actual native permission/session/process with zero model requests or agent input admissions.",
      );
    } else {
      await openToolPermission(isolation, window, summary, ids.test, "test");
      if (scenario === "wrong-source")
        await writeFile(path.join(isolation.workspace, "MathOps.cs"), BAD_SOURCE);
      if (scenario === "wrong-build") {
        await writeFile(path.join(isolation.workspace, "MathOps.cs"), BAD_SOURCE);
        summary.replacementBuild = await buildFixture(isolation);
        await writeFile(path.join(isolation.workspace, "MathOps.cs"), GOOD_SOURCE);
      }
      await allowTool(window);
      if (scenario === "cancel") {
        summary.processReadiness = await waitReadyReceipt(isolation);
        const started = await waitTool(
          isolation,
          ids.test,
          (attempt) => attempt.operation?.processStarted,
        );
        assert.equal(summary.processReadiness.operationId, started.attempt.operationId);
        await window.getByTestId("graph-cancel").click();
        const cancelled = await waitStatus(window, isolation, "Cancelled");
        assert.equal(cancelled.toolAttempts[1].operation.result.cancelled, true);
        summary.assertions.push(
          "Actual C# process readiness precedes targeted native cancellation; no process-name termination is used.",
        );
        await finishCompanion(isolation, window, summary);
      } else {
        const shouldPass = ["complete", "redaction", "tool-agent"].includes(scenario);
        const tested = await waitTool(isolation, ids.test, (attempt) =>
          ["Completed", "Failed"].includes(attempt.status),
        );
        assert.equal(tested.attempt.operation.processStarted, true);
        assert.equal(tested.attempt.verification.acceptancePassed, shouldPass);
        if (shouldPass) {
          assert.equal(tested.attempt.verification.testCount, 3);
          assert.equal(tested.attempt.verification.passed, 3);
          if (ids.gates[1]) await waitGate(window, isolation, ids.gates[1]);
          const artifact = tested.run.artifacts.find(
            (item) => item.type === "test" && item.nodeId === ids.test,
          );
          const content = JSON.parse(await readArtifactUi(window, tested.run, artifact));
          assert.equal(content.operationId, tested.attempt.operationId);
          await capture(isolation, window, summary, "z4-positive-native-test-report");
          if (ids.gates[1]) {
            await selectNode(window, ids.gates[1]);
            await decide(
              window,
              "approve",
              "Reviewed actual native process/report and three required tests. No publication is authorized.",
            );
          }
          await waitStatus(window, isolation, "Completed");
          if (ids.consumer) {
            const consumed = (await readGraphRecord(isolation)).runs.at(-1);
            const attempt = consumed.nodeAttempts.find((item) => item.nodeId === ids.consumer);
            assert.equal(attempt.bindings[0].artifactId, artifact.id);
            assert.equal(attempt.bindings[0].text, JSON.stringify(content));
            const inputs = await ledger(isolation);
            assert.equal(inputs.length, 1);
            assert.equal(inputs[0].session_id, attempt.sessionId);
            assert.equal(inputs[0].payload.text, attempt.resolvedInstructions);
            assert.equal(inputs[0].payload.intent.sourceCommandId, attempt.commandId);
            assert.equal(attempt.terminalProof.state, "completedSuccess");
            assert.equal(await openRunNode(window, ids.consumer), attempt.sessionId);
            await showGraph(window);
            summary.assertions.push(
              "The fresh native Agent Task receives exactly the prior Tool test artifact as an explicit whole-artifact binding; its actual session/input/command and native Read are attributable without substituting a model claim for machine evidence.",
            );
          }
          assert.equal(
            await readFile(path.join(isolation.workspace, "MathOps.cs"), "utf8"),
            GOOD_SOURCE,
          );
          const proof = {
            source: await fingerprint(isolation, SOURCE_PATHS),
            build: await fingerprint(isolation, BUILD_PATHS),
          };
          summary.independentTest = await testFixture(isolation, proof);
          assert.equal(summary.independentTest.command.exitCode, 0);
          assert.deepEqual(
            summary.independentTest.report.tests,
            REQUIRED_TESTS.map((name) => ({ name, status: "passed" })),
          );
        } else {
          await waitStatus(window, isolation, "Failed");
          if (scenario === "model-pass") {
            assert.equal(JSON.parse(tested.run.nodeAttempts[0].finalOutput.text).outcome, "pass");
            assert.equal(tested.attempt.operation.result.exitCode, 1);
            assert.equal(tested.attempt.verification.failed, 3);
          }
          if (["zero", "missing", "stale", "wrong-source"].includes(scenario))
            assert.equal(tested.attempt.operation.result.exitCode, 0);
          if (scenario === "zero") assert.equal(tested.attempt.verification.testCount, 0);
          if (scenario === "stale") assert.equal(tested.attempt.verification.reportFresh, false);
        }
        summary.assertions.push(
          "Real native C# process/exit/report/acceptance remain separate: only the exact current source/build and positive required test set can pass.",
        );
      }
    }
    const run = (await readGraphRecord(isolation)).runs.at(-1);
    assert.equal((await ledger(isolation)).length, expectedAgentInputs + (ids.consumer ? 1 : 0));
    if (!ids.agent && !ids.consumer && !summary.companionSessionId)
      assert.equal(modelCount(isolation), 0);
    for (const attempt of run.toolAttempts) {
      if (!attempt.sessionId) continue;
      assert.equal(attempt.operation.operationId, attempt.operationId);
      assert.equal(attempt.operation.sessionId, attempt.sessionId);
      assert.equal(await openRunNode(window, attempt.nodeId), attempt.sessionId);
      await showGraph(window);
    }
    await selectNode(window, ids.test ?? ids.build);
    const commandArtifact = run.artifacts.find(
      (item) => item.type === "command" && item.nodeId === ids.build,
    );
    const commandContent = JSON.parse(await readArtifactUi(window, run, commandArtifact));
    assert.equal(commandContent.operationId, run.toolAttempts[0].operationId);
    assert.equal(commandContent.result.exitCode, 0);
    await verifyManifestUi(window, isolation, run, summary);
    if (syntheticSecret) {
      const testCommand = run.artifacts.find(
        (item) => item.type === "command" && item.nodeId === ids.test,
      );
      const content = await readArtifactUi(window, run, testCommand);
      assert.equal(content.includes(syntheticSecret), false);
      assert.match(content, /\[REDACTED\]/i);
      assert.equal(JSON.stringify(summary.exportedManifest).includes(syntheticSecret), false);
      assert.equal(JSON.stringify(run).includes(syntheticSecret), false);
      summary.assertions.push(
        "An actual C# process emits a freshly generated synthetic environment secret to stdout and stderr; native operation, artifact and export views redact it.",
      );
    }
    await selectNode(window, ids.test ?? ids.build);
    await window.getByTestId("graph-tool-inspector").scrollIntoViewIfNeeded();
    await capture(isolation, window, summary, "z4-native-command-result");
    if (scenario === "complete") {
      window = await restartCompleted(isolation, window, summary);
      assert.equal(
        await readArtifactUi(window, run, commandArtifact),
        JSON.stringify(commandContent),
      );
      await verifyArtifactTamper(isolation, window, summary, run, commandArtifact);
    }
  }
  assert.equal(await readFile(path.join(isolation.workspace, "Runner.cs"), "utf8"), RUNNER);
  assert.deepEqual(isolation.fixture.errors, []);
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
