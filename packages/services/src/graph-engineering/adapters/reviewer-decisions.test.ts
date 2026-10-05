// Service-level integration only: simulated native ports are not Desktop execution evidence.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReproductionFixture } from "./reviewer-reproduction.fixture.js";
import { instantiateGeneric, RUN_REQUEST } from "./reviewer-reproduction-data.fixture.js";
import {
  extractPermittedIds,
  runGeneric,
  isTerminal,
  isAwaitingGate,
  prepareWorkspace,
} from "./reviewer-reproduction-helpers.fixture.js";

test("scenario 4: valid needs_changes outcome is distinguishable from malformed output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s4-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });

  await runGeneric(f, definition);

  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"));

  const permittedIds = extractPermittedIds(f.capturedInstructions.get("reviewer")!);
  reviewerOutput.text = JSON.stringify({
    outcome: "needs_changes",
    findings: [
      {
        code: "REVIEW-001",
        message: "The test verifies content but the request scope may need additional review.",
      },
    ],
    evidenceReferences: permittedIds,
  });

  const final = await f.wait((r) => isAwaitingGate(r) || isTerminal(r));

  // needs_changes is a VALID reviewer outcome (not malformed). Output validation
  // should pass — this is distinguishable from scenario 2 (malformed output).
  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
  assert.equal(
    reviewerAttempt.outputValidation?.status,
    "valid",
    "needs_changes is valid; output validation should pass, unlike malformed output",
  );
  assert.equal(reviewerAttempt.status, "Completed");

  // The structured output should contain outcome: "needs_changes".
  // selector lives on artifactBindings, not on the artifact itself.
  const structuredBinding = final.artifactBindings?.find(
    (b) => b.nodeId === "reviewer" && b.selector === "structured",
  );
  assert.ok(structuredBinding, "reviewer structured artifact binding should exist");
  const structuredArtifact = final.artifacts?.find((a) => a.id === structuredBinding!.artifactId);
  assert.ok(structuredArtifact, "reviewer structured artifact should exist");
  assert.equal(structuredArtifact!.type, "json");
  assert.equal(structuredArtifact!.validation, "valid");
  // The raw JSON is on the attempt's finalOutput; the artifact store holds the content.
  const parsed = JSON.parse(reviewerAttempt.finalOutput!.text);
  assert.equal(parsed.outcome, "needs_changes");

  // The workflow should reach the final-gate, NOT stop at the reviewer.
  assert.ok(
    isAwaitingGate(final),
    "Valid needs_changes should reach the final-gate for human decision, got " + final.status,
  );
});

// ─── Scenario 5: failing Test → cannot become approved ──────────────────────

test("scenario 5: genuine failing Test stops the workflow before the reviewer runs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s5-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: false, // zz-demo.txt stays "before" → test fails
  });

  await runGeneric(f, definition);

  const final = await f.wait((r) => isTerminal(r));

  // The test genuinely fails (zz-demo.txt still contains "before").
  // Per the template's routing contract, a failing Test stops with NeedsHuman.
  // The reviewer is NOT forced to execute.
  assert.equal(
    final.status,
    "NeedsHuman",
    "Failing Test should stop the workflow with NeedsHuman, got " + final.status,
  );

  const testAttempt = final.toolAttempts?.find((a) => a.nodeId === "test");
  assert.ok(testAttempt, "test tool attempt should exist");
  assert.equal(testAttempt!.status, "Failed");
  assert.equal(testAttempt!.verification?.acceptancePassed, false);
  assert.equal(testAttempt!.verification?.outcome, "fail");

  // The reviewer node must NOT have been dispatched. When the test fails,
  // skipPending marks remaining nodes as Skipped (not Pending).
  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer");
  assert.ok(
    reviewerAttempt?.status === "Pending" || reviewerAttempt?.status === "Skipped",
    "Reviewer must not run when Test failure stops the workflow, got " + reviewerAttempt?.status,
  );
  assert.equal(
    f.capturedInstructions.has("reviewer"),
    false,
    "Reviewer instructions must not be captured when Test stops first",
  );

  // The final-gate must NOT be reached.
  const gate = final.approvalAttempts?.find((a) => a.nodeId === "final-gate");
  assert.notEqual(gate?.status, "Approved");
});

// ─── Reviewer request content assertion ─────────────────────────────────────

test("reviewer request contains original task, current verification, permitted artifact refs, and strict output contract", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-req-"));
  let disposeFixture: (() => Promise<void>) | undefined;
  t.after(async () => {
    // 此清理钩子先注册：先等待在途证据写入结束，再删除目录，避免与后注册的服务清理竞争。
    await disposeFixture?.();
    await rm(root, { recursive: true, force: true });
  });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });
  disposeFixture = f.dispose;

  await runGeneric(f, definition);

  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"), "Reviewer must be dispatched");

  const instructions = f.capturedInstructions.get("reviewer")!;

  // 1. The original task.
  assert.ok(instructions.includes(RUN_REQUEST), "Must contain the original task text");

  // 2. The current verification (test verification artifact content).
  assert.ok(instructions.includes("verification"), "Must include the verification input");
  assert.ok(
    instructions.includes('"outcome"') || instructions.includes("outcome"),
    "Must contain the verification outcome",
  );

  // 3. The exact permitted artifact references.
  const permittedIds = extractPermittedIds(instructions);
  assert.ok(
    permittedIds.length >= 1,
    "Permitted list must contain at least the verification artifact ID",
  );

  const run = await f.current();
  // selector lives on artifactBindings, not on the artifact itself.
  const verificationBinding = run.artifactBindings?.find(
    (b) => b.nodeId === "test" && b.selector === "verification",
  );
  assert.ok(verificationBinding, "Verification artifact binding must exist");
  const verificationArtifact = run.artifacts?.find((a) => a.id === verificationBinding!.artifactId);
  assert.ok(verificationArtifact, "Verification artifact must exist");
  assert.equal(verificationArtifact!.validation, "valid");
  assert.ok(
    permittedIds.includes(verificationArtifact!.id),
    "Permitted list must contain the actual verification artifact ID",
  );

  // 4. The declared strict output contract.
  assert.ok(instructions.includes("no prose before or after"), "Must prohibit prose");
  assert.ok(instructions.includes("no Markdown fence"), "Must prohibit fences");
  assert.ok(instructions.includes("no additional properties"), "Must prohibit extra properties");
  assert.ok(
    instructions.includes("A failed Test can never be pass"),
    "Must state failed-Test rule",
  );
  assert.ok(
    /do not require Git-tracked or committed source/i.test(instructions),
    "Must not require Git tracking",
  );

  // Clean up: set valid output and let it finish.
  reviewerOutput.text = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: permittedIds,
  });
});
