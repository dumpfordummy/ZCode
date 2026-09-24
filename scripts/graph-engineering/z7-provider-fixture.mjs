import http from "node:http";
import assert from "node:assert/strict";
import { contribution, branchTestCommand } from "./z7-fixture.mjs";
import {
  COMPANION_INSTRUCTION,
  COMPANION_TOOL_ID,
  COMPANION_QUESTION_OPTION,
  COMPANION_COMPLETION,
} from "./provider-fixture.mjs";
export { COMPANION_INSTRUCTION };

/** Controlled model responses only. All filesystem edits and commands belong to actual native tools. */
export async function startZ7Provider(_workspace, scenario) {
  const requests = [],
    toolResults = [],
    errors = [],
    held = [];
  let fail = false;
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {},
      messages = body.messages ?? [];
    const prompt = messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join("\n");
    const stage =
      /Parallel worker task: ([\w-]+)\./.exec(prompt)?.[1] ??
      (prompt.includes("Parallel integration task.")
        ? "integration"
        : prompt.includes("Z1_COMPANION_TASK")
          ? "companion"
          : "other");
    requests.push({
      path: req.url,
      model: body.model,
      native: Boolean(body.tools?.length),
      stage,
      prompt,
      at: Date.now(),
    });
    for (const m of messages)
      if (m.role === "tool" && !toolResults.some((r) => r.id === m.tool_call_id))
        toolResults.push({ id: m.tool_call_id, output: m.content, at: Date.now() });
    if (!req.url.includes("chat/completions")) {
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ code: 0, data: req.url.includes("/scenes") ? [] : { configs: {} } }));
      return;
    }
    try {
      if (body.tools?.length && stage === "worker-a" && scenario === "failure") {
        if (fail) {
          res.writeHead(400).end(
            JSON.stringify({
              error: {
                message: "Controlled native branch failure",
                type: "invalid_request_error",
              },
            }),
          );
          return;
        }
        held.push(res);
        return;
      }
      respond(res, body.stream, reply(body, prompt, stage, scenario));
    } catch (error) {
      errors.push(String(error));
      res
        .writeHead(400)
        .end(JSON.stringify({ error: { message: String(error), type: "fixture_error" } }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    toolResults,
    errors,
    failWorker() {
      fail = true;
      for (const res of held)
        res.writeHead(400).end(
          JSON.stringify({
            error: { message: "Controlled native branch failure", type: "invalid_request_error" },
          }),
        );
      held.length = 0;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
function reply(body, prompt, stage, scenario) {
  if (!body.tools?.length) return { content: "Z7 controlled native fixture" };
  const messages = body.messages ?? [],
    tools = body.tools.map((t) => t.function.name);
  const seen = (id) => messages.some((m) => m.role === "tool" && m.tool_call_id === id);
  const call = (id, name, args) => {
    const actual = tools.find((t) => t.toLowerCase() === name.toLowerCase());
    assert.ok(actual, `Missing native ${name}`);
    return { call: { id, name: actual, args } };
  };
  if (stage === "companion")
    return seen(COMPANION_TOOL_ID)
      ? { content: COMPANION_COMPLETION }
      : call(COMPANION_TOOL_ID, "AskUserQuestion", {
          questions: [
            {
              question: "Confirm unrelated native Chat survived Fork/Join cancellation.",
              header: "Z7 companion",
              options: [
                { label: COMPANION_QUESTION_OPTION, description: "Complete independent Chat" },
                { label: "Keep waiting", description: "Wait" },
              ],
              multiSelect: false,
            },
          ],
        });
  assert.ok(
    ["worker-a", "worker-b", "integration"].includes(stage),
    `Unexpected native stage ${stage}`,
  );
  const parts =
    scenario === "conflict"
      ? ["PartA"]
      : stage === "integration"
        ? ["PartA", "PartB"]
        : [stage === "worker-a" ? "PartA" : "PartB"];
  for (const part of parts) {
    const prefix = `z7_${stage}_${part}`;
    if (!seen(`${prefix}_read`)) return call(`${prefix}_read`, "Read", { file_path: `${part}.cs` });
    const value =
      scenario === "conflict"
        ? stage === "worker-a"
          ? 1
          : 2
        : part === "PartA" || scenario === "combined-failure"
          ? 1
          : 2;
    const before = contribution(part, 0),
      after = contribution(part, value);
    assert.ok(
      messages.find((m) => m.tool_call_id === `${prefix}_read`).content.includes(before.trim()),
      "Actual native read did not show pinned source.",
    );
    if (stage === "integration") {
      const start = prompt.indexOf('{"request":');
      assert.ok(start >= 0, "Integration did not consume the actual approved proposal.");
      const binding = JSON.parse(prompt.slice(start).split("\n")[0]);
      const file = binding.proposal.files.find((f) => f.path === `${part}.cs`);
      assert.equal(file.before, before);
      assert.equal(file.after, after);
    }
    if (!seen(`${prefix}_edit`))
      return call(`${prefix}_edit`, "Edit", {
        file_path: `${part}.cs`,
        old_string: before.trim(),
        new_string: after.trim(),
      });
  }
  if (stage !== "integration") {
    const id = `z7_${stage}_test`;
    if (!seen(id))
      return call(id, "Bash", {
        command: branchTestCommand(),
        description: "Build and independently test this isolated synthetic branch",
        timeout: 120000,
      });
    const result = messages.find((m) => m.tool_call_id === id).content;
    assert.ok(
      result.includes('"status": "passed"') && !result.includes('"status": "failed"'),
      "Actual branch test did not pass.",
    );
  }
  return {
    content: `Actual native ${stage} Read/Edit complete. ${stage === "integration" ? "Combined native Build/Test remains mandatory." : "Independent branch tests passed; this does not establish combined correctness."}`,
  };
}
function respond(res, stream, { content = "", call }) {
  const tool_calls = call
    ? [
        {
          index: 0,
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        },
      ]
    : undefined;
  const finish = call ? "tool_calls" : "stop";
  if (stream) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const chunk = (delta, finish_reason = null) => ({
      id: "z7-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "z1-fixture",
      choices: [{ index: 0, delta, finish_reason }],
    });
    for (const item of [
      chunk({ role: "assistant" }),
      chunk(call ? { tool_calls } : { content }),
      chunk({}, finish),
    ])
      res.write(`data: ${JSON.stringify(item)}\n\n`);
    res.end("data: [DONE]\n\n");
  } else
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        id: "z7-fixture",
        object: "chat.completion",
        model: "z1-fixture",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: call ? null : content,
              ...(call ? { tool_calls } : {}),
            },
            finish_reason: finish,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    );
}
