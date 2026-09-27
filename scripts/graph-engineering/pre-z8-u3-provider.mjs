import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { nativeResponse, outputsFor, stageOf } from "./pre-z8-u1-responses.mjs";

export const U3_BRACES = "Literal predecessor data {{inputs.not_bound}} and {{nested braces}}.";
export const U3_LATER_INPUT =
  "PRE_Z8_U3_LATER_CHAT: Reply only with the controlled later-Chat marker. Do not read, edit, execute or modify any Graph record.";
export const U3_LATER_OUTPUT =
  "PRE_Z8_U3_LATER_CHAT_OUTPUT: This later ordinary Chat reply cannot replace the immutable Graph handoff.";
const messageText = (message) =>
  typeof message.content === "string" ? message.content : JSON.stringify(message.content);
export const u3FixtureOutputs = (marker) => {
  const outputs = outputsFor(marker);
  return Object.freeze({ ...outputs, analyze: `${outputs.analyze}\n${U3_BRACES}` });
};

export function u3Response({ body, workspace, outputs }) {
  const users = (body.messages ?? []).filter((message) => message.role === "user").map(messageText);
  if (users.at(-1) === U3_LATER_INPUT) return { content: U3_LATER_OUTPUT };
  assert.ok(
    !users.includes(U3_LATER_INPUT),
    "Unrecognized input after the explicit later-Chat request.",
  );
  return nativeResponse({ body, prompt: users.join("\n"), workspace, outputs });
}

/** Synthetic loopback only; real native tools own every Read, question, Edit and input. */
export async function startU3Fixture(workspace) {
  const requests = [],
    toolResults = [],
    toolCalls = [],
    errors = [];
  const outputs = u3FixtureOutputs(`PRE_Z8_U3_${randomUUID()}`);
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
    const prompt = messages
      .filter((message) => message.role === "user")
      .map(messageText)
      .join("\n");
    requests.push({
      path: request.url,
      model: body.model,
      stage: stageOf(prompt),
      native: Boolean(body.tools?.length),
      prompt,
      messages,
      at: Date.now(),
    });
    for (const message of messages) {
      if (
        message.role === "tool" &&
        message.tool_call_id?.startsWith("pre_z8_u1_") &&
        !toolResults.some((item) => item.id === message.tool_call_id)
      )
        toolResults.push({
          id: message.tool_call_id,
          output: message.content,
          observedAt: Date.now(),
        });
      for (const call of message.tool_calls ?? [])
        if (call.id?.startsWith("pre_z8_u1_") && !toolCalls.some((item) => item.id === call.id))
          toolCalls.push({ ...call, observedAt: Date.now() });
    }
    if (!request.url.includes("chat/completions")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ code: 0, data: request.url.includes("/scenes") ? [] : { configs: {} } }),
      );
      return;
    }
    try {
      respond(response, body.stream, u3Response({ body, workspace, outputs }));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: errors.at(-1), type: "fixture_contract_error" } }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    toolResults,
    toolCalls,
    errors,
    outputs,
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
  const base = { id: "chatcmpl-pre-z8-u3", created: 1, model: "z1-fixture" };
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
