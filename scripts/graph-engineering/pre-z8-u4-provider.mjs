import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { nativeResponse, outputsFor, stageOf } from "./pre-z8-u1-responses.mjs";

export const U4_COMPANION_INPUT =
  "PRE_Z8_U4_COMPANION: Ask the explicit companion question and wait. This ordinary Chat is independent of the Graph run. Do not read, edit, execute commands or modify files.";
export const U4_COMPANION_OPTION = "Complete the unrelated U4 Chat";
export const U4_COMPANION_TOOL = "pre_z8_u4_companion_question";
export const U4_COMPANION_OUTPUT =
  "PRE_Z8_U4_COMPANION_COMPLETED: The same unrelated native Chat received its explicit answer after Graph cancellation. No source or command action was taken.";
// concurrent-chat 场景下 Graph 运行是完成而非取消；配套 Chat 的结果文本必须与实际经过一致，不能复用 cancel 文案。
export const U4_COMPANION_OUTPUT_CONCURRENT =
  "PRE_Z8_U4_COMPANION_COMPLETED: The same unrelated native Chat received its explicit answer after Graph completion. No source or command action was taken.";
const messageText = (message) =>
  typeof message.content === "string" ? message.content : JSON.stringify(message.content);

export function u4Response({ body, workspace, outputs, holdEnabled = true }) {
  const users = (body.messages ?? []).filter((message) => message.role === "user").map(messageText);
  if (!body.tools?.length) return { content: "Pre-Z8 controlled U4 fixture" };
  if (users.at(-1) === U4_COMPANION_INPUT) {
    const result = body.messages.find(
      (message) => message.role === "tool" && message.tool_call_id === U4_COMPANION_TOOL,
    );
    if (result) {
      assert.ok(
        typeof result.content === "string" && result.content.includes(U4_COMPANION_OPTION),
        "The explicit companion answer is unavailable.",
      );
      return {
        content: holdEnabled ? U4_COMPANION_OUTPUT : U4_COMPANION_OUTPUT_CONCURRENT,
      };
    }
    const name = body.tools.find((tool) => tool.function.name.toLowerCase() === "askuserquestion")
      ?.function.name;
    assert.ok(name, "The actual companion session lacks AskUserQuestion.");
    return {
      call: {
        id: U4_COMPANION_TOOL,
        name,
        arguments: {
          questions: [
            {
              question: holdEnabled
                ? "Complete this unrelated Chat only after verifying Graph cancellation preserved it?"
                : "Complete this unrelated Chat only after verifying Graph completion preserved it?",
              header: "U4 companion",
              options: [
                {
                  label: U4_COMPANION_OPTION,
                  description: "Complete only this already waiting ordinary Chat.",
                },
                { label: "Keep waiting", description: "Do not complete this Chat yet." },
              ],
              multiSelect: false,
            },
          ],
        },
      },
    };
  }
  assert.ok(
    !users.includes(U4_COMPANION_INPUT),
    "Unknown input after the explicit companion request.",
  );
  const prompt = users.join("\n");
  const response = nativeResponse({ body, prompt, workspace, outputs });
  // The hold pauses the run after the exact successful native Edit so cancellation can be tested.
  // concurrent-chat disables it so the run proceeds through review and the final gate to completion.
  return holdEnabled &&
    stageOf(prompt) === "implement" &&
    response.content === outputs.implement
    ? { ...response, hold: true }
    : response;
}

/** Only provider response delivery is held; all source, tools and terminal facts are native-owned. */
export async function startU4Fixture(workspace, { holdEnabled = true } = {}) {
  const requests = [],
    toolResults = [],
    toolCalls = [],
    errors = [],
    held = [];
  const outputs = outputsFor(`PRE_Z8_U4_${randomUUID()}`);
  const server = http.createServer(async (request, response) => {
    const parts = [];
    let bytes = 0;
    for await (const part of request) {
      bytes += part.length;
      if (bytes > 2 * 1024 * 1024) {
        response.writeHead(413).end();
        return;
      }
      parts.push(part);
    }
    let body;
    try {
      body = parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {};
    } catch {
      response.writeHead(400).end();
      return;
    }
    const messages = body.messages ?? [];
    const users = messages.filter((message) => message.role === "user").map(messageText);
    const prompt = users.join("\n");
    const stage = users.at(-1) === U4_COMPANION_INPUT ? "companion" : stageOf(prompt);
    requests.push({
      path: request.url,
      model: body.model,
      native: Boolean(body.tools?.length),
      stage,
      prompt,
      messages,
      at: Date.now(),
    });
    for (const message of messages) {
      if (
        message.role === "tool" &&
        /^pre_z8_u[14]_/.test(message.tool_call_id ?? "") &&
        !toolResults.some((item) => item.id === message.tool_call_id)
      )
        toolResults.push({
          id: message.tool_call_id,
          output: message.content,
          observedAt: Date.now(),
        });
      for (const call of message.tool_calls ?? [])
        if (/^pre_z8_u[14]_/.test(call.id ?? "") && !toolCalls.some((item) => item.id === call.id))
          toolCalls.push({ ...call, observedAt: Date.now() });
    }
    if (!request.url?.includes("chat/completions")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ code: 0, data: request.url?.includes("/scenes") ? [] : { configs: {} } }),
      );
      return;
    }
    try {
      const decision = u4Response({ body, workspace, outputs, holdEnabled });
      if (decision.hold) {
        const entry = {
          id: randomUUID(),
          stage,
          observedAt: Date.now(),
          response,
          stream: body.stream,
          decision,
          delivered: false,
        };
        response.on("close", () => {
          entry.closedAt = Date.now();
        });
        held.push(entry);
        return;
      }
      respond(response, body.stream, decision);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: errors.at(-1), type: "fixture_contract_error" } }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const holds = () =>
    held.map(({ response: _response, decision: _decision, stream: _stream, ...record }) => ({
      ...record,
    }));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    toolResults,
    toolCalls,
    errors,
    outputs,
    holds,
    releaseHeld() {
      for (const entry of held) {
        assert.equal(
          entry.releaseAt,
          undefined,
          "Do not release an owned provider response twice.",
        );
        entry.releaseAt = Date.now();
        entry.connectionOpenAtRelease = !entry.response.destroyed && !entry.response.writableEnded;
        if (entry.connectionOpenAtRelease) {
          respond(entry.response, entry.stream, entry.decision);
          entry.delivered = true;
        }
      }
      return holds();
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

function respond(response, stream, { content = "", call }) {
  const tool_calls = call
    ? [
        {
          index: 0,
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        },
      ]
    : undefined;
  const finish = call ? "tool_calls" : "stop";
  const base = { id: "chatcmpl-pre-z8-u4", created: 1, model: "z1-fixture" };
  if (stream) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const chunk = (delta, finish_reason = null) => ({
      ...base,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason }],
    });
    for (const value of [
      chunk({ role: "assistant" }),
      chunk(call ? { tool_calls } : { content }),
      chunk({}, finish),
    ])
      response.write(`data: ${JSON.stringify(value)}\n\n`);
    response.end("data: [DONE]\n\n");
  } else {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ...base,
        object: "chat.completion",
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
}
