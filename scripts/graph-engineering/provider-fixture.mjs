import http from "node:http";

const COMPANION_MARKER = "Z1_COMPANION_TASK";
export const COMPANION_TOOL_ID = "z1_companion_question";
export const COMPANION_QUESTION_OPTION = "Complete companion";
export const COMPANION_INSTRUCTION = `${COMPANION_MARKER}: Ask for explicit confirmation and wait. This ordinary chat is independent of the Graph Engineering task. Do not edit files or run commands.`;
export const COMPANION_COMPLETION =
  "Z1_COMPANION_COMPLETED: The unrelated native chat received its explicit answer after graph cancellation.";

export async function startFixture(workspace) {
  const requests = [];
  const toolResults = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {}
    const messages = body.messages ?? [];
    for (const item of messages) {
      if (
        item.role === "tool" &&
        (/^z1_fixture_(read|edit|test|question)$/.test(item.tool_call_id ?? "") ||
          item.tool_call_id === COMPANION_TOOL_ID) &&
        !toolResults.some((result) => result.id === item.tool_call_id)
      )
        toolResults.push({
          id: item.tool_call_id,
          output:
            typeof item.content === "string"
              ? item.content.slice(0, 6000)
              : JSON.stringify(item.content).slice(0, 6000),
        });
    }
    const source = JSON.stringify(messages);
    requests.push({
      path: req.url,
      model: body.model,
      stream: body.stream,
      roles: messages.map((message) => message.role),
      scenario: source.includes(COMPANION_MARKER) ? "companion" : "graph-fixture",
    });
    if (!req.url.includes("chat/completions")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ code: 0, data: req.url.includes("/scenes") ? [] : { configs: {} } }),
      );
      return;
    }
    const marker = "Z1_SYNTHETIC_TASK";
    let content = "Z1 local provider fixture";
    let call;
    if (source.includes(COMPANION_MARKER) && (body.tools?.length ?? 0) > 0) {
      if (!source.includes(COMPANION_TOOL_ID)) {
        const name = body.tools
          .map((tool) => tool.function.name)
          .find((candidate) => candidate.toLowerCase() === "askuserquestion");
        if (!name) throw new Error("Native companion task did not expose AskUserQuestion.");
        call = {
          id: COMPANION_TOOL_ID,
          name,
          arguments: {
            questions: [
              {
                question:
                  "Confirm this unrelated native chat still waits after cancelling the graph.",
                header: "Z1 companion",
                options: [
                  {
                    label: COMPANION_QUESTION_OPTION,
                    description: "Answer only this independent synthetic chat question.",
                  },
                  { label: "Keep waiting", description: "Leave this independent chat pending." },
                ],
                multiSelect: false,
              },
            ],
          },
        };
      } else content = COMPANION_COMPLETION;
    } else if (source.includes(marker) && (body.tools?.length ?? 0) > 0) {
      const tools = body.tools.map((tool) => tool.function.name);
      const toolName = (name) =>
        tools.find((candidate) => candidate.toLowerCase() === name.toLowerCase()) ?? name;
      if (source.includes("Z1_QUESTION_TASK") && !source.includes("z1_fixture_question"))
        call = {
          id: "z1_fixture_question",
          name: toolName("AskUserQuestion"),
          arguments: {
            questions: [
              {
                question: "Continue the synthetic marker verification?",
                header: "Z1 fixture",
                options: [
                  {
                    label: "Continue fixture",
                    description: "Run the synthetic Read, Edit and test sequence.",
                  },
                  {
                    label: "Review first",
                    description: "Review the synthetic task before continuing.",
                  },
                ],
                multiSelect: false,
              },
            ],
          },
        };
      else if (!source.includes("z1_fixture_read"))
        call = {
          id: "z1_fixture_read",
          name: toolName("Read"),
          arguments: { file_path: workspace.replaceAll("\\", "/") + "/fixture.mjs" },
        };
      else if (!source.includes("z1_fixture_edit"))
        call = {
          id: "z1_fixture_edit",
          name: toolName("Edit"),
          arguments: {
            file_path: workspace.replaceAll("\\", "/") + "/fixture.mjs",
            old_string: "Z1_BEFORE_7391",
            new_string: "Z1_AFTER_7391",
          },
        };
      else if (!source.includes("z1_fixture_test"))
        call = {
          id: "z1_fixture_test",
          name: toolName("Bash"),
          arguments: {
            command: "node --test fixture.test.mjs",
            description: "Run the synthetic marker test",
          },
        };
      else
        content =
          "Controlled provider finished the native Read, Edit, and Bash sequence. Inspect the actual tool results and fixture file; model prose is not verification.";
    }
    const delta = call
      ? {
          tool_calls: [
            {
              index: 0,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            },
          ],
        }
      : { content };
    if (body.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const chunk = (delta, finish_reason = null) => ({
        id: "chatcmpl-z1-fixture",
        object: "chat.completion.chunk",
        created: 1,
        model: "z1-fixture",
        choices: [{ index: 0, delta, finish_reason }],
      });
      res.write(`data: ${JSON.stringify(chunk({ role: "assistant" }))}\n\n`);
      res.write(`data: ${JSON.stringify(chunk(delta))}\n\n`);
      res.write(`data: ${JSON.stringify(chunk({}, call ? "tool_calls" : "stop"))}\n\n`);
      res.end("data: [DONE]\n\n");
    } else {
      const message = call
        ? {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              },
            ],
          }
        : { role: "assistant", content };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-z1-fixture",
          object: "chat.completion",
          created: 1,
          model: "z1-fixture",
          choices: [{ index: 0, message, finish_reason: call ? "tool_calls" : "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    toolResults,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

export function providerConfig(origin) {
  return {
    schemaVersion: 1,
    config: {
      providerConfigRules: {
        providerRules: [
          {
            providerId: "z1-local-fixture",
            providerName: "Z1 loopback fixture",
            enabled: true,
            config: {
              group: "standard-personal",
              access: { type: "api-key", apiKey: "synthetic-test-only" },
              api: { type: "openai-chat-completions", baseUrl: `${origin}/v1` },
              personalModelIds: ["z1-fixture"],
              modelOrder: ["z1-fixture"],
            },
          },
        ],
      },
      modelConfigRules: {
        providerModelRules: [
          { providerId: "z1-local-fixture", modelId: "z1-fixture", config: { enabled: true } },
        ],
        manualProviderModelRules: [],
      },
      defaultModelSelection: { providerId: "z1-local-fixture", modelId: "z1-fixture" },
    },
  };
}
