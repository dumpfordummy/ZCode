import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addBinding, selectNode, selectValue, waitForSaved } from "./z2-native-helpers.mjs";
import { SOURCE_PATHS } from "./z4-fixture.mjs";
import { fixtureRecipes } from "./z4-recipes.mjs";
import { IMPLEMENT_PROMPT, REPAIR_PROMPT, REVIEW_PROMPT } from "./z5-provider-responses.mjs";

export const REVIEW_SCHEMA = {
  type: "object",
  required: ["outcome", "findings", "evidenceReferences"],
  additionalProperties: false,
  properties: {
    outcome: { type: "string", enum: ["pass", "needs_changes", "needs_human"] },
    findings: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        required: ["code", "message"],
        additionalProperties: false,
        properties: {
          code: { type: "string", minLength: 1, maxLength: 100 },
          message: { type: "string", minLength: 1, maxLength: 1000 },
        },
      },
    },
    evidenceReferences: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};
export async function addNode(window, type, name) {
  const selector = ".react-flow__node";
  const before = new Set(
    await window
      .locator(selector)
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-id"))),
  );
  await window.getByTestId(`graph-add-${type}`).click();
  const after = await window
    .locator(selector)
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-id")));
  const id = after.find((value) => !before.has(value));
  assert.ok(id);
  await selectNode(window, id);
  await window.getByTestId(type === "task" ? "graph-node-name" : `graph-${type}-name`).fill(name);
  return id;
}
export async function connect(window, from, to, port) {
  await selectNode(window, from);
  await selectValue(window, `graph-next-node-${from}${port ? `-${port}` : ""}`, to);
}
export async function outputSchema(window, schema) {
  await selectValue(window, "graph-output-mode", "json");
  await window.getByTestId("graph-output-schema").fill(JSON.stringify(schema, null, 2));
  await window.getByTestId("graph-apply-schema").click();
}
async function begin(window, name) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-upgrade").click();
  await window.getByTestId("graph-upgrade-routing").click();
  await window.getByTestId("graph-name").fill(name);
}
async function approval(window, name, nodeId, selector) {
  const id = await addNode(window, "approval", name);
  await window
    .getByTestId("graph-approval-instructions")
    .fill(
      "Review this exact iteration's native evidence. This gate does not authorize publication or answer native permissions.",
    );
  await selectValue(window, "graph-approval-comment-policy", "required");
  await window.getByTestId("graph-approval-add-evidence").click();
  await window.getByTestId("graph-approval-evidence-alias-0").fill("evidence");
  await selectValue(window, "graph-approval-evidence-source-0", `artifact:${nodeId}`);
  await window.getByTestId("graph-artifact-selector-approval-0").fill(selector);
  return id;
}
async function recipes(window, isolation, buildId) {
  const value = fixtureRecipes(buildId);
  const details = window.getByTestId("graph-project-recipes");
  await details.locator(":scope > summary").click();
  await window.getByTestId("graph-load-recipes").click();
  await window.getByTestId("graph-recipes-json").fill(JSON.stringify(value, null, 2));
  await window.getByTestId("graph-save-recipes").click();
  await window.getByTestId("graph-recipes-saved").waitFor();
  assert.deepEqual(
    JSON.parse(await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"))
      .graphRecipes,
    value,
  );
  await details.locator(":scope > summary").click();
}
async function routingSettings(window, finalGate, admissions, deadline) {
  const details = window.getByTestId("graph-routing-settings");
  await details.locator(":scope > summary").click();
  await selectValue(window, "graph-routing-final-gate", finalGate);
  await window.getByTestId("graph-routing-max-admissions").fill(String(admissions));
  await window.getByTestId("graph-routing-deadline-ms").fill(String(deadline));
}
async function save(window) {
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  await window.getByTestId("graph-name").scrollIntoViewIfNeeded();
}

export async function createRepairGraph(window, isolation, summary, scenario) {
  await begin(window, `Z5 bounded native C# ${scenario}`);
  await selectNode(window, "task");
  await window.getByTestId("graph-node-name").fill("Implement");
  await window.getByTestId("graph-instructions").fill(IMPLEMENT_PROMPT);
  const build = await addNode(window, "tool", "Build");
  const test = await addNode(window, "tool", "Test");
  const reviewer = await addNode(window, "task", "Reviewer");
  await selectValue(window, "graph-instruction-mode", "bound");
  await window.getByTestId("graph-instructions").fill(REVIEW_PROMPT);
  await addBinding(window, "verification", `artifact:${test}`, 0);
  await window.getByTestId("graph-artifact-selector-binding-0").fill("verification");
  await outputSchema(window, REVIEW_SCHEMA);
  const repair = await addNode(window, "task", "Repair");
  await selectValue(window, "graph-instruction-mode", "bound");
  await window.getByTestId("graph-instructions").fill(REPAIR_PROMPT);
  await addBinding(window, "feedback", "repair-feedback", 0);
  const decision = await addNode(window, "condition", "Decide from current evidence");
  await window.getByTestId("graph-condition-inputs").fill(
    JSON.stringify([
      { alias: "review", source: { kind: "artifact", nodeId: reviewer, selector: "structured" } },
      { alias: "machine", source: { kind: "artifact", nodeId: test, selector: "verification" } },
    ]),
  );
  await window.getByTestId("graph-condition-branches").fill(
    JSON.stringify([
      {
        exit: "pass",
        predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "pass" },
      },
      {
        exit: "needs_changes",
        predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "needs_changes" },
      },
    ]),
  );
  await window.getByTestId("graph-condition-default-exit").fill("needs_human");
  await window
    .getByTestId("graph-condition-verification")
    .fill(JSON.stringify({ testNodeIds: [test], reviewerNodeId: reviewer, successExit: "pass" }));
  await window.getByTestId("graph-condition-apply").click();
  const finalGate = await approval(window, "Final human review", test, "test");
  const repairGate =
    scenario === "reject"
      ? await approval(window, "Review repair before tests", repair, "final")
      : undefined;
  await recipes(window, isolation, build);
  for (const [id, recipe] of [
    [build, "fixture-build"],
    [test, "fixture-test"],
  ]) {
    await selectNode(window, id);
    await selectValue(window, "graph-tool-recipe", recipe);
  }
  for (const [from, to] of [
    ["start", "task"],
    ["task", build],
    [build, test],
    [test, reviewer],
    [reviewer, decision],
    [repair, repairGate ?? build],
    ...(repairGate ? [[repairGate, build]] : []),
    [finalGate, "end"],
  ])
    await connect(window, from, to);
  await connect(window, decision, finalGate, "pass");
  await connect(window, decision, repair, "needs_changes");
  await connect(window, decision, finalGate, "needs_human");
  await selectNode(window, "end");
  await selectValue(window, "graph-end-output", test);
  const admissions = scenario === "admissions" ? 5 : 12;
  const deadline = scenario === "deadline" ? 30000 : 600000;
  await routingSettings(window, finalGate, admissions, deadline);
  await window.getByTestId("graph-region-enable").click();
  await window.getByTestId("graph-region-name").fill("Bounded C# repair");
  for (const [key, id] of [
    ["entry", "task"],
    ["repair-entry", repair],
    ["decision", decision],
  ])
    await selectValue(window, `graph-region-${key}`, id);
  await window
    .getByTestId("graph-region-body")
    .fill(["task", build, test, reviewer, repair, decision, repairGate].filter(Boolean).join("\n"));
  await window.getByTestId("graph-region-source-paths").fill(SOURCE_PATHS.join("\n"));
  await window.getByTestId("graph-region-max-repairs").fill("2");
  await window.getByTestId("graph-region-repair-exit").fill("needs_changes");
  await window.getByTestId("graph-region-pass-exit").fill("pass");
  await window.getByTestId("graph-region-no-progress").setChecked(true);
  await window.getByTestId("graph-routing-settings").locator(":scope > summary").click();
  await save(window);
  summary.assertions.push(
    "The actual native editor creates the version-5 repair region, named condition exits, exact artifact/repair-feedback bindings, native recipes, finite limits and required final gate.",
  );
  return {
    initial: "task",
    build,
    test,
    reviewer,
    repair,
    decision,
    finalGate,
    repairGate,
    admissions,
    deadline,
  };
}

