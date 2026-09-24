import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { addBinding, selectNode, selectValue, waitForSaved } from "./z2-native-helpers.mjs";
import { fixtureRecipes, OUTPUT_SCHEMA } from "./z4-recipes.mjs";
import { Z4_DOWNSTREAM, Z4_IMPLEMENT, Z4_REVIEW, Z4_TOOL_REVIEW } from "./z4-provider-fixture.mjs";

async function addNode(window, type) {
  const nodes = () =>
    window
      .locator(".react-flow__node")
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-id")));
  const before = new Set(await nodes());
  await window.getByTestId(`graph-add-${type}`).click();
  const id = (await nodes()).find((candidate) => !before.has(candidate));
  assert.ok(id, `Native editor must create its ${type} node.`);
  await selectNode(window, id);
  return id;
}
async function connect(window, route) {
  for (let index = 0; index < route.length - 1; index++) {
    await selectNode(window, route[index]);
    await selectValue(window, `graph-next-node-${route[index]}`, route[index + 1]);
  }
}
export async function configureStructuredOutput(window) {
  await selectValue(window, "graph-output-mode", "json");
  await window.getByTestId("graph-output-schema").fill(JSON.stringify(OUTPUT_SCHEMA, null, 2));
  await window.getByTestId("graph-apply-schema").click();
}
async function saveRecipes(window, isolation, recipes) {
  const details = window.getByTestId("graph-project-recipes");
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
  await window.getByTestId("graph-load-recipes").click();
  await window.getByTestId("graph-recipes-json").fill(JSON.stringify(recipes, null, 2));
  await window.getByTestId("graph-save-recipes").click();
  await window.getByTestId("graph-recipes-saved").waitFor();
  const saved = JSON.parse(
    await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
  );
  assert.deepEqual(saved.graphRecipes, recipes);
  await details.locator(":scope > summary").click();
}
async function approval(window, name, source, selector) {
  const id = await addNode(window, "approval");
  await window.getByTestId("graph-approval-name").fill(name);
  await window
    .getByTestId("graph-approval-instructions")
    .fill(
      `Inspect the exact ${name.toLowerCase()} evidence. Native recipe permission is a separate decision.`,
    );
  await selectValue(window, "graph-approval-comment-policy", "required");
  await window.getByTestId("graph-approval-add-evidence").click();
  await window.getByTestId("graph-approval-evidence-alias-0").fill("evidence");
  await selectValue(window, "graph-approval-evidence-source-0", source);
  if (selector) await window.getByTestId("graph-artifact-selector-approval-0").fill(selector);
  return id;
}

export async function createNativeToolGraph(window, isolation, summary, scenario) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-upgrade").click();
  await window.getByTestId("graph-name").fill(`Z4 isolated C# ${scenario}`);
  const build = await addNode(window, "tool");
  assert.equal(await window.getByTestId("graph-tool-node-id").inputValue(), build);
  await window.getByTestId("graph-tool-name").fill("Build");
  const test = scenario === "build-only" ? undefined : await addNode(window, "tool");
  if (test) await window.getByTestId("graph-tool-name").fill("Test");
  await saveRecipes(window, isolation, fixtureRecipes(build, scenario));
  await selectNode(window, build);
  await selectValue(window, "graph-tool-recipe", "fixture-build");
  if (test) {
    await selectNode(window, test);
    await selectValue(window, "graph-tool-recipe", "fixture-test");
  }
  const agent = ["complete", "model-pass"].includes(scenario) ? "task" : undefined;
  const gates = [];
  await selectNode(window, "task");
  if (agent) {
    await window
      .getByTestId("graph-node-name")
      .fill(scenario === "complete" ? "Implement" : "Reviewer claims PASS");
    await window
      .getByTestId("graph-instructions")
      .fill(scenario === "complete" ? Z4_IMPLEMENT : Z4_REVIEW);
    await configureStructuredOutput(window);
    if (scenario === "complete") {
      gates.push(await approval(window, "Review code", `artifact:${agent}`, "structured"));
      gates.push(await approval(window, "Review evidence", `artifact:${test}`, "test"));
    }
  } else await window.getByTestId("graph-delete-node").click();
  let consumer;
  if (scenario === "tool-agent") {
    consumer = await addNode(window, "task");
    await window.getByTestId("graph-node-name").fill("Review native test artifact");
    await selectValue(window, "graph-instruction-mode", "bound");
    await window.getByTestId("graph-instructions").fill(Z4_TOOL_REVIEW);
    await addBinding(window, "verification", `artifact:${test}`, 0);
    await window.getByTestId("graph-artifact-selector-binding-0").fill("test");
  }
  const route = ["start", agent, gates[0], build, test, gates[1], consumer, "end"].filter(Boolean);
  await connect(window, route);
  await selectNode(window, "end");
  await selectValue(window, "graph-end-output", consumer ?? test ?? build);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  await window.getByTestId("graph-name").scrollIntoViewIfNeeded();
  summary.assertions.push(
    "Actual native editor saves named C# recipes, Tool nodes, explicit edges and captured approval artifact selections.",
  );
  return { agent, build, test, gates, consumer, route: route.slice(1, -1) };
}

export async function createOutputGraph(window, summary, pointer = "/summary") {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-upgrade").click();
  await window.getByTestId("graph-name").fill("Z4 exact structured artifact handoff");
  await selectNode(window, "task");
  await window.getByTestId("graph-node-name").fill("Structured review");
  await window.getByTestId("graph-instructions").fill(Z4_REVIEW);
  await configureStructuredOutput(window);
  const downstream = await addNode(window, "task");
  await window.getByTestId("graph-node-name").fill("Bound artifact consumer");
  await selectValue(window, "graph-instruction-mode", "bound");
  await window.getByTestId("graph-instructions").fill(Z4_DOWNSTREAM);
  await addBinding(window, "review", "artifact:task", 0);
  await window.getByTestId("graph-artifact-selector-binding-0").fill("structured");
  await window.getByTestId("graph-artifact-pointer-binding-0").fill(pointer);
  await connect(window, ["start", "task", downstream, "end"]);
  await selectNode(window, "end");
  await selectValue(window, "graph-end-output", downstream);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  await window.getByTestId("graph-name").scrollIntoViewIfNeeded();
  summary.assertions.push(
    "Actual native editor enables strict output and explicitly selects the earlier exact-attempt artifact/JSON field.",
  );
  return { agent: "task", downstream };
}
