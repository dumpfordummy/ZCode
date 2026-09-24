import assert from "node:assert/strict";
import { INITIAL_SOURCE, SEED_SOURCE, repairedSource } from "./z5-fixture.mjs";
import {
  COMPANION_COMPLETION,
  COMPANION_QUESTION_OPTION,
  COMPANION_TOOL_ID,
} from "./provider-fixture.mjs";

export const IMPLEMENT_PROMPT =
  "Z5_IMPLEMENT: Read MathOps.cs and Runner.cs. Apply the explicitly staged initial synthetic implementation in MathOps.cs only. Preserve the runner. Do not build or run commands; separate native Tool nodes verify it. Return a concise result.";
export const REVIEW_PROMPT =
  "Z5_REVIEW: Read MathOps.cs and results/test-report.json. Review this exact native verification; return the required structured reviewer record and its actual artifact ID. Do not edit or execute commands.\nZ5_VERIFICATION_BEGIN\n{{inputs.verification}}\nZ5_VERIFICATION_END";
export const REPAIR_PROMPT =
  "Z5_REPAIR: Read MathOps.cs. Use this exact previous iteration feedback to make the next bounded synthetic repair in MathOps.cs only. Preserve Runner.cs and tests. Do not build or execute commands.\nZ5_FEEDBACK_BEGIN\n{{inputs.feedback}}\nZ5_FEEDBACK_END";
export const REPAIR_QUESTION = "Continue Z5 repair";
export const REVIEW_QUESTION = "Continue Z5 review";

export function parseBinding(prompt, name) {
  const start = `Z5_${name}_BEGIN\n`,
    end = `\nZ5_${name}_END`;
  const index = prompt.lastIndexOf(start);
  assert.ok(index >= 0, `Actual native ${name} binding is missing.`);
  const finish = prompt.indexOf(end, index + start.length);
  assert.ok(finish > index, `Actual native ${name} binding is incomplete.`);
  return JSON.parse(prompt.slice(index + start.length, finish));
}
const readOutput = (messages, id) => {
  const item = messages.find((message) => message.role === "tool" && message.tool_call_id === id);
  if (!item) return undefined;
  assert.equal(typeof item.content, "string");
  return (
    item.content
      .split("\n")
      .map((line) => line.replace(/^\d+\t/, ""))
      .join("\n")
      .trim() + "\n"
  );
};
export function stageOf(prompt) {
  if (prompt.includes("Z1_COMPANION_TASK")) return "companion";
  return (
    ["implement", "repair", "review", "condition", "route"].find((name) =>
      prompt.includes(`Z5_${name.toUpperCase()}:`),
    ) ?? "other"
  );
}

