import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GOOD_SOURCE, INITIAL_SOURCE, SEED_SOURCE, repairedSource } from "./z5-fixture.mjs";
import {
  FREE_BAD,
  FREE_GOOD,
  GAME_DOC,
  GOOD_SLOT_SOURCE,
  NORMAL_BAD,
  NORMAL_GOOD,
  NORMAL_ONLY_SOURCE,
  RULE_TESTS,
  SEED_SLOT_SOURCE,
} from "./z6-slot-source.mjs";

export const stageOf = (prompt) => /^Workflow task: ([a-z-]+)\./m.exec(prompt)?.[1] ?? "other";
export function parseNativeBinding(prompt, name) {
  const marker = `${name}:\n`,
    at = prompt.lastIndexOf(marker);
  assert.ok(at >= 0, `Actual ${name} handoff is missing.`);
  const source = prompt.slice(at + marker.length).trimStart();
  assert.equal(source[0], "{", `Actual ${name} handoff must be JSON.`);
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(0, index + 1));
    }
  }
  throw new Error(`Actual ${name} handoff is incomplete.`);
}
function readOutput(messages, id) {
  const message = messages.find((item) => item.role === "tool" && item.tool_call_id === id);
  assert.equal(typeof message?.content, "string", `Native tool ${id} did not return text.`);
  return (
    message.content
      .split("\n")
      .map((line) => line.replace(/^\d+\t/, ""))
      .join("\n")
      .trim() + "\n"
  );
}
export function nativeResponse({ body, prompt, stage, workspace, scenario }) {
  const tools = body.tools?.map((tool) => tool.function.name) ?? [],
    messages = body.messages ?? [];
  if (!tools.length) return { content: "Z6 controlled workflow fixture" };
  assert.ok(
    [
      "analyze",
      "implement",
      "repair",
      "plan",
      "normal",
      "free",
      "cross-review",
      "reviewer",
    ].includes(stage),
    `Unrecognized controlled native task: ${stage}`,
  );
  const seen = (id) => messages.some((item) => item.role === "tool" && item.tool_call_id === id);
  const call = (id, name, args) => {
    const actual = tools.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    assert.ok(actual, `Actual ${stage} session lacks ${name}.`);
    return { call: { id, name: actual, arguments: args } };
  };
  const file = (name) => `${workspace.replaceAll("\\", "/")}/${name}`;
  const verification =
    stage === "reviewer" ? parseNativeBinding(prompt, "verification") : undefined;
  const feedback = stage === "repair" ? parseNativeBinding(prompt, "feedback") : undefined;
  const suffix = verification?.operationId ?? feedback?.previousIterationId;
  const id = (name) => `z6_${stage}_${name}${suffix ? `_${suffix}` : ""}`;
  const sourceName = scenario === "slot" ? "SlotRules.cs" : "MathOps.cs";
  if (scenario === "generic" && stage === "implement") {
    assert.ok(
      prompt.includes("fixture-guidance"),
      "The chosen actual native skill reference must be visible in the compiled input.",
    );
    if (!seen(id("skill"))) return call(id("skill"), "Skill", { skill: "fixture-guidance" });
    assert.ok(readOutput(messages, id("skill")).includes("Z6_NATIVE_SKILL_AUTHORITY"));
  }
  if (!seen(id("source"))) return call(id("source"), "Read", { file_path: file(sourceName) });
  const source = readOutput(messages, id("source"));
  if (scenario === "generic" && ["analyze", "implement"].includes(stage)) {
    if (!seen(id("instructions")))
      return call(id("instructions"), "Read", { file_path: file("ExtraInstructions.md") });
    assert.ok(readOutput(messages, id("instructions")).includes("Z6_EXTRA_INSTRUCTIONS"));
  }
  if (stage === "reviewer") {
    for (const field of [
      "artifactId",
      "runId",
      "nodeId",
      "attemptId",
      "iterationId",
      "operationId",
      "sourceDigest",
      "buildDigest",
    ])
      assert.equal(typeof verification[field], "string", `Verification lacks ${field}.`);
    if (!seen(id("report")))
      return call(id("report"), "Read", { file_path: file("results/test-report.json") });
    const report = JSON.parse(readOutput(messages, id("report")));
    for (const field of ["operationId", "sourceDigest", "buildDigest"])
      assert.equal(report[field], verification[field]);
    assert.deepEqual(report.tests, verification.tests);
    assert.ok(report.tests.length > 0);
    return {
      content: JSON.stringify({
        outcome: verification.outcome === "pass" ? "pass" : "needs_changes",
        findings: report.tests
          .filter((item) => item.status === "failed")
          .map((item) => ({
            code: item.name,
            message: `${scenario === "slot" ? `GameDoc.md#${item.name.match(/R[1-5]/)?.[0] ?? "unknown"}` : "Runner.cs"}: ${item.message}`,
          })),
        evidenceReferences: [verification.artifactId],
      }),
    };
  }
  if (scenario === "slot") {
    if (!seen(id("authority")))
      return call(id("authority"), "Read", { file_path: file("GameDoc.md") });
    assert.equal(readOutput(messages, id("authority")), GAME_DOC);
    if (stage === "analyze") {
      assert.equal(source, SEED_SLOT_SOURCE);
      return {
        content: JSON.stringify({
          rules: Object.entries(RULE_TESTS).map(([rule, tests]) => ({
            id: rule,
            source: `GameDoc.md#${rule}`,
            tests,
          })),
          authorityDigest: createHash("sha256").update(GAME_DOC).digest("hex"),
          affectedBehaviors: ["Normal", "Free"],
          excluded: [
            { behavior: "Bonus", reason: "GameDoc.md Explicit exclusions: absent" },
            { behavior: "Respin", reason: "GameDoc.md Explicit exclusions: absent" },
          ],
          unknowns: ["RTP target and sampling rule not supplied; no comparison or certification."],
        }),
      };
    }
    if (stage === "plan") {
      assert.ok(
        prompt.includes("GameDoc.md#R1"),
        "Plan must receive actual Analyze source-linked handoff.",
      );
      return {
        content:
          "Source-linked plan: SlotState owns TotalWin, FreeSpins, Retriggers and Stopped. Normal implements GameDoc.md#R1 and #R2; Free implements GameDoc.md#R3; both preserve #R4 and #R5. Run Normal then Free sequentially in SlotRules.cs. Bonus and Respin are explicitly excluded. Preserve Runner.cs and GameDoc.md. No RTP target: N/A.",
      };
    }
    if (stage === "normal" || stage === "free") {
      assert.ok(prompt.includes("Source-linked plan:"), "Writer must consume actual Plan handoff.");
      const normal = stage === "normal";
      assert.equal(source, normal ? SEED_SLOT_SOURCE : NORMAL_ONLY_SOURCE);
      if (!seen(id("edit")))
        return call(id("edit"), "Edit", {
          file_path: file(sourceName),
          old_string: normal ? NORMAL_BAD : FREE_BAD,
          new_string: normal ? NORMAL_GOOD : FREE_GOOD,
        });
      return {
        content: `${normal ? "Normal" : "Free"} actual native Edit complete; source GameDoc.md#${normal ? "R1/R2" : "R3"}, shared R4/R5. Independent tests remain authoritative.`,
      };
    }
    assert.equal(stage, "cross-review");
    assert.equal(source, GOOD_SLOT_SOURCE);
    return {
      content:
        "Cross-state review: GameDoc.md#R1–R5 map to SlotState and the unchanged Runner.cs cases. Normal and Free share capped accumulation; retrigger is bounded and terminal inputs inert. Bonus/Respin excluded. No unresolved source rule; RTP N/A, no certification. Actual Build/Test still required.",
    };
  }
  if (stage === "analyze") {
    if (!seen(id("runner"))) return call(id("runner"), "Read", { file_path: file("Runner.cs") });
    return {
      content:
        "Analysis: MathOps.cs must satisfy the supplied request and Runner.cs add-positive/add-negative/add-zero assertions. Only MathOps.Add is affected; preserve Runner.cs as independent authority.",
    };
  }
  if (stage === "implement") {
    if (scenario === "generic")
      assert.ok(
        prompt.includes("Analysis: MathOps.cs"),
        "Implement must receive actual Analyze handoff.",
      );
    if (!seen(id("runner"))) return call(id("runner"), "Read", { file_path: file("Runner.cs") });
    const target = scenario === "bugfix" ? INITIAL_SOURCE : GOOD_SOURCE;
    assert.equal(source, SEED_SOURCE);
    if (!seen(id("edit")))
      return call(id("edit"), "Edit", {
        file_path: file(sourceName),
        old_string: source.trim(),
        new_string: target.trim(),
      });
    return {
      content:
        "Native implementation completed in MathOps.cs only. Configured Build/Test must establish the actual result; prose is not a PASS.",
    };
  }
  assert.equal(stage, "repair");
  assert.ok(feedback.previousIterationId && feedback.sourceDigest);
  assert.equal(feedback.observations.length, 1);
  assert.equal(feedback.observations[0].value.outcome, "fail");
  assert.equal(feedback.observations[0].artifactId, feedback.observations[0].value.artifactId);
  assert.equal(feedback.observations[0].value.sourceDigest, feedback.sourceDigest);
  const target = repairedSource(source, "complete");
  if (!seen(id("edit")))
    return call(id("edit"), "Edit", {
      file_path: file(sourceName),
      old_string: source.trim(),
      new_string: target.trim(),
    });
  return {
    content:
      "Native bounded repair consumes the exact prior findings and preserves Runner.cs. Rebuild and retest before approval.",
  };
}
