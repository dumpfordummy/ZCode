import assert from "node:assert/strict";
import test from "node:test";
import { builtinTemplates } from "../domain/workflow-samples.js";
import { instantiateTemplate, previewTemplate } from "../domain/workflow.js";
import { validateReadiness } from "../domain/definition.js";
import { routingFixture } from "./routing.fixture.js";
import { target } from "./sequential.fixture.js";

function instance() {
  const template = builtinTemplates.find((entry) => entry.id === "agent-assisted")?.template;
  assert.ok(template, "Agent-assisted workflow must be an independent built-in");
  return instantiateTemplate(
    "agent-assisted",
    { template, version: 1, digest: "a".repeat(64), createdAt: 0 },
    { request: "Inspect and fix only the synthetic marker; preserve unrelated work." },
    { references: {}, recipes: {}, sourcePaths: [] },
  );
}

test("agent-assisted creation needs no recipe, pins v5, and does not weaken verified templates", () => {
  const definition = instance();
  assert.deepEqual(validateReadiness(definition).errors, []);
  assert.equal(definition.version, 5);
  assert.equal(definition.template?.id, "agent-assisted");
  assert.equal(definition.template?.version, 1);
  assert.equal(
    definition.nodes.some((node) => node.type === "tool"),
    false,
  );
  assert.equal(definition.routing?.region, undefined);
  const template = builtinTemplates.find((entry) => entry.id === "agent-assisted")!.template;
  assert.equal(previewTemplate(JSON.stringify(template)).errors.length, 0);
  const verified = builtinTemplates.find((entry) => entry.id === "generic")!.template;
  assert.throws(
    () =>
      instantiateTemplate(
        "generic",
        { template: verified, version: 1, digest: "b".repeat(64), createdAt: 0 },
        { request: "Explicit task" },
        { references: {}, recipes: {}, sourcePaths: [] },
      ),
    /required project recipe/i,
  );
});

test("agent-led results travel once through fresh sessions and require exact final human decision", async (t) => {
  const fixture = routingFixture();
  t.after(() => fixture.service.disposeAndWait());
  fixture.options.recipes!.read = async () => {
    throw new Error("Unrelated malformed recipe configuration must not be read.");
  };
  const definition = instance();
  // 仅隔离测试移除模板预检：本例验证既有 Host 的顺序执行，原生预检由独立集成用例覆盖。
  delete definition.template;
  await fixture.prepare(definition);
  assert.equal(fixture.creates.length, 0);
  assert.equal(fixture.sends.length, 0);
  await fixture.run();
  const analysis = "analysis-sentinel {{inputs.request}} remains literal output";
  const implementation = "implementation-sentinel; tests were not configured";
  await fixture.emit("analyze", analysis);
  assert.equal(fixture.sends.at(-1)!.instructions.split(analysis).length - 1, 1);
  await fixture.emit("implement", implementation);
  assert.equal(fixture.sends.at(-1)!.instructions.split(analysis).length - 1, 1);
  assert.equal(fixture.sends.at(-1)!.instructions.split(implementation).length - 1, 1);
  const review = "Agent-reported review only. Configured test evidence not included.";
  await fixture.emit("review", review);
  const waiting = await fixture.current();
  assert.equal(waiting.status, "WaitingForApproval");
  assert.equal(fixture.sends.length, 3);
  assert.equal(new Set(fixture.sends.map((send) => send.sessionId)).size, 3);
  assert.equal(waiting.toolAttempts?.length ?? 0, 0);
  assert.equal(
    waiting.artifacts?.some((artifact) => artifact.provenance === "native-test"),
    false,
  );
  const request = waiting.approvalAttempts!.find((gate) => gate.nodeId === "final-gate")!.request!;
  const command = {
    target,
    runId: waiting.id,
    nodeId: "final-gate",
    requestId: request.id,
    requestVersion: request.version,
    requestDigest: request.digest,
    decisionId: "agent-led-final-review",
    value: "approve" as const,
    comment: "Reviewed actual source and agent findings; tests remain unconfigured.",
  };
  await fixture.service.decideApproval(command);
  await fixture.service.decideApproval(command);
  const completed = await fixture.current();
  assert.equal(completed.status, "Completed");
  assert.equal(completed.result?.text, review);
  assert.equal(fixture.sends.length, 3);
  assert.equal(completed.toolAttempts?.length ?? 0, 0);
});
