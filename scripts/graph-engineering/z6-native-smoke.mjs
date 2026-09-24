import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { prepareZ5Fixture, assertRunnerUnchanged } from "./z5-fixture.mjs";
import { decide } from "./z3-native-helpers.mjs";
import { assertNativeIdentity, independentSuccess, reopenCompleted } from "./z5-native-proof.mjs";
import {
  attemptFor,
  capture,
  currentIteration,
  driveUntil,
  ledger,
  modelCount,
  nativeSessions,
  openNativeAttempt,
  readArtifact,
  readGraphRecord,
  selectAttempt,
  waitRun,
} from "./z5-native-observe.mjs";
import { fingerprint } from "./z4-fixture.mjs";
import {
  assertSlotAuthorityUnchanged,
  prepareSlotFixture,
  SLOT_SOURCE_PATHS,
  SLOT_BUILD_PATHS,
  testSlotFixture,
  verifySlotResult,
} from "./z6-fixture.mjs";
import { GAME_DOC, GOOD_SLOT_SOURCE, REQUIRED_SLOT_TESTS } from "./z6-slot-source.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { instantiateNativeTemplate, startNativeTemplate } from "./z6-native-ui.mjs";

const scenario =
  process.argv.find((value) => value.startsWith("--scenario="))?.slice(11) ?? "generic";
