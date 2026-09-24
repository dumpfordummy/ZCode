import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_SOURCE, PARTIAL_SOURCE } from "./z5-fixture.mjs";
import { nativeResponse, parseBinding } from "./z5-provider-responses.mjs";

const tools = ["Read", "Edit", "AskUserQuestion"].map((name) => ({ function: { name } }));
const observation = {
  artifactId: "actual-verification-1",
  runId: "run-1",
  nodeId: "test-1",
  attemptId: "attempt-1",
  iterationId: "iteration-0",
  operationId: "operation-1",
  sourceDigest: "source-1",
  buildDigest: "build-1",
  outcome: "fail",
  tests: [
    { name: "add-positive", status: "failed", message: "Expected 5; got 6." },
    { name: "add-negative", status: "failed", message: "Expected -5; got -4." },
    { name: "add-zero", status: "failed", message: "Expected 0; got 1." },
  ],
};
const prompt = (name, value) => `Z5_${name}_BEGIN\n${JSON.stringify(value)}\nZ5_${name}_END`;
const result = (id, content) => ({ role: "tool", tool_call_id: id, content });
const response = (stage, input, messages, options = {}, state = {}) =>
  nativeResponse({
    body: { tools, messages },
    prompt: input,
    stage,
    workspace: "C:/synthetic/z5",
    marker: "unit",
    options,
    state,
  });

test("reviewer refuses report identities that do not match the actual bound verification", () => {
  const input = prompt("VERIFICATION", observation);
  const read = result("z5_review_read_iteration-0", INITIAL_SOURCE);
  assert.equal(response("review", input, [read]).call.name, "Read");
  const report = { ...observation, operationId: "another-operation" };
  assert.throws(
    () =>
      response("review", input, [
        read,
        result("z5_review_report_iteration-0", JSON.stringify(report)),
      ]),
    /another-operation/,
  );
  const valid = response("review", input, [
    read,
    result("z5_review_report_iteration-0", JSON.stringify(observation)),
  ]);
  assert.deepEqual(JSON.parse(valid.content), {
    outcome: "needs_changes",
    findings: observation.tests.map(({ name, message }) => ({ code: name, message })),
    evidenceReferences: [observation.artifactId],
  });
});

test("repair consumes exact prior feedback and issues an actual native Edit from observed source", () => {
  const feedback = {
    previousIterationId: "iteration-0",
    sourceDigest: "source-1",
    findings: [{ code: "add-positive", message: "Expected 5; got 6." }],
    observations: [{ artifactId: observation.artifactId, value: observation }],
  };
  const input = prompt("FEEDBACK", feedback);
  const read = result("z5_repair_read_iteration-0", INITIAL_SOURCE);
  const first = response("repair", input, [read]);
  assert.equal(first.call.name, "Edit");
  assert.equal(first.call.arguments.old_string, INITIAL_SOURCE.trim());
  assert.equal(first.call.arguments.new_string, PARTIAL_SOURCE.trim());
  assert.deepEqual(response("repair", input, [read]), first);
  const wrong = structuredClone(feedback);
  wrong.observations[0].value.iterationId = "unrelated-iteration";
  assert.throws(() => response("repair", prompt("FEEDBACK", wrong), [read]), /unrelated-iteration/);
});

test("binding framing and review evidence never silently accept an absent or malformed record", () => {
  assert.throws(() => parseBinding("No binding", "VERIFICATION"), /missing/);
  assert.throws(() => parseBinding("Z5_VERIFICATION_BEGIN\n{}", "VERIFICATION"), /incomplete/);
  assert.throws(
    () =>
      response("review", prompt("VERIFICATION", { outcome: "pass" }), [
        result("z5_review_read_initial", INITIAL_SOURCE),
      ]),
    /lacks artifactId/,
  );
});
