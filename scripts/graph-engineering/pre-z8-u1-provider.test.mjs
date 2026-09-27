import assert from "node:assert/strict";
import test from "node:test";
import { nativeResponse, outputsFor, QUESTION_OPTION, stageOf } from "./pre-z8-u1-responses.mjs";

const marker = "PRE_Z8_U1_UNIT";
const outputs = outputsFor(marker);
const tools = ["Read", "Edit", "AskUserQuestion"].map((name) => ({ function: { name } }));
const before = "export const marker = 'Z1_BEFORE_7391';\n";
const after = "export const marker = 'Z1_AFTER_7391';\n";
const result = (id, content) => ({ role: "tool", tool_call_id: `pre_z8_u1_${id}`, content });
const promptFor = (stage) =>
  `Workflow task: ${stage}.\nrequest:\nSynthetic change.\n${stage !== "analyze" ? `analyze:\n${outputs.analyze}\n` : ""}${stage === "review" ? `implement:\n${outputs.implement}\n` : ""}`;
const reply = (stage, messages = [], prompt = promptFor(stage)) =>
  nativeResponse({ body: { tools, messages }, prompt, workspace: "C:/synthetic", outputs });

test("only explicit shipped task headers select a controlled native stage", () => {
  assert.equal(stageOf("Workflow task: analyze.\nrequest: example"), "analyze");
  assert.equal(stageOf("A quote says Workflow task: analyze."), "other");
  assert.throws(() => reply("build"), /unrecognized/i);
  assert.throws(() => reply("reviewer"), /unrecognized/i);
});

test("analysis requires actual correct source Read and cannot emit Edit or command tools", () => {
  assert.deepEqual(reply("analyze").call, {
    id: "pre_z8_u1_analyze_read",
    name: "Read",
    arguments: { file_path: "C:/synthetic/fixture.mjs" },
  });
  assert.equal(reply("analyze", [result("analyze_read", `1\t${before}`)]).content, outputs.analyze);
  assert.throws(() => reply("analyze", [result("analyze_read", after)]), /source/i);
});

test("implementation refuses absent or duplicate actual predecessor output", () => {
  assert.throws(() => reply("implement", [], "Workflow task: implement."), /handoff/i);
  assert.throws(
    () => reply("implement", [], `${promptFor("implement")}\n${outputs.analyze}`),
    /exactly once/i,
  );
});

test("implementation asks a native question before exact Edit and requires its exact successful file result", () => {
  const read = result("implement_read", before);
  const question = reply("implement", [read]).call;
  assert.equal(question.name, "AskUserQuestion");
  assert.equal(question.arguments.questions[0].options[0].label, QUESTION_OPTION);
  assert.throws(
    () => reply("implement", [read, result("implement_question", "Keep waiting")]),
    /question/i,
  );
  const accepted = [read, result("implement_question", QUESTION_OPTION)];
  const edit = reply("implement", accepted).call;
  assert.equal(edit.name, "Edit");
  assert.equal(edit.arguments.old_string, "Z1_BEFORE_7391");
  assert.equal(edit.arguments.new_string, "Z1_AFTER_7391");
  for (const content of [
    "Edit acknowledged",
    "Permission denied",
    "The file C:/synthetic/other.mjs has been updated successfully. (file state is current in your context — no need to Read it back)",
  ])
    assert.throws(
      () => reply("implement", [...accepted, result("implement_edit", content)]),
      /Edit result/i,
    );
  assert.equal(
    reply("implement", [
      ...accepted,
      result(
        "implement_edit",
        "The file C:/synthetic/fixture.mjs has been updated successfully. (file state is current in your context — no need to Read it back)",
      ),
    ]).content,
    outputs.implement,
  );
});

test("review requires both exact handoffs and current changed source without a test claim", () => {
  assert.equal(reply("review").call.name, "Read");
  assert.throws(() => reply("review", [result("review_read", before)]), /source/i);
  assert.throws(
    () => reply("review", [], promptFor("review").replace(outputs.implement, "guessed result")),
    /handoff/i,
  );
  const review = reply("review", [result("review_read", after)]).content;
  assert.equal(review, outputs.review);
  assert.match(review, /not configured|not run/i);
  assert.doesNotMatch(review, /tests passed|machine-verified success/i);
});

test("missing native tool cannot be replaced by a guessed operation", () => {
  assert.throws(
    () =>
      nativeResponse({
        body: { tools: [{ function: { name: "Other" } }], messages: [] },
        prompt: promptFor("analyze"),
        workspace: "C:/synthetic",
        outputs,
      }),
    /lacks Read/,
  );
  assert.deepEqual(
    nativeResponse({ body: { messages: [] }, prompt: "title", workspace: "C:/synthetic", outputs }),
    { content: "Pre-Z8 controlled agent-assisted fixture" },
  );
});
