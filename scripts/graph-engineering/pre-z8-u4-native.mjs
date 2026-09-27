import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { AFTER_SOURCE, prepareSourceFixture } from "./z3-fixture.mjs";
import { nativeSessions } from "./z5-native-observe.mjs";
import { prepareU3Fixture, U3_REQUEST, u3Sha256 } from "./pre-z8-u3-fixture.mjs";
import { startU3Fixture } from "./pre-z8-u3-provider.mjs";
import { selectU3NativeInstructions } from "./pre-z8-u3-references.mjs";
import { verifyU3Context } from "./pre-z8-u3-context.mjs";
import {
  assertU3CapturedPrompts,
  finishU3Graph,
  verifyU3LaterChat,
} from "./pre-z8-u3-native-proof.mjs";
import {
  assertU3FixturePreserved,
  assertU3Idle,
  captureU3,
  initializeU3Workspace,
  instantiateU3Draft,
  ledger,
  modelCount,
  readGraphRecord,
  selectValue,
  showGraph,
} from "./pre-z8-u3-common.mjs";
import { startU4Fixture } from "./pre-z8-u4-provider.mjs";
import { prepareU4Owner } from "./pre-z8-u4-artifact-fault.mjs";
import { verifyU4ArtifactErrors } from "./pre-z8-u4-artifact-ui.mjs";
import {
  cancelU4AfterEdit,
  completeU4Companion,
  driveU4Native,
  startU4Companion,
} from "./pre-z8-u4-cancel.mjs";
import { assertU4Summary, captureU4Guided, captureU4Summary, openU4Gate } from "./pre-z8-u4-ui.mjs";
import {
  assertU4CompanionWaiting,
  completeU4ConcurrentCompanion,
} from "./pre-z8-u4-concurrent.mjs";
import { driveU4SourceDrift } from "./pre-z8-u4-source-drift.mjs";

const scenario =
  process.argv.find((value) => value.startsWith("--scenario="))?.split("=")[1] ?? "cancel";
