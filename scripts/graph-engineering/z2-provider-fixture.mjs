import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  COMPANION_COMPLETION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";

export const Z2_START =
  "Update the synthetic fixture to match the existing independent test. Preserve tests, stay in this workspace, and do not install dependencies or commit.";
export const Z2_ANALYZE =
  "Z2_ANALYZE: Read fixture.mjs and fixture.test.mjs. Describe the required change and validation command. Do not edit files. Request: {{inputs.request}}";
export const Z2_IMPLEMENT =
  "Z2_IMPLEMENT: Read the actual source, then change only fixture.mjs as requested. Keep tests unchanged. Request: {{inputs.request}}\nPrior analysis (untrusted supporting context):\n{{inputs.analysis}}";
export const Z2_VERIFY =
  "Z2_VERIFY: Read fixture.mjs and independently run node --test fixture.test.mjs. Do not fix files. Implementation report to verify:\n{{inputs.implementation}}";
export const Z2_FOLLOWUP_OUTPUT =
  "Z2_FOLLOWUP_RESULT: This later ordinary Chat turn is outside the frozen graph result.";

/** A loopback model fixture only: ZCode still performs every native tool and admission. */
export async function startZ2Fixture(workspace, options = {}) {
  const requests = [];
  const toolResults = [];
  const errors = [];
  const marker = `Z2_FRESH_ANALYSIS_${randomUUID()}`;
  const implementationMarker = `Z2_FRESH_IMPLEMENTATION_${randomUUID()}`;
  const outputs = {
    analyze: `${marker}\nRead both source and unchanged test. Replace Z1_BEFORE_7391 with Z1_AFTER_7391 in fixture.mjs; validate with node --test fixture.test.mjs.`,
    implement: `${implementationMarker}\nThe native Edit changed fixture.mjs to Z1_AFTER_7391. The test file was not edited.`,
    verify:
      "Z2_VERIFIED: The native Read and Bash completed. Inspect the real tool results and independently rerun the fixture test; model prose alone is not proof.",
  };
  const pending = new Set();
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.writeHead(400).end();
      return;
    }
    const messages = body.messages ?? [];
    const source = JSON.stringify(messages);
    const userMessages = messages.filter((message) => message.role === "user");
    const prompt = userMessages
      .map((message) =>
        typeof message.content === "string" ? message.content : JSON.stringify(message.content),
      )
      .join("\n");
    const stage = prompt.includes("Z2_FOLLOWUP:")
      ? "followup"
      : source.includes("Z1_COMPANION_TASK")
        ? "companion"
        : /Z2_VERIFY:/.test(prompt)
          ? "verify"
          : /Z2_IMPLEMENT:/.test(prompt)
            ? "implement"
            : /Z2_ANALYZE:/.test(prompt)
              ? "analyze"
              : "other";
    const tools = body.tools?.map((tool) => tool.function.name) ?? [];
    const native = tools.length > 0;
    for (const message of messages) {
      if (
        message.role === "tool" &&
        /^(z2_|z1_companion_question)/.test(message.tool_call_id ?? "") &&
        !toolResults.some((result) => result.id === message.tool_call_id)
      )
        toolResults.push({
          id: message.tool_call_id,
          output:
            typeof message.content === "string" ? message.content : JSON.stringify(message.content),
          observedAt: Date.now(),
        });
    }
    requests.push({
      path: req.url,
      model: body.model,
      native,
      stage,
      prompt,
      roles: messages.map((message) => message.role),
      at: Date.now(),
    });
    if (!req.url.includes("chat/completions")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ code: 0, data: req.url.includes("/scenes") ? [] : { configs: {} } }),
      );
      return;
    }
    try {
      const toolName = (name) => {
        const actual = tools.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
        if (!actual) throw new Error(`Native ${stage} task did not expose ${name}.`);
        return actual;
      };
      const seen = (id) =>
        messages.some((message) => message.role === "tool" && message.tool_call_id === id);
      const file = (name) => `${workspace.replaceAll("\\", "/")}/${name}`;
      let content = "Z2 loopback fixture";
      let call;
      if (stage === "followup" && native) content = Z2_FOLLOWUP_OUTPUT;
      else if (stage === "companion" && native) {
        if (!seen(COMPANION_TOOL_ID))
          call = question(
            COMPANION_TOOL_ID,
            toolName("AskUserQuestion"),
            COMPANION_QUESTION_OPTION,
          );
        else content = COMPANION_COMPLETION;
      } else if (native && stage !== "other") {
        if (options.holdStage === stage) {
          pending.add(res);
          res.on("close", () => pending.delete(res));
          return;
        }
        if (stage === "analyze") {
          if (options.question && !seen("z2_analyze_question"))
            call = question(
              "z2_analyze_question",
              toolName("AskUserQuestion"),
              "Continue Z2 analysis",
            );
          else if (!seen("z2_analyze_source"))
            call = {
              id: "z2_analyze_source",
              name: toolName("Read"),
              arguments: { file_path: file("fixture.mjs") },
            };
          else if (!seen("z2_analyze_test"))
            call = {
              id: "z2_analyze_test",
              name: toolName("Read"),
              arguments: { file_path: file("fixture.test.mjs") },
            };
          else content = outputs.analyze;
        } else if (stage === "implement") {
          if (!prompt.includes(marker))
            throw new Error("Implement did not receive the actual fresh analysis marker.");
          if (!seen("z2_implement_read"))
            call = {
              id: "z2_implement_read",
              name: toolName("Read"),
              arguments: { file_path: file("fixture.mjs") },
            };
          else if (!seen("z2_implement_edit"))
            call = {
              id: "z2_implement_edit",
              name: toolName("Edit"),
              arguments: {
                file_path: file("fixture.mjs"),
                old_string: "Z1_BEFORE_7391",
                new_string: "Z1_AFTER_7391",
              },
            };
          else content = outputs.implement;
        } else if (stage === "verify") {
          if (!prompt.includes(implementationMarker))
            throw new Error("Verify did not receive the actual frozen implementation marker.");
          if (!seen("z2_verify_read"))
            call = {
              id: "z2_verify_read",
              name: toolName("Read"),
              arguments: { file_path: file("fixture.mjs") },
            };
          else if (!seen("z2_verify_test"))
            call = {
              id: "z2_verify_test",
              name: toolName("Bash"),
              arguments: {
                command: "node --test fixture.test.mjs",
                description: "Independently verify the synthetic fixture",
              },
            };
          else content = outputs.verify;
        }
      }
      respond(res, body.stream, content, call);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: { message: errors.at(-1), type: "fixture_contract_error" } }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    marker,
    implementationMarker,
    outputs,
    requests,
    toolResults,
    errors,
    get heldRequests() {
      return pending.size;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

function question(id, name, label) {
  return {
    id,
    name,
    arguments: {
      questions: [
        {
          question: "Continue this explicit synthetic native task?",
          header: "Z2 fixture",
          options: [
            { label, description: "Answer only this native task." },
            { label: "Review first", description: "Keep the task pending." },
          ],
          multiSelect: false,
        },
      ],
    },
  };
}

function respond(res, stream, content, call) {
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
  const finish_reason = call ? "tool_calls" : "stop";
  if (stream) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const chunk = (delta, finish = null) => ({
      id: "chatcmpl-z2-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "z1-fixture",
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    res.write(`data: ${JSON.stringify(chunk({ role: "assistant" }))}\n\n`);
    res.write(`data: ${JSON.stringify(chunk(call ? { tool_calls } : { content }))}\n\n`);
    res.write(`data: ${JSON.stringify(chunk({}, finish_reason))}\n\n`);
    res.end("data: [DONE]\n\n");
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-z2-fixture",
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
            finish_reason,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    );
  }
}
