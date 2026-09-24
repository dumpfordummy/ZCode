import test from "node:test";
import assert from "node:assert/strict";
import {
  startZ2Fixture,
  Z2_ANALYZE,
  Z2_IMPLEMENT,
  Z2_START,
  Z2_VERIFY,
} from "./z2-provider-fixture.mjs";

const tools = ["Read", "Edit", "Bash", "AskUserQuestion"].map((name) => ({
  type: "function",
  function: { name, parameters: { type: "object" } },
}));
const result = (id) => ({
  role: "tool",
  tool_call_id: id,
  content: "Synthetic provider fixture unit-test result, not native execution evidence.",
});
async function call(fixture, prompt, results = []) {
  const response = await fetch(`${fixture.origin}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "z1-fixture",
      tools,
      messages: [{ role: "user", content: prompt }, ...results],
    }),
  });
  return { status: response.status, body: await response.json() };
}

test("controlled provider generates distinct fresh outputs and requires actual handoff text", async () => {
  const first = await startZ2Fixture("C:/synthetic-z2-one");
  const second = await startZ2Fixture("C:/synthetic-z2-two");
  try {
    assert.notEqual(first.marker, second.marker);
    assert.equal(Z2_IMPLEMENT.includes(first.marker), false);
    const analyze = await call(first, Z2_ANALYZE.replace("{{inputs.request}}", Z2_START), [
      result("z2_analyze_source"),
      result("z2_analyze_test"),
    ]);
    assert.equal(analyze.body.choices[0].message.content, first.outputs.analyze);
    const missing = await call(first, Z2_IMPLEMENT);
    assert.equal(missing.status, 400);
    const implement = await call(
      first,
      Z2_IMPLEMENT.replace("{{inputs.request}}", Z2_START).replace(
        "{{inputs.analysis}}",
        first.outputs.analyze,
      ),
      [result("z2_implement_read"), result("z2_implement_edit")],
    );
    assert.equal(implement.body.choices[0].message.content, first.outputs.implement);
    const verify = await call(
      first,
      Z2_VERIFY.replace("{{inputs.implementation}}", first.outputs.implement),
      [result("z2_verify_read"), result("z2_verify_test")],
    );
    assert.equal(verify.body.choices[0].message.content, first.outputs.verify);
  } finally {
    await first.close();
    await second.close();
  }
});

test("controlled question waits for a correlated tool result before Read", async () => {
  const fixture = await startZ2Fixture("C:/synthetic-z2-question", { question: true });
  try {
    const waiting = await call(fixture, Z2_ANALYZE);
    assert.equal(waiting.body.choices[0].message.tool_calls[0].function.name, "AskUserQuestion");
    const repeated = await call(fixture, Z2_ANALYZE);
    assert.equal(repeated.body.choices[0].message.tool_calls[0].id, "z2_analyze_question");
    const answered = await call(fixture, Z2_ANALYZE, [result("z2_analyze_question")]);
    assert.equal(answered.body.choices[0].message.tool_calls[0].function.name, "Read");
  } finally {
    await fixture.close();
  }
});
