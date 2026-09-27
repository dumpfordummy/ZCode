import assert from "node:assert/strict";
import test from "node:test";
import { QUESTION_OPTION, outputsFor } from "./pre-z8-u1-responses.mjs";
import { setTimeout as delay } from "node:timers/promises";
import {
  U4_COMPANION_INPUT,
  U4_COMPANION_OPTION,
  U4_COMPANION_OUTPUT,
  U4_COMPANION_TOOL,
  u4Response,
  startU4Fixture,
} from "./pre-z8-u4-provider.mjs";

const workspace = "C:/owned/fixture";
const outputs = outputsFor("PRE_Z8_U4_TEST");
const tools = ["Read", "Edit", "AskUserQuestion"].map((name) => ({ function: { name } }));
const result = (id, content) => ({ role: "tool", tool_call_id: id, content });
const graph = (extra) => ({
  tools,
  messages: [{ role: "user", content: `Workflow task: implement.\n${outputs.analyze}` }, ...extra],
});
const read = result("pre_z8_u1_implement_read", "1\texport const marker = 'Z1_BEFORE_7391';");
const question = result("pre_z8_u1_implement_question", QUESTION_OPTION);
const edit = result(
  "pre_z8_u1_implement_edit",
  `The file ${workspace}/fixture.mjs has been updated successfully. (file state is current in your context — no need to Read it back)`,
);

test("U4 post-Edit hold requires exact actual Read, question and successful Edit output", () => {
  const waiting = u4Response({ body: graph([read, question]), workspace, outputs });
  assert.equal(waiting.call.name, "Edit");
  assert.equal(waiting.hold, undefined);
  const edited = u4Response({ body: graph([read, question, edit]), workspace, outputs });
  assert.equal(edited.hold, true);
  assert.equal(edited.content, outputs.implement);
  assert.throws(
    () =>
      u4Response({
        body: graph([read, question, { ...edit, content: "unknown success" }]),
        workspace,
        outputs,
      }),
    /Exact successful native Edit/,
  );
});

test("U4 separate Chat completes only after its real native question result", () => {
  const body = { tools, messages: [{ role: "user", content: U4_COMPANION_INPUT }] };
  const pending = u4Response({ body, workspace, outputs });
  assert.equal(pending.call.name, "AskUserQuestion");
  assert.equal(pending.call.id, U4_COMPANION_TOOL);
  assert.equal(pending.hold, undefined);
  const completed = u4Response({
    body: { ...body, messages: [...body.messages, result(U4_COMPANION_TOOL, U4_COMPANION_OPTION)] },
    workspace,
    outputs,
  });
  assert.equal(completed.content, U4_COMPANION_OUTPUT);
  assert.throws(
    () =>
      u4Response({
        body: { ...body, messages: [...body.messages, result(U4_COMPANION_TOOL, "wrong answer")] },
        workspace,
        outputs,
      }),
    /explicit companion answer/,
  );
});

test("U4 fixture rejects unknown native input and historical companion markers", () => {
  for (const messages of [
    [{ role: "user", content: "Unrelated new work is not authorized." }],
    [
      { role: "user", content: U4_COMPANION_INPUT },
      { role: "assistant", content: U4_COMPANION_OUTPUT },
      { role: "user", content: "Perform a different action now." },
    ],
  ])
    assert.throws(() => u4Response({ body: { tools, messages }, workspace, outputs }));
});

test("U4 actual loopback response hold records client abort and cannot claim delivered late data", async () => {
  const fixture = await startU4Fixture(workspace);
  const abort = new AbortController();
  let request;
  try {
    const body = {
      tools,
      messages: [
        { role: "user", content: `Workflow task: implement.\n${fixture.outputs.analyze}` },
        read,
        question,
        edit,
      ],
    };
    request = fetch(`${fixture.origin}/chat/completions`, {
      method: "POST",
      body: JSON.stringify(body),
      signal: abort.signal,
    }).catch((error) => error);
    const until = async (predicate) => {
      const deadline = Date.now() + 3000;
      while (!predicate()) {
        assert.ok(Date.now() < deadline);
        await delay(10);
      }
    };
    await until(() => fixture.holds().length === 1);
    assert.equal(fixture.holds()[0].delivered, false);
    abort.abort();
    assert.equal((await request).name, "AbortError");
    await until(() => Boolean(fixture.holds()[0].closedAt));
    const released = fixture.releaseHeld();
    assert.equal(released[0].connectionOpenAtRelease, false);
    assert.equal(released[0].delivered, false);
    assert.ok(released[0].releaseAt >= released[0].closedAt);
    assert.throws(() => fixture.releaseHeld(), /twice/);
    assert.deepEqual(fixture.errors, []);
  } finally {
    abort.abort();
    await request;
    await fixture.close();
  }
});
