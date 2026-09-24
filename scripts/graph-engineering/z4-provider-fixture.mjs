import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  COMPANION_COMPLETION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";

export const Z4_IMPLEMENT =
  "Z4_IMPLEMENT: Read MathOps.cs and Runner.cs. Change only MathOps.cs so Add returns left + right. Preserve all tests. Do not build or run commands; separate native Tool nodes do that. Return the requested final JSON object.";
export const Z4_REVIEW =
  "Z4_REVIEW: Read MathOps.cs. Do not edit source or run commands. Return the requested reviewer record; machine test evidence remains separate.";
export const Z4_DOWNSTREAM =
  "Z4_DOWNSTREAM: Read MathOps.cs. This explicit prior-artifact binding is supporting context: {{inputs.review}}";
export const Z4_TOOL_REVIEW =
  "Z4_TOOL_REVIEW: Read MathOps.cs. Review this exact native test artifact: {{inputs.verification}}. Return your reviewer opinion without editing files or running commands. Native test evidence remains authoritative.";

/** Loopback model responses only; native services execute every Read/Edit/question. */
export async function startZ4Fixture(workspace, options = {}) {
  const marker = `Z4_FRESH_REVIEW_${randomUUID()}`;
  const output =
    options.output ??
    JSON.stringify({
      outcome: "pass",
      summary: options.html
        ? `${marker} <img id="z4-artifact-injected" src=x onerror="window.z4Injected=true">`
        : marker,
      findings: [],
    });
  const requests = [],
    toolResults = [],
    errors = [];
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
    const messages = body.messages ?? [];
    const prompt = messages
      .filter((message) => message.role === "user")
      .map((message) =>
        typeof message.content === "string" ? message.content : JSON.stringify(message.content),
      )
      .join("\n");
    const tools = body.tools?.map((tool) => tool.function.name) ?? [];
    const native = tools.length > 0;
    const stage = prompt.includes("Z1_COMPANION_TASK")
      ? "companion"
      : prompt.includes("Z4_TOOL_REVIEW:")
        ? "tool_review"
        : prompt.includes("Z4_DOWNSTREAM:")
          ? "downstream"
          : prompt.includes("Z4_IMPLEMENT:")
            ? "implement"
            : prompt.includes("Z4_REVIEW:")
              ? "review"
              : "other";
    for (const message of messages)
      if (
        message.role === "tool" &&
        /^(z4_|z1_companion_question)/.test(message.tool_call_id ?? "") &&
        !toolResults.some((result) => result.id === message.tool_call_id)
      )
        toolResults.push({
          id: message.tool_call_id,
          output: message.content,
          observedAt: Date.now(),
        });
    requests.push({ path: request.url, model: body.model, native, stage, prompt, at: Date.now() });
    if (!request.url.includes("chat/completions")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ code: 0, data: request.url.includes("/scenes") ? [] : { configs: {} } }),
      );
      return;
    }
    try {
      const tool = (name) => {
        const actual = tools.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
        if (!actual) throw new Error(`Actual native ${stage} task did not expose ${name}.`);
        return actual;
      };
      const seen = (id) =>
        messages.some((message) => message.role === "tool" && message.tool_call_id === id);
      const file = (name) => `${workspace.replaceAll("\\", "/")}/${name}`;
      let content = "Z4 loopback fixture",
        call;
      if (native && stage === "companion") {
        if (seen(COMPANION_TOOL_ID)) content = COMPANION_COMPLETION;
        else
          call = {
            id: COMPANION_TOOL_ID,
            name: tool("AskUserQuestion"),
            arguments: {
              questions: [
                {
                  question:
                    "Keep this unrelated Chat pending while the graph operation is cancelled.",
                  header: "Z4 companion",
                  multiSelect: false,
                  options: [
                    {
                      label: COMPANION_QUESTION_OPTION,
                      description: "Complete only this unrelated Chat.",
                    },
                    { label: "Keep waiting", description: "Keep this Chat pending." },
                  ],
                },
              ],
            },
          };
      } else if (native && stage !== "other") {
        if (
          stage === "tool_review" &&
          (!prompt.includes('"testCount":3') || !prompt.includes('"passed":3'))
        )
          throw new Error(
            "The native reviewer did not receive the complete positive native test artifact.",
          );
        if (stage === "downstream" && !prompt.includes(marker))
          throw new Error("The downstream task did not receive the exact fresh artifact field.");
        if (!seen(`z4_${stage}_read`))
          call = {
            id: `z4_${stage}_read`,
            name: tool("Read"),
            arguments: { file_path: file("MathOps.cs") },
          };
        else if (stage === "implement" && !seen("z4_runner_read"))
          call = {
            id: "z4_runner_read",
            name: tool("Read"),
            arguments: { file_path: file("Runner.cs") },
          };
        else if (stage === "implement" && !seen("z4_source_edit"))
          call = {
            id: "z4_source_edit",
            name: tool("Edit"),
            arguments: {
              file_path: file("MathOps.cs"),
              old_string: "left + right + 1;",
              new_string: "left + right;",
            },
          };
        else content = stage === "downstream" ? `Z4_BOUND_FIELD_RECEIVED ${marker}` : output;
      }
      respond(response, body.stream, content, call);
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
    output,
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

function respond(response, stream, content, call) {
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
  const finishReason = call ? "tool_calls" : "stop";
  if (stream) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const chunk = (delta, finish_reason = null) => ({
      id: "chatcmpl-z4-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "z1-fixture",
      choices: [{ index: 0, delta, finish_reason }],
    });
    for (const item of [
      chunk({ role: "assistant" }),
      chunk(call ? { tool_calls } : { content }),
      chunk({}, finishReason),
    ])
      response.write(`data: ${JSON.stringify(item)}\n\n`);
    response.end("data: [DONE]\n\n");
  } else {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: "chatcmpl-z4-fixture",
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
            finish_reason: finishReason,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    );
  }
}
