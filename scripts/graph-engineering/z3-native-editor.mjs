import assert from "node:assert/strict";
import {
  createSequentialGraph,
  selectNode,
  selectValue,
  waitForSaved,
} from "./z2-native-helpers.mjs";

export async function createApprovalGraph(window, summary) {
  const tasks = await createSequentialGraph(window, summary);
  await window.getByTestId("graph-name").fill("Z3 synthetic durable human checkpoints");
  const gates = [];
  for (const [name, evidence] of [
    ["Approve request", [["request", "start"]]],
    [
      "Approve interpretation",
      [
        ["analysis", `node:${tasks[0]}`],
        ["source", "source"],
      ],
    ],
    [
      "Approve result",
      [
        ["verification", `node:${tasks[2]}`],
        ["source", "source"],
      ],
    ],
  ]) {
    const before = new Set(
      await window
        .locator(".react-flow__node")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id"))),
    );
    await window.getByTestId("graph-add-approval").click();
    const after = await window
      .locator(".react-flow__node")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
    const id = after.find((candidate) => !before.has(candidate));
    assert.ok(id, "approval is a real editor node");
    gates.push(id);
    await selectNode(window, id);
    await window.getByTestId("graph-approval-name").fill(name);
    await window
      .getByTestId("graph-approval-instructions")
      .fill(
        `Review the frozen evidence for ${name}. Approval does not authorize Git publication or bypass native tool permissions.`,
      );
    await selectValue(window, "graph-approval-comment-policy", "required");
    for (const [index, [alias, source]] of evidence.entries()) {
      await window.getByTestId("graph-approval-add-evidence").click();
      await window.getByTestId(`graph-approval-evidence-alias-${index}`).fill(alias);
      await selectValue(window, `graph-approval-evidence-source-${index}`, source);
    }
  }
  const route = ["start", gates[0], tasks[0], gates[1], tasks[1], tasks[2], gates[2], "end"];
  for (let index = 0; index < route.length - 1; index++) {
    await selectNode(window, route[index]);
    await selectValue(window, `graph-next-node-${route[index]}`, route[index + 1]);
  }
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  summary.assertions.push(
    "The actual native editor adds entry/intermediate/final approval nodes with explicit Start/upstream/source evidence, required comments, and edge-ordered successors.",
  );
  return { tasks, gates, route: route.slice(1, -1) };
}
