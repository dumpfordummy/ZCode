import http from "node:http";
import { randomUUID } from "node:crypto";
import { nativeResponse, stageOf } from "./z6-provider-responses.mjs";

/** Model test replies only: existing native sessions own every real tool operation. */
export async function startZ6Fixture(workspace, scenario) {
  const requests = [],
    toolResults = [],
    errors = [],
    marker = `Z6_NATIVE_${randomUUID()}`;
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      response.writeHead(400).end();
      return;
    }
    const prompt = (body.messages ?? [])
      .filter((message) => message.role === "user")
      .map((message) =>
        typeof message.content === "string" ? message.content : JSON.stringify(message.content),
      )
      .join("\n");
    const stage = stageOf(prompt),
      native = (body.tools?.length ?? 0) > 0;
    requests.push({ path: request.url, model: body.model, stage, native, prompt, at: Date.now() });
    for (const message of body.messages ?? [])
      if (
        message.role === "tool" &&
        (message.tool_call_id ?? "").startsWith("z6_") &&
        !toolResults.some((item) => item.id === message.tool_call_id)
      )
        toolResults.push({
          id: message.tool_call_id,
          output: message.content,
          observedAt: Date.now(),
        });
    if (!request.url.includes("chat/completions")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ code: 0, data: request.url.includes("/scenes") ? [] : { configs: {} } }),
      );
      return;
    }
    try {
      respond(response, body.stream, nativeResponse({ body, prompt, stage, workspace, scenario }));
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
    marker,
    requests,
    toolResults,
    errors,
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
  if (stream) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const chunk = (delta, finish_reason = null) => ({
      id: "chatcmpl-z6-fixture",
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
      response.write(`data: ${JSON.stringify(item)}\n\n`);
    response.end("data: [DONE]\n\n");
  } else {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: "chatcmpl-z6-fixture",
        object: "chat.completion",
        created: 1,
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
}
