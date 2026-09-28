import assert from "node:assert/strict";
import test from "node:test";
import type { GraphDefinition } from "@zcode/services";
import { graphWorkflowSummaryData } from "../src/graph-engineering/graphWorkflowSummaryData.js";

test("task text never substitutes for explicitly selected documents, instructions or skills", () => {
  const definition = {
    version: 5,
    revision: 1,
    name: "Sequential engineering",
    edges: [],
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 0, y: 0 },
        request: "Modify zz-demo.txt file content to after",
      },
    ],
    template: {
      id: "generic",
      name: "Sequential engineering",
      version: 2,
      digest: "digest",
      parameters: {},
      excluded: [],
      references: [
        { id: "instructions", kind: "instruction", nodeIds: ["analyze"] },
        { id: "skill", kind: "skill", nodeIds: ["implement"] },
      ],
      bindings: {
        references: { instructions: "Context.md", skill: "" },
        recipes: {},
        sourcePaths: [],
      },
    },
  } satisfies GraphDefinition;
  assert.deepEqual(graphWorkflowSummaryData(definition), {
    request: "Modify zz-demo.txt file content to after",
    references: [{ id: "instructions", kind: "instruction", path: "Context.md" }],
  });
  delete (definition as Partial<typeof definition>).template;
  assert.deepEqual(graphWorkflowSummaryData(definition).references, []);
});