export function nativeResponse({ body, prompt, stage, workspace, marker, options, state }) {
  const messages = body.messages ?? [],
    tools = body.tools?.map((tool) => tool.function.name) ?? [];
  const seen = (id) =>
    messages.some((message) => message.role === "tool" && message.tool_call_id === id);
  const call = (id, name, args) => {
    const actual = tools.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    assert.ok(actual, `Actual native ${stage} session does not expose ${name}.`);
    return { call: { id, name: actual, arguments: args } };
  };
  const file = (name) => `${workspace.replaceAll("\\", "/")}/${name}`;
  if (!tools.length) return { content: "Z5 controlled fixture" };
  if (stage === "companion") {
    if (seen(COMPANION_TOOL_ID)) return { content: COMPANION_COMPLETION };
    return call(COMPANION_TOOL_ID, "AskUserQuestion", {
      questions: [
        {
          question: "Keep this unrelated Chat pending while Z5 stops its own repair.",
          header: "Z5 companion",
          multiSelect: false,
          options: [
            { label: COMPANION_QUESTION_OPTION, description: "Complete only this unrelated Chat." },
            { label: "Keep waiting", description: "Leave this Chat pending." },
          ],
        },
      ],
    });
  }
  assert.notEqual(stage, "other", "Unrecognized native task in controlled Z5 fixture.");
  const verification = stage === "review" ? parseBinding(prompt, "VERIFICATION") : undefined;
  const feedback = stage === "repair" ? parseBinding(prompt, "FEEDBACK") : undefined;
  const suffix = verification?.iterationId ?? feedback?.previousIterationId ?? "initial";
  const id = (name) => `z5_${stage}_${name}_${suffix}`;
  if (!seen(id("read"))) return call(id("read"), "Read", { file_path: file("MathOps.cs") });
  const source = readOutput(messages, id("read"));
  if (stage === "implement") {
    assert.equal(source, SEED_SOURCE);
    if (!seen(id("runner"))) return call(id("runner"), "Read", { file_path: file("Runner.cs") });
    if (!seen(id("edit")))
      return call(id("edit"), "Edit", {
        file_path: file("MathOps.cs"),
        old_string: SEED_SOURCE.trim(),
        new_string: INITIAL_SOURCE.trim(),
      });
    return {
      content: `Z5 initial native implementation ${marker}; separate Test evidence remains authoritative.`,
    };
  }
  if (stage === "repair") {
    assert.ok(
      feedback.previousIterationId && feedback.sourceDigest,
      "Repair feedback must identify prior iteration and source.",
    );
    assert.ok(
      Array.isArray(feedback.findings) && feedback.findings.length > 0,
      "Repair must receive actual prior findings.",
    );
    assert.equal(feedback.observations.length, 1);
    const prior = feedback.observations[0];
    assert.equal(prior.artifactId, prior.value.artifactId);
    assert.equal(prior.value.iterationId, feedback.previousIterationId);
    assert.equal(prior.value.sourceDigest, feedback.sourceDigest);
    assert.equal(prior.value.outcome, "fail");
    assert.equal(prior.value.tests.length, 3);
    if (options.holdRepair && !seen(id("question")))
      return call(id("question"), "AskUserQuestion", {
        questions: [
          {
            question: "The next repair is pending; only this graph owns it.",
            header: "Z5 repair",
            multiSelect: false,
            options: [
              { label: REPAIR_QUESTION, description: "Continue this exact repair input." },
              { label: "Keep repair waiting", description: "Do not edit yet." },
            ],
          },
        ],
      });
    const target = repairedSource(source, options.scenario);
    if (target !== source && !seen(id("edit")))
      return call(id("edit"), "Edit", {
        file_path: file("MathOps.cs"),
        old_string: source.trim(),
        new_string: target.trim(),
      });
    return {
      content: `Z5 bounded native repair ${marker}; verify current source with the configured tools.`,
    };
  }
  if (stage === "review") {
    for (const name of [
      "artifactId",
      "runId",
      "nodeId",
      "attemptId",
      "iterationId",
      "operationId",
      "sourceDigest",
      "buildDigest",
    ])
      assert.equal(typeof verification[name], "string", `Verification lacks ${name}.`);
    assert.ok(["pass", "fail"].includes(verification.outcome));
    assert.equal(verification.tests.length, 3);
    if (!seen(id("report")))
      return call(id("report"), "Read", { file_path: file("results/test-report.json") });
    const report = JSON.parse(readOutput(messages, id("report")));
    assert.equal(report.operationId, verification.operationId);
    assert.equal(report.sourceDigest, verification.sourceDigest);
    assert.equal(report.buildDigest, verification.buildDigest);
    assert.deepEqual(report.tests, verification.tests);
    if (options.holdReview && !seen(id("question")))
      return call(id("question"), "AskUserQuestion", {
        questions: [
          {
            question: "Review is pending before the current condition decision.",
            header: "Z5 review",
            multiSelect: false,
            options: [
              { label: REVIEW_QUESTION, description: "Finish this exact review input." },
              { label: "Keep review waiting", description: "Do not finish yet." },
            ],
          },
        ],
      });
    if (options.scenario === "invalid-json")
      return { content: '{"outcome":"pass","outcome":"needs_changes"}' };
    state.firstVerification ??= verification.artifactId;
    const outcome =
      options.scenario === "reviewer-pass"
        ? "pass"
        : verification.outcome === "pass"
          ? "pass"
          : "needs_changes";
    const result = {
      outcome,
      findings: verification.tests
        .filter((item) => item.status === "failed")
        .map((item) => ({ code: item.name, message: item.message })),
      evidenceReferences: [
        options.scenario === "old-artifact" ? state.firstVerification : verification.artifactId,
      ],
    };
    return { content: JSON.stringify(result) };
  }
  if (stage === "condition")
    return { content: JSON.stringify(options.conditionValue ?? { ready: true, count: 3 }) };
  return {
    content: `Z5 selected native route ${marker}: ${prompt.match(/route=([a-z-]+)/)?.[1] ?? "merge"}`,
  };
}
