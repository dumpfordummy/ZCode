import assert from "node:assert/strict";
import { parseNativeBinding } from "./z6-provider-responses.mjs";
import { REQUEST, TEST_NAME } from "./reviewer-native-fixture.mjs";

export const SCENARIOS = [
  "pass",
  "prose-fence",
  "unbound-report",
  "needs_changes",
  "needs_human",
  "test-failure",
];

export function reviewerNativeResponse({ body, prompt, stage, workspace, scenario }) {
  const names = body.tools?.map((tool) => tool.function.name) ?? [];
  if (!names.length) return { content: "Controlled native reviewer acceptance" };
  assert.ok(["analyze", "implement", "reviewer"].includes(stage), `Unexpected stage ${stage}`);
  assert.ok(prompt.includes(REQUEST));
  const messages = body.messages ?? [];
  const id = (suffix) => `z6_repro_${stage}_${suffix}`;
  const seen = (suffix) =>
    messages.some((item) => item.role === "tool" && item.tool_call_id === id(suffix));
  const call = (suffix, name, args) => {
    const actual = names.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    assert.ok(actual, `Native tool ${name} unavailable`);
    return { call: { id: id(suffix), name: actual, arguments: args } };
  };
  const file = `${workspace.replaceAll("\\", "/")}/zz-demo.txt`;
  if (stage !== "reviewer" && !seen("read")) return call("read", "Read", { file_path: file });
  if (stage === "analyze")
    return {
      content:
        "Acceptance: zz-demo.txt must contain exactly after. Only this local file changes. Preserve the configured Build/Test scripts. Git tracking is not an acceptance requirement.",
    };
  if (stage === "implement") {
    assert.ok(prompt.includes("Acceptance: zz-demo.txt"));
    if (!seen("edit"))
      return call("edit", "Edit", {
        file_path: file,
        old_string: "before",
        new_string: scenario === "test-failure" ? "still-before" : "after",
      });
    return {
      content:
        "Native Edit returned. Graph must now execute the saved Build and Test checks; this reply does not establish a machine result.",
    };
  }
  const verification = parseNativeBinding(prompt, "verification");
  assert.equal(verification.outcome, "pass");
  assert.equal(verification.failed, 0);
  assert.ok(verification.testCount > 0);
  assert.ok(verification.tests.some((item) => item.name === TEST_NAME && item.status === "passed"));
  const permitted = JSON.parse(
    /Permitted evidence artifact IDs for evidenceReferences: (\[[^\n]*\])/.exec(prompt)?.[1] ??
      "null",
  );
  assert.deepEqual(permitted, [verification.artifactId]);
  assert.ok(verification.reportArtifactId && !permitted.includes(verification.reportArtifactId));
  const outcome = ["needs_changes", "needs_human"].includes(scenario) ? scenario : "pass";
  const result = {
    outcome,
    findings:
      outcome === "pass"
        ? []
        : [
            {
              code: "controlled-decision",
              message:
                outcome === "needs_changes"
                  ? "Controlled decision-path fixture: request a revision for human review; passing machine evidence is unchanged."
                  : "Question: controlled fixture requests human judgment; the supplied machine result is passing.",
            },
          ],
    evidenceReferences:
      scenario === "unbound-report" ? [...permitted, verification.reportArtifactId] : permitted,
  };
  const content = JSON.stringify(result);
  return {
    content:
      scenario === "prose-fence" ? `Review follows.\n\`\`\`json\n${content}\n\`\`\`` : content,
  };
}