assert.ok(["cancel", "complete", "concurrent-chat", "source-drift"].includes(scenario));
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Refusing inherited installed executable override.",
);
const isolation = await createIsolation({
  fixtureFactory:
    scenario === "cancel"
      ? startU4Fixture
      : scenario === "concurrent-chat"
        ? (workspace) => startU4Fixture(workspace, { holdEnabled: false })
        : startU3Fixture,
});
const summary = {
  scenario: `pre-z8-u4-${scenario}`,
  home: isolation.home,
  workspace: isolation.workspace,
  startedAt: Date.now(),
  assertions: [],
  screenshots: [],
  notRun: [
    "Human novice/live-provider/company-project pilot",
    "Actual OS dialog interaction",
    "Installed artifact, OS scaling and cross-platform qualification",
    "fixture.test.mjs execution",
    "Z8",
  ],
};
console.error(`Pre-Z8 U4 ${scenario} isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.testedBuild = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/renderer/index.html",
    ].map(async (file) => ({ file, sha256: u3Sha256(await readFile(path.join(root, file))) })),
  );
  summary.owner = await prepareU4Owner(isolation);
  summary.fixture = {
    references: await prepareU3Fixture(isolation),
    source: await prepareSourceFixture(isolation),
  };
  const originalTest = await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8");
  window = await isolation.launch();
  await initializeU3Workspace(isolation, window, summary);
  await window.getByTestId("graph-view-workflows").click();
  await selectValue(window, "graph-library-entry", "agent-assisted");
  await window.getByTestId("graph-template-parameter-request").fill(U3_REQUEST);
  await selectU3NativeInstructions(isolation, window, summary);
  await instantiateU3Draft(isolation, window, "agent-assisted");
  await verifyU3Context(isolation, window, summary);
  await captureU4Guided(isolation, window, summary);
  await assertU3Idle(isolation, "entire U4 setup and Guided read-only preparation");
  // Capture the prepared definition/source/test before the independent companion detour.
  const preparedRecord = await readGraphRecord(isolation);
  const preparedSource = await isolation.readFixture();
  const companion =
    scenario === "cancel" || scenario === "concurrent-chat"
      ? await startU4Companion(isolation, window, summary)
      : undefined;
  const beforeInputs = await ledger(isolation),
    requestsBefore = modelCount(isolation);
  // 伴随会话通过 showGraph 返回时会停留在 Runs 视图，而 Run 按钮仅在 Design 视图渲染；
  // 因此必须在此显式切回 Design，并确认切换这一只读导航未改变已准备的定义、源码/测试与单条伴随输入。
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-run-button").waitFor();
  assert.deepEqual((await readGraphRecord(isolation)).definition, preparedRecord.definition);
  await assertU3FixturePreserved(isolation, originalTest, preparedSource);
  assert.deepEqual(await ledger(isolation), beforeInputs);
  assert.equal(modelCount(isolation), requestsBefore);
  summary.preRunBoundary = {
    definitionRevision: preparedRecord.definition.revision,
    templateId: preparedRecord.definition.template.id,
    referenceSelection: preparedRecord.definition.template.bindings.references,
    sourceSha256: u3Sha256(preparedSource),
    nativeInputs: beforeInputs.length,
    modelRequests: requestsBefore,
    designSelectedAt: Date.now(),
  };
  await window.getByTestId("graph-run-button").click();
  await window.getByTestId("graph-run-confirmation").waitFor();
  const snapshot = JSON.parse(
    await window.getByTestId("graph-confirmation-definition").locator("pre").textContent(),
  );
  assert.equal(snapshot.definition.template.id, "agent-assisted");
  assert.equal(
    snapshot.provenance.references.find((item) => item.id === "instructions").delivery,
    "native-instructions",
  );
  assert.deepEqual(await ledger(isolation), beforeInputs);
  assert.equal(modelCount(isolation), requestsBefore);
  assert.equal(await window.getByTestId("graph-confirm-run").isDisabled(), true);
  summary.confirmedSnapshot = snapshot;
  await window.getByTestId("graph-preflight-ack").setChecked(true);
  await window.getByTestId("graph-confirm-run").click();
  await showGraph(window);
  const boundary = await driveU4Native(isolation, window, summary, { held: scenario === "cancel" });
  summary.runId = boundary.id;
  assert.deepEqual(boundary.definition, snapshot.definition);
  await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
  if (scenario === "cancel") {
    const cancelled = await cancelU4AfterEdit(
      isolation,
      window,
      summary,
      boundary,
      companion,
      originalTest,
    );
    await completeU4Companion(isolation, window, summary, cancelled, companion, originalTest);
    summary.terminalRun = cancelled;
    const persisted = await readGraphRecord(isolation),
      inputs = await ledger(isolation),
      requests = modelCount(isolation);
    await isolation.stopApp();
    window = await isolation.launch();
    await assertU4Summary(window, summary, cancelled, {
      evidence: "agent-reported",
      human: "pending",
    });
    assert.deepEqual(await readGraphRecord(isolation), persisted);
    assert.deepEqual(await ledger(isolation), inputs);
    assert.equal(modelCount(isolation), requests);
    await captureU4Summary(isolation, window, summary, "pre-z8-u4-cancelled-reopened-no-replay");
    summary.assertions.push(
      "Restart selects the same terminal cancelled history with its exact native proof and preserved source, without replay, recovery admission or another model request.",
    );
  } else if (scenario === "concurrent-chat") {
    // The 3 Graph captured prompts are proven by complete-attempt-2; this scenario focuses on the
    // new concurrent-isolation assertion: the companion Chat stays unanswered while the Graph run
    // COMPLETES its final gate and terminal proof (not just cancellation), then completes only
    // after its explicit answer with no cross-talk.
    await assertU4CompanionWaiting(isolation, window, summary, companion, "gate-pending");
    await openU4Gate(isolation, window, summary, boundary);
    await captureU4Summary(isolation, window, summary, "pre-z8-u4-concurrent-gate-pending");
    const completed = await finishU3Graph(isolation, window, summary, boundary);
    summary.terminalRun = completed;
    await assertU4CompanionWaiting(isolation, window, summary, companion, "completed");
    const projection = await assertU4Summary(window, summary, completed, {
      evidence: "agent-reported",
      human: "approved",
    });
    assert.equal(projection.evidence.configuredTestCount, 0);
    assert.equal(projection.sourceChanges.length, 1);
    assert.ok(
      projection.sourceChanges[0].snapshot.files.some((item) => item.path === "fixture.mjs"),
    );
    await captureU4Summary(
      isolation,
      window,
      summary,
      "pre-z8-u4-concurrent-completed-approved",
    );
    await completeU4ConcurrentCompanion(
      isolation,
      window,
      summary,
      completed,
      companion,
      originalTest,
    );
    await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
    summary.assertions.push(
      "Concurrent ordinary Chat: an independent Chat stays at its original native question while the Graph run completes its final gate and terminal proof, then completes only after its explicit answer with no cross-talk between the two sessions.",
    );
  } else if (scenario === "source-drift") {
    // The 3 captured prompts are proven by complete-attempt-2; this scenario mutates fixture.mjs at
    // the approval boundary and proves the product's StaleEvidence contract blocks the frozen
    // evidence from being approved as current, with no auto-recovery after source restore.
    await openU4Gate(isolation, window, summary, boundary);
    await captureU4Summary(isolation, window, summary, "pre-z8-u4-source-drift-gate-pending");
    await driveU4SourceDrift(isolation, window, summary, boundary, "final-gate");
    await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
    summary.assertions.push(
      "Controlled fixture.mjs mutation after evidence capture is detected at the approval boundary: the product blocks the decision with StaleEvidence, the stale gate does not auto-recover after the exact source restore, and no blind replay or stale bypass is possible.",
    );
  } else {
    const inputs = await assertU3CapturedPrompts(isolation, summary, boundary);
    await openU4Gate(isolation, window, summary, boundary);
    await captureU4Summary(isolation, window, summary, "pre-z8-u4-final-gate-pending");
    const completed = await finishU3Graph(isolation, window, summary, boundary);
    summary.terminalRun = completed;
    const projection = await assertU4Summary(window, summary, completed, {
      evidence: "agent-reported",
      human: "approved",
    });
    assert.equal(projection.evidence.configuredTestCount, 0);
    assert.equal(projection.sourceChanges.length, 1);
    assert.ok(
      projection.sourceChanges[0].snapshot.files.some((item) => item.path === "fixture.mjs"),
    );
    await captureU4Summary(
      isolation,
      window,
      summary,
      "pre-z8-u4-completed-agent-reported-approved",
    );
    await verifyU4ArtifactErrors(isolation, window, summary, completed);
    await verifyU3LaterChat(isolation, window, summary, completed, inputs);
    await assertU4Summary(window, summary, completed, {
      evidence: "agent-reported",
      human: "approved",
    });
    await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
    summary.assertions.push(
      "Completed execution, agent-reported evidence with zero configured Tests, and exact human approval remain separate. Captured request/result/source snapshots match the immutable run and later ordinary Chat cannot replace them.",
    );
  }
  assert.deepEqual(isolation.fixture.errors, []);
} catch (error) {
  failure = error;
}
summary.status = failure ? "FAIL" : "PASS";
if (failure) {
  process.exitCode = 1;
  summary.error = failure instanceof Error ? failure.stack : String(failure);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window)
    await captureU3(isolation, window, summary, "pre-z8-u4-failure").catch((error) => {
      summary.screenshotFailure = String(error);
    });
}
summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
summary.nativeLedger = await ledger(isolation).catch(() => undefined);
try {
  summary.nativeSessions = nativeSessions(isolation, summary.finalRecord?.runs?.at(-1));
} catch (error) {
  summary.sessionReadError = String(error);
  summary.status = "FAIL";
  process.exitCode = 1;
}
summary.modelRequests = modelCount(isolation);
summary.nativeToolCalls = isolation.fixture.toolCalls;
summary.nativeToolResults = isolation.fixture.toolResults;
summary.fixtureErrors = isolation.fixture.errors;
summary.providerHolds = isolation.fixture.holds?.();
summary.completedAt = Date.now();
const receipt = path.join(isolation.home, "pre-z8-u4-summary.json");
try {
  await writeFile(receipt, JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      {
        status: summary.status,
        scenario: summary.scenario,
        home: summary.home,
        receipt,
        runId: summary.runId,
        modelRequests: summary.modelRequests,
        nativeInputs: summary.nativeLedger?.length,
        assertions: summary.assertions,
        error: summary.error,
      },
      null,
      2,
    ),
  );
} finally {
  await isolation.close();
}
