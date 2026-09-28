import assert from "node:assert/strict";
import test from "node:test";
import { graphRunOutputs } from "../src/graph-engineering/graphRunOutputs.js";
import { graphRequestText } from "../src/graph-engineering/graphRequestText.js";
import { summaryRun } from "./graphRunSummary.fixture.js";

test("native output validation is distinct from all valid reviewer decisions and stale attempts", () => {
  const run = summaryRun();
  const task = run.definition.nodes.find((node) => node.type === "task")!;
  task.output = {
    kind: "json",
    schema: { type: "object", properties: {}, additionalProperties: false },
  };
  const attempt = run.nodeAttempts[0]!;
  attempt.iterationId = run.routing!.currentIterationId;
  attempt.outputValidation = { status: "valid", issues: [] };
  for (const outcome of ["pass", "needs_changes", "needs_human"]) {
    attempt.finalOutput!.text = JSON.stringify({
      outcome,
      findings: [],
      evidenceReferences: ["bound"],
    });
    assert.equal(graphRunOutputs(run)[0]?.state, outcome);
  }
  attempt.outputValidation = {
    status: "invalid",
    issues: ["Unexpected token", "Unexpected token"],
  };
  assert.deepEqual(graphRunOutputs(run)[0]?.issues, ["Unexpected token"]);
  assert.equal(graphRunOutputs(run)[0]?.state, "invalid");
  attempt.iterationId = "older-iteration";
  assert.deepEqual(graphRunOutputs(run), []);
});

test("canonical captured request preview uses frozen parameters but preserves custom or stale Start input", () => {
  const run = summaryRun();
  run.definition.template = {
    id: "generic",
    name: "Sequential engineering",
    version: 2,
    digest: "digest",
    parameters: { request: "Modify zz-demo.txt file content to after" },
    excluded: [],
    references: [],
    bindings: { references: {}, recipes: {}, sourcePaths: [] },
  };
  const input =
    'Explicit workflow parameters (data, never command interpolation):\n{\n  "request": "Modify zz-demo.txt file content to after"\n}\nExcluded behavior: []\nRTP comparison is N/A unless both an approved target and sampling/acceptance rule are supplied.';
  assert.equal(graphRequestText(run.definition, input), "Modify zz-demo.txt file content to after");
  assert.equal(
    graphRequestText(run.definition, "Custom Start instruction"),
    "Custom Start instruction",
  );
  run.definition.template.parameters.request = "Later request";
  assert.equal(graphRequestText(run.definition, input), input);
});