export async function createConditionGraph(window, summary, scenario) {
  await begin(window, "Z5 typed exclusive routes");
  await selectNode(window, "task");
  await window.getByTestId("graph-node-name").fill("Condition data");
  await window
    .getByTestId("graph-instructions")
    .fill("Z5_CONDITION: Read MathOps.cs and return the exact controlled structured data.");
  await outputSchema(window, {
    type: "object",
    required: [],
    additionalProperties: false,
    properties: {
      ready: { type: "boolean" },
      count: { type: scenario === "condition-wrong-type" ? "string" : "number" },
    },
  });
  const decision = await addNode(window, "condition", "Choose one route");
  await window
    .getByTestId("graph-condition-inputs")
    .fill(
      JSON.stringify([
        { alias: "data", source: { kind: "artifact", nodeId: "task", selector: "structured" } },
      ]),
    );
  await window.getByTestId("graph-condition-branches").fill(
    JSON.stringify([
      {
        exit: "true",
        predicate: {
          op: "all",
          predicates: [
            { op: "eq", alias: "data", pointer: "/ready", value: true },
            { op: "gte", alias: "data", pointer: "/count", value: 3 },
          ],
        },
      },
      { exit: "false", predicate: { op: "eq", alias: "data", pointer: "/ready", value: false } },
    ]),
  );
  await window.getByTestId("graph-condition-default-exit").fill("default");
  // 原生控件声明 JSON 对象或 null；空字符串会被 JSON.parse 拒绝并保留旧草稿。
  await window.getByTestId("graph-condition-verification").fill("null");
  await window.getByTestId("graph-condition-apply").click();
  const branches = {};
  for (const route of ["true", "false", "default"]) {
    branches[route] = await addNode(window, "task", `Selected ${route} route`);
    await window
      .getByTestId("graph-instructions")
      .fill(`Z5_ROUTE: Read MathOps.cs; route=${route}.`);
  }
  const merge = await addNode(window, "task", "Exclusive merge");
  await window.getByTestId("graph-instructions").fill("Z5_ROUTE: Read MathOps.cs; route=merge.");
  const finalGate = await approval(window, "Final route review", merge, "final");
  for (const [from, to] of [
    ["start", "task"],
    ["task", decision],
    [merge, finalGate],
    [finalGate, "end"],
  ])
    await connect(window, from, to);
  for (const [port, id] of Object.entries(branches)) {
    await connect(window, decision, id, port);
    await connect(window, id, merge);
  }
  await selectNode(window, decision);
  assert.equal(await window.getByTestId("graph-output-mode").count(), 0);
  await selectNode(window, "task");
  assert.equal(await window.getByTestId("graph-output-mode").count(), 1);
  await selectNode(window, "end");
  assert.equal(await window.getByTestId("graph-output-mode").count(), 0);
  await selectValue(window, "graph-end-output", merge);
  await routingSettings(window, finalGate, 8, 600000);
  await window.getByTestId("graph-routing-settings").locator(":scope > summary").click();
  await save(window);
  summary.assertions.push(
    "Actual editor saves named exclusive branches and a common merge with a required final gate.",
  );
  return { initial: "task", decision, branches, merge, finalGate, admissions: 8, deadline: 600000 };
}
