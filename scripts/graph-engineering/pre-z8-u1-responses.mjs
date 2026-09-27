import assert from "node:assert/strict";

export const QUESTION_OPTION = "Apply the synthetic edit";
export const REQUEST =
  "Change only fixture.mjs from Z1_BEFORE_7391 to Z1_AFTER_7391. Preserve fixture.test.mjs and all unrelated source. Ask before the edit. This is agent-led review: no configured tests, commands, installs, commits or publication.";
export const stageOf = (prompt) => /^Workflow task: ([a-z-]+)\./m.exec(prompt)?.[1] ?? "other";
export const outputsFor = (marker) => ({
  analyze: `${marker}_ANALYSIS: Native Read observed Z1_BEFORE_7391 in fixture.mjs. Change only that marker to Z1_AFTER_7391 and preserve fixture.test.mjs. Configured tests are not included.`,
  implement: `${marker}_IMPLEMENTED: Native Edit confirmed the requested marker change in fixture.mjs. No test command ran; configured tests are not included. Independent source review is still required.`,
  review: `${marker}_REVIEW: Fresh native Read observed the requested Z1_AFTER_7391 source. Agent-led source review only. Tests are not configured and were not run. Human review is still required.`,
});

function toolText(messages, id) {
  const result = messages.find((message) => message.role === "tool" && message.tool_call_id === id);
  assert.equal(typeof result?.content, "string", `Actual native result ${id} is unavailable.`);
  return result.content
    .split("\n")
    .map((line) => line.replace(/^\d+\t/, ""))
    .join("\n")
    .trim();
}
function exactHandoff(prompt, text) {
  assert.ok(prompt.includes(text), "The actual predecessor handoff is missing.");
  assert.equal(prompt.split(text).length - 1, 1, "The actual handoff must appear exactly once.");
}

/** Controlled replies request existing native tools; they never edit source or invent evidence. */
export function nativeResponse({ body, prompt, workspace, outputs }) {
  const names = (body.tools ?? []).map((tool) => tool.function.name);
  if (!names.length) return { content: "Pre-Z8 controlled agent-assisted fixture" };
  const stage = stageOf(prompt);
  assert.ok(
    ["analyze", "implement", "review"].includes(stage),
    `Unrecognized native task: ${stage}`,
  );
  if (stage !== "analyze") exactHandoff(prompt, outputs.analyze);
  if (stage === "review") exactHandoff(prompt, outputs.implement);
  const messages = body.messages ?? [];
  const id = (name) => `pre_z8_u1_${stage}_${name}`;
  const seen = (name) =>
    messages.some((message) => message.role === "tool" && message.tool_call_id === id(name));
  const call = (name, tool, args) => {
    const actual = names.find((candidate) => candidate.toLowerCase() === tool.toLowerCase());
    assert.ok(actual, `Actual ${stage} session lacks ${tool}.`);
    return { call: { id: id(name), name: actual, arguments: args } };
  };
  const source = `${workspace.replaceAll("\\", "/")}/fixture.mjs`;
  if (!seen("read")) return call("read", "Read", { file_path: source });
  const expected = stage === "review" ? "Z1_AFTER_7391" : "Z1_BEFORE_7391";
  assert.equal(
    toolText(messages, id("read")),
    `export const marker = '${expected}';`,
    "Unexpected actual source.",
  );
  if (stage !== "implement") return { content: outputs[stage] };
  if (!seen("question"))
    return call("question", "AskUserQuestion", {
      questions: [
        {
          question: "Allow the requested synthetic marker edit without running commands or tests?",
          header: "Marker edit",
          options: [
            {
              label: QUESTION_OPTION,
              description: "Change only fixture.mjs using the native Edit tool.",
            },
            { label: "Keep waiting", description: "Do not authorize this synthetic edit yet." },
          ],
          multiSelect: false,
        },
      ],
    });
  assert.ok(
    toolText(messages, id("question")).includes(QUESTION_OPTION),
    "The native question did not authorize the fixture edit.",
  );
  if (!seen("edit"))
    return call("edit", "Edit", {
      file_path: source,
      old_string: "Z1_BEFORE_7391",
      new_string: "Z1_AFTER_7391",
    });
  // 原生 Edit 已更新 read-state；立即重读会返回缓存提示，独立 Review 会话负责再次读取真实源码。
  assert.equal(
    toolText(messages, id("edit")),
    `The file ${source} has been updated successfully. (file state is current in your context — no need to Read it back)`,
    "Exact successful native Edit result for the intended source is unavailable.",
  );
  return { content: outputs.implement };
}