assert.ok(["generic", "bugfix", "slot"].includes(scenario));
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, scenario),
});
const summary = {
  scenario,
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
summary.testedBuild = await Promise.all(
  [
    "apps/zcode-cli/packages/cli/dist/zcode.cjs",
    "packages/desktop/out/main/index.js",
    "packages/desktop/out/host/index.js",
  ].map(async (file) => ({
    file,
    sha256: createHash("sha256")
      .update(await readFile(path.join(root, file)))
      .digest("hex"),
  })),
);
console.error(`Z6 isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.fixture =
    scenario === "slot" ? await prepareSlotFixture(isolation) : await prepareZ5Fixture(isolation);
  if (scenario === "generic") {
    const skill = path.join(isolation.workspace, ".agents/skills/fixture-guidance/SKILL.md");
    await mkdir(path.dirname(skill), { recursive: true });
    await writeFile(
      skill,
      "---\nname: fixture-guidance\ndescription: Preserve the synthetic arithmetic test authority while fixing MathOps.\n---\nZ6_NATIVE_SKILL_AUTHORITY: Read MathOps.cs and Runner.cs. Change only MathOps.cs for the requested addition fix. Preserve independent tests and configured Build/Test. No external tools, credentials or publication.\n",
    );
    await writeFile(
      path.join(isolation.workspace, "ExtraInstructions.md"),
      "Z6_EXTRA_INSTRUCTIONS: The explicit requested Add behavior is left + right. Preserve Runner.cs and all three assertions. Selected native skill fixture-guidance supplies the same bounded project guidance.\n",
    );
  }
  window = await isolation.launch();
  await instantiateNativeTemplate(isolation, window, summary, scenario);
  await startNativeTemplate(isolation, window, summary);
  let run = await driveUntil(
    isolation,
    window,
    summary,
    (item) => item.status === "WaitingForApproval",
  );
  if (scenario === "slot") {
    const interpretation = attemptFor(run, currentIteration(run), "interpretation");
    assert.equal(interpretation.status, "WaitingForApproval");
    assert.equal((await ledger(isolation)).length, 1);
    const analysis = JSON.parse(attemptFor(run, currentIteration(run), "analyze").finalOutput.text);
    assert.deepEqual(
      analysis.rules.map((item) => item.source),
      ["GameDoc.md#R1", "GameDoc.md#R2", "GameDoc.md#R3", "GameDoc.md#R4", "GameDoc.md#R5"],
    );
    assert.equal(await readFile(path.join(isolation.workspace, "GameDoc.md"), "utf8"), GAME_DOC);
    await selectAttempt(window, interpretation);
    await capture(isolation, window, summary, "z6-source-interpretation-human-gate");
    await decide(
      window,
      "approve",
      "Reviewed the actual synthetic GameDoc R1–R5 interpretation and 13 edge cases. Normal/Free selected, Bonus/Respin excluded, RTP N/A; no company pilot authorized.",
    );
    run = await driveUntil(
      isolation,
      window,
      summary,
      (item) =>
        item.status === "WaitingForApproval" &&
        attemptFor(item, currentIteration(item), "final-gate")?.status === "WaitingForApproval",
    );
  }
  const identity = assertNativeIdentity(run, await ledger(isolation));
  if (scenario === "generic") {
    assert.deepEqual(run.provenance.references.map((item) => item.id).sort(), [
      "instructions",
      "skill",
    ]);
    assert.ok(run.provenance.references.every((item) => /^[a-f0-9]{64}$/.test(item.digest)));
    assert.ok(
      isolation.fixture.toolResults.some(
        (item) =>
          item.id === "z6_implement_skill" && item.output.includes("Z6_NATIVE_SKILL_AUTHORITY"),
      ),
    );
    summary.assertions.push(
      "Selected additional instructions and a real native fixture-guidance Skill have captured digests; the actual native Skill tool loads the workspace SKILL.md before implementation.",
    );
  }
  const expectedAgents = scenario === "generic" ? 3 : 6,
    expectedTools = scenario === "bugfix" ? 6 : 2;
  assert.equal(identity.agents.length, expectedAgents);
  assert.equal(identity.tools.length, expectedTools);
  assert.equal(run.routing.admissions, expectedAgents + expectedTools);
  assert.equal(nativeSessions(isolation, run).length, expectedAgents + expectedTools);
  if (scenario === "slot") {
    assert.equal(
      run.nodeAttempts.some((item) => ["bonus", "respin"].includes(item.nodeId)),
      false,
    );
    assert.equal(
      await readFile(path.join(isolation.workspace, "SlotRules.cs"), "utf8"),
      GOOD_SLOT_SOURCE,
    );
    await assertSlotAuthorityUnchanged(isolation);
  }
  summary.iterationEvidence = [];
  for (const iteration of run.routing.iterations) {
    const tool = attemptFor(run, iteration, "test"),
      build = attemptFor(run, iteration, "build"),
      review = attemptFor(run, iteration, "reviewer");
    const expected =
      scenario === "bugfix"
        ? [0, 2, 3][iteration.index]
        : scenario === "slot"
          ? REQUIRED_SLOT_TESTS.length
          : 3;
    assert.equal(build.status, "Completed");
    assert.equal(tool.verification.passed, expected);
    assert.equal(tool.verification.observationValid, true);
    assert.equal(tool.sourceDigest, build.sourceDigest);
    assert.equal(tool.buildDigest, build.outputDigest);
    const verification = await readArtifact(window, run, tool, "verification");
    const report = await readArtifact(window, run, tool, "results/test-report.json");
    assert.equal(report.value.operationId, tool.operationId);
    assert.equal(verification.value.reportArtifactId, report.artifact.id);
    assert.deepEqual(report.value.tests, verification.value.tests);
    assert.deepEqual(JSON.parse(review.finalOutput.text).evidenceReferences, [
      verification.artifact.id,
    ]);
    await capture(
      isolation,
      window,
      summary,
      `z6-iteration-${iteration.index}-actual-test-evidence`,
    );
    await openNativeAttempt(isolation, window, summary, review);
    summary.iterationEvidence.push({ iteration, verification, report });
  }
  const finalGate = attemptFor(run, currentIteration(run), "final-gate");
  assert.equal(finalGate.status, "WaitingForApproval");
  assert.ok(finalGate.request.evidence.some((item) => item.alias === "review"));
  await selectAttempt(window, finalGate);
  await capture(isolation, window, summary, "z6-final-human-review");
  await decide(
    window,
    "approve",
    "Reviewed current actual source/diff, immutable test report and source-linked reviewer findings. Controlled synthetic acceptance only; no publication/company pilot authorized.",
  );
  run = await waitRun(isolation, (item) => item.status === "Completed");
  if (scenario === "slot") {
    const proof = {
      source: await fingerprint(isolation, SLOT_SOURCE_PATHS),
      build: await fingerprint(isolation, SLOT_BUILD_PATHS),
    };
    summary.independentTest = await testSlotFixture(isolation, proof);
    await verifySlotResult(isolation, proof, summary.independentTest);
  } else {
    await independentSuccess(isolation, summary);
    await assertRunnerUnchanged(isolation);
  }
  window = await reopenCompleted(isolation, window, summary);
  await capture(isolation, window, summary, "z6-completed-pinned-history-reopened");
  assert.deepEqual(isolation.fixture.errors, []);
  summary.assertions.push(
    "Shipped template executes through existing native sessions with exact explicit handoffs, real Read/Edit/Build/Test, human gates and independently verified unchanged assertions; completed reopen dispatches nothing.",
  );
} catch (error) {
  failure = error;
}
summary.status = failure ? "FAIL" : "PASS";
if (failure) {
  summary.error = failure instanceof Error ? failure.stack : String(failure);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window) await capture(isolation, window, summary, "z6-native-failure").catch(() => {});
  process.exitCode = 1;
}
summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
summary.nativeLedger = await ledger(isolation).catch(() => undefined);
summary.nativeToolResults = isolation.fixture.toolResults;
summary.providerErrors = isolation.fixture.errors;
summary.modelRequests = modelCount(isolation);
summary.nativeSessions = nativeSessions(isolation, summary.finalRecord?.runs.at(-1));
await writeFile(path.join(isolation.home, "z6-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await isolation.close();
