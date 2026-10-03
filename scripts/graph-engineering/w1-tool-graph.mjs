// Z8.3-W1: a Tool-only Graph workflow (no model provider) built through the real editor, with one owned harmless
// fixture command. Adapted from z4-native-editor.mjs "build-only"; the recipe is pre-seeded in the synthetic
// workspace's .zcode/config.json (the Setup page then loads it), so the .NET fixture is not needed.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { selectNode, selectValue, waitForSaved } from "./z2-native-helpers.mjs";

export const TOOL_RECIPE_ID = "w1-harmless-build";
export const TOOL_OUTPUT = "w1-tool-output.json";
export const WORKFLOW_CANARY = "W1_CANARY_WORKFLOW_NAME_5f1c0e7a";

const RECIPE = {
  id: TOOL_RECIPE_ID,
  name: "W1 harmless fixture command",
  executable: "node",
  args: ["w1-tool.mjs", "{operationId}", "{sourceDigest}"],
  cwd: ".",
  timeoutMs: 30000,
  sourcePaths: ["w1-tool.mjs"],
  expectedOutputs: [TOOL_OUTPUT],
  verifier: { kind: "build" },
};

/** Owned, harmless: reads nothing, writes one JSON receipt inside the synthetic workspace, no network. */
export async function prepareToolFixture(isolation) {
  await writeFile(
    path.join(isolation.workspace, "w1-tool.mjs"),
    `import { writeFile } from 'node:fs/promises';
const [operationId, sourceDigest] = process.argv.slice(2);
await writeFile(${JSON.stringify(TOOL_OUTPUT)}, JSON.stringify({ ran: true, operationId, sourceDigest }));
console.log(JSON.stringify({ ran: true, operationId, sourceDigest }));
`,
  );
  await mkdir(path.join(isolation.workspace, ".zcode"), { recursive: true });
  await writeFile(
    path.join(isolation.workspace, ".zcode/config.json"),
    JSON.stringify({ graphRecipes: [RECIPE] }),
  );
}

export async function createToolOnlyGraph(window, summary) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-design").click();
  await window.getByTestId("graph-upgrade").click();
  await window.getByTestId("graph-editor-advanced").click();
  await window.getByTestId("graph-name").fill(WORKFLOW_CANARY);
  const nodes = () =>
    window
      .locator(".react-flow__node")
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-id")));
  const before = new Set(await nodes());
  await window.getByTestId("graph-add-tool").click();
  const build = (await nodes()).find((candidate) => !before.has(candidate));
  assert.ok(build, "the editor must create its Tool node");
  await selectNode(window, build);
  await window.getByTestId("graph-inspector-tab-task").click();
  await window.getByTestId("graph-tool-name").fill("Build");
  // Setup page: load the project recipes seeded in the synthetic workspace.
  await window.getByTestId("graph-view-setup").click();
  await window.getByTestId("graph-project-recipes").waitFor();
  // The raw recipe JSON and its Load button sit in a collapsed <details>; open them as the Z4 flow does.
  for (const details of await window
    .getByTestId("graph-recipes-json")
    .locator("xpath=ancestor::details")
    .all())
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  await window.getByTestId("graph-load-recipes").click();
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  await window.getByTestId("graph-view-design").click();
  await selectNode(window, build);
  await selectValue(window, "graph-tool-recipe", TOOL_RECIPE_ID);
  await selectNode(window, "task");
  await window.getByTestId("graph-delete-node").click();
  await window.getByTestId("graph-delete-confirm").click();
  await window.getByTestId("graph-delete-impact").waitFor({ state: "hidden" });
  await selectNode(window, "start");
  await selectValue(window, "graph-next-node-start", build);
  await selectNode(window, build);
  await selectValue(window, `graph-next-node-${build}`, "end");
  await selectNode(window, "end");
  await selectValue(window, "graph-end-output", build);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  summary.assertions.push(
    "Real Graph editor saved a Tool-only workflow (Start → Tool → End), no Task node, no model provider.",
  );
  return { build };
}
