import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createIsolation, root } from "./isolation.mjs";
import { prepareSourceFixture, assertSourceEvidence, AFTER_SOURCE } from "./z3-fixture.mjs";
import { decide } from "./z3-native-helpers.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { assertNativeIdentity } from "./z5-native-proof.mjs";
import {
  ledger,
  modelCount,
  nativeSessions,
  openNativeAttempt,
  readGraphRecord,
  selectAttempt,
  showGraph,
  waitRun,
} from "./z5-native-observe.mjs";
import { startU1Fixture } from "./pre-z8-u1-provider.mjs";
import { QUESTION_OPTION } from "./pre-z8-u1-responses.mjs";
import {
  assertNoNativeWork,
  captureU1,
  instantiateU1,
  verifyRecipeStates,
} from "./pre-z8-u1-ui.mjs";

assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Refusing an inherited installed/packaged executable override.",
);
const isolation = await createIsolation({ fixtureFactory: startU1Fixture });
const summary = {
  scenario: "pre-z8-u1-agent-assisted",
  home: isolation.home,
  workspace: isolation.workspace,
  startedAt: Date.now(),
  assertions: [],
  screenshots: [],
  notRun: [
    "User-operated novice/live-provider/project pilot",
    "OS scaling/accessibility conformance",
    "Workspace switching during a deliberately held in-flight RPC (deterministic UI/service tests cover stale responses)",
    "fixture.test.mjs: intentionally not executed; agent-led workflow has no configured machine tests",
  ],
};
console.error(`Pre-Z8 U1 isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.testedBuild = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/renderer/index.html",
    ].map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex"),
    })),
  );
  // 复用夹具的旧 AGENTS 要求运行测试；本场景先固定匹配 Agent-only 验收的独立合成指令。
  await writeFile(
    path.join(isolation.workspace, "AGENTS.md"),
    "Synthetic Pre-Z8 Agent-only workspace. Read and edit only fixture.mjs as explicitly requested. Preserve fixture.test.mjs and unrelated source. Do not execute commands, tests, installs, commits or publication. Do not inspect parent directories or external files.\n",
  );
  summary.fixture = await prepareSourceFixture(isolation);
  const originalTest = await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8");
  window = await isolation.launch();
  await verifyRecipeStates(isolation, window, summary);
  await instantiateU1(isolation, window, summary);
  await window.getByTestId("graph-run-button").click();
  await window.getByTestId("graph-run-confirmation").waitFor();
  const snapshot = JSON.parse(
    await window.getByTestId("graph-confirmation-definition").locator("pre").textContent(),
  );
  assert.equal(snapshot.definition.template.id, "agent-assisted");
  assert.equal(snapshot.provenance.template.digest, snapshot.definition.template.digest);
  assert.equal(await window.getByTestId("graph-confirm-run").isDisabled(), true);
  await assertNoNativeWork(isolation, "reviewed preflight before confirmation");
  summary.confirmedSnapshot = snapshot;
  await captureU1(isolation, window, summary, "pre-z8-u1-preflight");
  await window.getByTestId("graph-preflight-ack").setChecked(true);
  await window.getByTestId("graph-confirm-run").click();
  await showGraph(window);
  let run = await driveToFinalGate(isolation, window, summary);
  assert.deepEqual(run.definition, snapshot.definition);
  const { operationalDecision, ...provenance } = run.provenance;
  assert.deepEqual(provenance, snapshot.provenance);
  assert.equal(operationalDecision.acknowledgedUnknowns, true);
  const inputs = await ledger(isolation);
  const identity = assertNativeIdentity(run, inputs);
  assert.equal(identity.agents.length, 3);
  assert.equal(identity.tools.length, 0);
  assert.equal(inputs.length, 3);
  assert.equal(nativeSessions(isolation, run).length, 3);
  assert.equal(run.routing.admissions, 3);
  assert.deepEqual(
    run.nodeAttempts.map((attempt) => attempt.nodeId),
    ["analyze", "implement", "review"],
  );
  for (const attempt of run.nodeAttempts) {
    assert.equal(attempt.finalOutput.text, isolation.fixture.outputs[attempt.nodeId]);
    assert.equal(attempt.terminalProof.state, "completedSuccess");
    assert.equal(attempt.resolvedInstructions.includes("{{inputs."), false);
    for (const binding of attempt.bindings)
      if (binding.source.kind === "node") {
        const output = run.nodeAttempts.find((prior) => prior.nodeId === binding.source.nodeId)
          .finalOutput.text;
        assert.equal(binding.text, output);
        assert.equal(attempt.resolvedInstructions.split(output).length - 1, 1);
      }
  }
  const gate = run.approvalAttempts.find((attempt) => attempt.nodeId === "final-gate");
  assert.equal(gate.status, "WaitingForApproval");
  assert.equal(gate.request.complete, true);
  assert.equal(gate.request.commentPolicy, "required");
  assertSourceEvidence(
    gate.request.evidence.find((item) => item.alias === "source"),
    { afterEdit: true, head: summary.fixture.head },
  );
  assert.equal(await isolation.readFixture(), AFTER_SOURCE);
  assert.equal(
    await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8"),
    originalTest,
  );
  await selectAttempt(window, gate);
  assert.equal(await window.getByTestId("graph-approval-approve").isDisabled(), true);
  await captureU1(isolation, window, summary, "pre-z8-u1-final-gate-1280");
  await captureU1(isolation, window, summary, "pre-z8-u1-final-gate-1920", [1920, 1080]);
  await decide(
    window,
    "approve",
    "Reviewed the actual synthetic source change and agent-led findings. Tests are not configured and were not run. This decision does not authorize commit, merge or publication.",
  );
  run = await waitRun(isolation, (value) => value.status === "Completed");
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(run.toolAttempts.length, 0);
  assert.equal(
    run.artifacts.some(
      (artifact) => artifact.type === "test" || artifact.provenance === "native-test",
    ),
    false,
  );
  assert.equal(await isolation.readFixture(), AFTER_SOURCE);
  assert.equal(
    await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8"),
    originalTest,
  );
  assert.doesNotMatch(
    await window.locator("body").innerText(),
    /^\s*(?:tests passed|verified engineering success)\s*$/im,
  );
  assert.equal(
    (await window.getByTestId("graph-run-verification").innerText()).trim(),
    "Agent-led review; configured test evidence not included",
  );
  await captureU1(isolation, window, summary, "pre-z8-u1-completed-agent-led");
  summary.assertions.push(
    "Three exact fresh native task sessions consumed captured handoffs; actual question/Edit permission remained separate from the required final Graph gate. Native source changed, no configured test artifact or command was created.",
  );
  const beforeRestart = structuredClone(run),
    beforeModels = modelCount(isolation);
  await isolation.stopApp();
  window = await isolation.launch();
  await showGraph(window);
  assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), beforeRestart);
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), beforeModels);
  assert.equal(await isolation.readFixture(), AFTER_SOURCE);
  await captureU1(isolation, window, summary, "pre-z8-u1-reopened-no-replay");
  assert.deepEqual(isolation.fixture.errors, []);
  summary.assertions.push(
    "Completed restart preserved the exact pinned definition, provenance, inputs and source with zero replay.",
  );
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
    await captureU1(isolation, window, summary, "pre-z8-u1-failure").catch((error) => {
      summary.screenshotFailure = String(error);
    });
}
summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
summary.nativeLedger = await ledger(isolation).catch(() => undefined);
summary.nativeToolResults = isolation.fixture.toolResults;
summary.providerErrors = isolation.fixture.errors;
summary.modelRequests = modelCount(isolation);
summary.completedAt = Date.now();
await writeFile(
  path.join(isolation.home, "pre-z8-u1-summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
await isolation.close();

async function driveToFinalGate(isolation, window, summary) {
  const answered = new Set();
  const deadline = Date.now() + 120000;
  let run;
  while (Date.now() < deadline) {
    run = (await readGraphRecord(isolation)).runs.at(-1);
    if (run?.status === "WaitingForApproval") return run;
    assert.ok(
      ![
        "Completed",
        "Failed",
        "Unknown",
        "Interrupted",
        "Cancelled",
        "Rejected",
        "NeedsHuman",
        "BudgetExhausted",
        "NoProgress",
        "StaleEvidence",
      ].includes(run?.status),
      `Unexpected native stop: ${JSON.stringify({ status: run?.status, message: run?.message })}`,
    );
    const pending = run?.nodeAttempts.find(
      (attempt) =>
        ["WaitingForPermission", "WaitingForUser"].includes(attempt.status) &&
        !answered.has(`${attempt.attemptId}:${attempt.status}`),
    );
    if (pending) {
      await openNativeAttempt(isolation, window, summary, pending);
      assert.equal(await window.getByTestId("graph-input-owned").isVisible(), true);
      if (pending.status === "WaitingForPermission") {
        await window.getByRole("option", { name: "Allow", exact: true }).waitFor();
        await captureU1(isolation, window, summary, "pre-z8-u1-native-edit-permission");
        await approveNativePermissionOnce(window);
      } else {
        const option = window.getByRole("option", { name: new RegExp(QUESTION_OPTION) });
        await option.waitFor();
        await captureU1(isolation, window, summary, "pre-z8-u1-native-question");
        await option.press("Enter");
        await option.waitFor({ state: "hidden" });
      }
      answered.add(`${pending.attemptId}:${pending.status}`);
      await showGraph(window);
    }
    await wait(75);
  }
  throw new Error(`Native U1 final gate not reached: ${JSON.stringify(run)}`);
}
