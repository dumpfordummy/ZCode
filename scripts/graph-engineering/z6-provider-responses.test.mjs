import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_BAD,
  FREE_GOOD,
  GAME_DOC,
  NORMAL_BAD,
  NORMAL_GOOD,
  NORMAL_ONLY_SOURCE,
  SEED_SLOT_SOURCE,
} from "./z6-slot-source.mjs";
import { parseNativeBinding, nativeResponse, stageOf } from "./z6-provider-responses.mjs";

const tools = ["Read", "Edit"].map((name) => ({ function: { name } }));
const response = (stage, messages = []) =>
  nativeResponse({
    body: { tools, messages },
    prompt: `Workflow task: ${stage}.\nplan:\nSource-linked plan: Normal then Free.`,
    stage,
    workspace: "C:/synthetic/workspace",
    scenario: "slot",
  });
const result = (id, content) => ({ role: "tool", tool_call_id: id, content });

test("generic selected skill uses the actual native Skill contract before Read/Edit", () => {
  const reply = nativeResponse({
    body: { tools: [...tools, { function: { name: "Skill" } }], messages: [] },
    prompt: "Workflow task: implement.\nSelected native skill fixture-guidance.",
    stage: "implement",
    workspace: "C:/synthetic",
    scenario: "generic",
  });
  assert.deepEqual(reply.call, {
    id: "z6_implement_skill",
    name: "Skill",
    arguments: { skill: "fixture-guidance" },
  });
});

test("native fixture classifies only actual shipped task headers and strict explicit JSON bindings", () => {
  assert.equal(stageOf("Workflow task: cross-review.\nrequest: text"), "cross-review");
  assert.equal(stageOf("A quote says Workflow task: repair."), "other");
  assert.deepEqual(
    parseNativeBinding(
      'verification:\n{"artifactId":"test","outcome":"pass"}\nAdditional reference: text',
      "verification",
    ),
    { artifactId: "test", outcome: "pass" },
  );
  assert.throws(() => parseNativeBinding("missing evidence", "verification"));
});
test("slot responses require actual native Read and isolated exact Edit instead of emitting success", () => {
  assert.equal(response("normal").call.name, "Read");
  const prior = [
    result("z6_normal_source", SEED_SLOT_SOURCE),
    result("z6_normal_authority", GAME_DOC),
  ];
  const edit = response("normal", prior).call;
  assert.equal(edit.name, "Edit");
  assert.equal(edit.arguments.old_string, NORMAL_BAD);
  assert.equal(edit.arguments.new_string, NORMAL_GOOD);
  const free = response("free", [
    result("z6_free_source", NORMAL_ONLY_SOURCE),
    result("z6_free_authority", GAME_DOC),
  ]).call;
  assert.equal(free.arguments.old_string, FREE_BAD);
  assert.equal(free.arguments.new_string, FREE_GOOD);
  assert.throws(() =>
    nativeResponse({
      body: { tools: [{ function: { name: "Other" } }], messages: [] },
      prompt: "Workflow task: normal.",
      stage: "normal",
      workspace: "C:/synthetic",
      scenario: "slot",
    }),
  );
});
test("reviewer cannot emit PASS without consuming the exact observed native report", () => {
  const verification = {
    artifactId: "current",
    runId: "r",
    nodeId: "test",
    attemptId: "a",
    iterationId: "i",
    operationId: "o",
    sourceDigest: "s",
    buildDigest: "b",
    outcome: "fail",
    tests: [{ name: "edge-R3", status: "failed", message: "Expected3;actual4" }],
  };
  const prompt = `Workflow task: reviewer.\nverification:\n${JSON.stringify(verification)}`;
  const base = {
    body: { tools, messages: [] },
    prompt,
    stage: "reviewer",
    workspace: "C:/synthetic",
    scenario: "slot",
  };
  assert.equal(nativeResponse(base).call.name, "Read");
  const report = {
    operationId: "o",
    sourceDigest: "s",
    buildDigest: "b",
    tests: verification.tests,
  };
  const messages = [
    result("z6_reviewer_source_o", "source"),
    result("z6_reviewer_report_o", JSON.stringify(report)),
  ];
  const output = JSON.parse(nativeResponse({ ...base, body: { tools, messages } }).content);
  assert.equal(output.outcome, "needs_changes");
  assert.deepEqual(output.evidenceReferences, ["current"]);
  assert.ok(output.findings[0].message.includes("GameDoc.md#R3"));
  report.operationId = "stale";
  messages[1].content = JSON.stringify(report);
  assert.throws(() => nativeResponse({ ...base, body: { tools, messages } }));
});
