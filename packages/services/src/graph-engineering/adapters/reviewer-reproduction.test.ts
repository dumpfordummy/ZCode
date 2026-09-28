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

test("scenario 1: genuine passing Test + valid reviewer JSON reaches final human-review gate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s1-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" }; // patched after verification artifact is known
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });

  await runGeneric(f, definition);

  // Wait for the reviewer to be dispatched (instructions captured) or terminal.
  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"), "Reviewer must be dispatched");

  // Extract the permitted artifact IDs from the reviewer's resolved instructions.
  const permittedIds = extractPermittedIds(f.capturedInstructions.get("reviewer")!);
  assert.ok(permittedIds.length >= 1, "Permitted list must contain the verification artifact ID");

  // Set valid reviewer output referencing only the permitted artifact.
  reviewerOutput.text = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: permittedIds,
  });

  // Wait for the workflow to reach the final-gate or terminal.
  const final = await f.wait((r) => isAwaitingGate(r) || isTerminal(r));

  assert.ok(
    isAwaitingGate(final),
    "Passing Test + valid reviewer JSON should reach the final human-review gate, " +
      `got ${final.status}: ${final.message ?? ""}`,
  );

  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
  assert.equal(reviewerAttempt.status, "Completed");
  assert.equal(reviewerAttempt.outputValidation?.status, "valid");

  const gate = final.approvalAttempts?.find((a) => a.nodeId === "final-gate");
  assert.ok(gate, "final-gate approval attempt should exist");
});

// ─── Scenario 2: prose/fenced JSON → reviewer output-validation failure ─────

test("scenario 2: prose and fenced JSON output is rejected by strict reviewer validation", async (t) => {
  const badOutputs = [
    'Here is my review:\n{"outcome":"pass","findings":[],"evidenceReferences":[]}',
    "```json\n" +
      JSON.stringify({ outcome: "pass", findings: [], evidenceReferences: [] }) +
      "\n```",
    "I think this looks good. The test passed.",
  ];

  for (const badOutput of badOutputs) {
    const root = await mkdtemp(join(tmpdir(), "zcode-repro-s2-"));
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

    // Wait for reviewer dispatch, then feed the bad output.
    await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
    if (f.capturedInstructions.has("reviewer")) {
      reviewerOutput.text = badOutput;
    }

    const final = await f.wait((r) => isTerminal(r));
    assert.equal(
      final.status,
      "NeedsHuman",
      `Prose/fenced output "${badOutput.slice(0, 40)}..." should stop the workflow, got ${final.status}`,
    );

    const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
    assert.equal(reviewerAttempt.status, "Failed");
    assert.equal(reviewerAttempt.outputValidation?.status, "invalid");
    assert.match(
      reviewerAttempt.outputValidation?.issues.join(" ") ?? "",
      /prose|fence|JSON|invalid|object|property|Unexpected/i,
    );

    // The reviewer never reached the final-gate.
    const gate = final.approvalAttempts?.find((a) => a.nodeId === "final-gate");
    assert.notEqual(gate?.status, "Approved");
  }
});

// ─── Scenario 3: unbound report reference → rejected ────────────────────────

test("scenario 3: unbound evidence reference is rejected without weakening ownership checks", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s3-"));
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

  // Wait for reviewer dispatch, then feed output with an unbound reference.
  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"));

  // The reviewer references an artifact ID that is NOT in the permitted list.
  reviewerOutput.text = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: ["unbound-invented-id-not-in-permitted-list"],
  });

  const final = await f.wait((r) => isTerminal(r));
  assert.equal(
    final.status,
    "NeedsHuman",
    "Unbound evidence reference should stop the workflow, got " + final.status,
  );

  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
  assert.equal(reviewerAttempt.status, "Failed");
  assert.equal(reviewerAttempt.outputValidation?.status, "invalid");
  assert.match(
    reviewerAttempt.outputValidation?.issues.join(" ") ?? "",
    /evidenceReferences|validated artifacts|earlier completed/i,
  );
});

// ─── Scenario 4: valid needs_changes → distinguishable from malformed ───────
