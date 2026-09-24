import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFixture, toolDefinition, position, selection } from "./evidence.fixture.js";
import { GraphEngineeringService } from "../app/service.js";
import type { GraphSequentialDefinition, GraphSequentialRun } from "../contract.js";

test("Tool intents persist before native effects; duplicate Run and viewing cannot admit extra commands", async (t) => {
  const f = await evidenceFixture(t);
  const first = await f.run();
  assert.equal((await f.run()).id, first.id);
  assert.equal(f.starts.length, 1);
  assert.equal(f.sends.length, 0);
  assert.equal((await f.current()).status, "WaitingForPermission");
  f.finishTool();
  await f.wait((r) => r.toolAttempts?.[1]?.status === "WaitingForPermission");
  assert.equal(f.starts.length, 2);
  f.finishTool(1);
  const completed = await f.wait((r) => r.status === "Completed");
  assert.ok(completed.resultArtifactId);
  assert.equal(completed.artifacts?.length, 2);
  const exported = await f.service.artifact({
    target: f.target,
    runId: first.id,
    action: "manifest",
  });
  assert.equal(exported.kind, "manifest");
  assert.ok(!JSON.stringify(exported).includes("actual fixture observation"));
});
test("known failed native command never advances even if unrelated model says PASS", async (t) => {
  const f = await evidenceFixture(t);
  await f.run();
  f.finishTool(0, 1);
  const run = await f.wait((r) => r.status === "Failed");
  assert.equal(f.starts.length, 1);
  assert.equal(run.toolAttempts?.[0]?.verification?.exitSuccessful, false);
  assert.equal(run.toolAttempts?.[1]?.status, "Skipped");
});
test("cancel targets only owned Tool and retains cancellation without stopping native agents", async (t) => {
  const f = await evidenceFixture(t);
  const run = await f.run();
  const cancelled = await f.service.cancel({ target: f.target, runId: run.id });
  assert.equal(cancelled.status, "Cancelled");
  assert.deepEqual(f.cancels, [f.starts[0]]);
  assert.equal(f.starts.length, 1);
});
test("lost Tool start acknowledgement and cold load never replay; guard blocks arbitrary prompts", async (t) => {
  const f = await evidenceFixture(t);
  f.fault.start = true;
  const run = (await f.run()) as GraphSequentialRun;
  assert.equal(run.status, "Unknown");
  assert.equal(f.starts.length, 1);
  await assert.rejects(
    f.service.assertInputAllowed({
      ...f.target,
      sessionId: run.toolAttempts![0]!.sessionId!,
      commandType: "sendText",
    }),
    /owns/,
  );
  const cold = new GraphEngineeringService(f.options);
  t.after(() => cold.disposeAndWait());
  assert.equal((await cold.getWorkspace(f.target)).runs[0]?.status, "Interrupted");
  assert.equal(f.starts.length, 1);
  await assert.rejects(
    cold.releaseInterrupted({
      target: f.target,
      runId: run.id,
      reason: "unknown",
      confirmed: true,
    }),
    /active/,
  );
});
test("metadata write failures happen before dispatch; terminal write failure stops successor", async (t) => {
  const f = await evidenceFixture(t);
  f.fault.write = true;
  await assert.rejects(f.run(), /disk/);
  assert.equal(f.starts.length, 0);
  f.fault.write = false;
  await f.run();
  f.fault.finishWrite = true;
  f.finishTool();
  await f.wait((r) => r.status === "Interrupted");
  assert.equal(f.starts.length, 1);
});
test("failed Tool intent or acknowledgement writes keep the last durable cached dispatch phase", async (t) => {
  for (const phase of ["sending", "accepted"] as const) {
    const f = await evidenceFixture(t);
    const write = f.options.repository.write;
    let failed = false;
    f.options.repository.write = async (target, record) => {
      const run = record.runs.at(-1) as GraphSequentialRun | undefined;
      if (!failed && run?.toolAttempts?.[0]?.dispatchPhase === phase) {
        failed = true;
        throw new Error("Synthetic boundary write failure");
      }
      await write(target, record);
    };
    const run = (await f.run()) as GraphSequentialRun;
    assert.equal(failed, true);
    assert.equal(run.status, "Unknown");
    assert.equal(run.toolAttempts?.[0]?.dispatchPhase, phase === "sending" ? "created" : "sending");
    assert.equal(f.starts.length, phase === "sending" ? 0 : 1);
    assert.equal(
      (f.saved().runs[0] as GraphSequentialRun).toolAttempts?.[0]?.dispatchPhase,
      run.toolAttempts?.[0]?.dispatchPhase,
    );
  }
});
function jsonGraph(): GraphSequentialDefinition {
  const graph = toolDefinition();
  graph.nodes = [
    graph.nodes[0]!,
    {
      id: "one",
      type: "task",
      name: "Review",
      position,
      instructionMode: "literal",
      instructions: "Return JSON",
      inputs: [],
      configuration: { kind: "inherit" },
      output: {
        kind: "json",
        schema: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
          additionalProperties: false,
        },
      },
    },
    {
      id: "two",
      type: "task",
      name: "Use evidence",
      position,
      instructionMode: "bound",
      instructions: "Use {{inputs.review}}",
      inputs: [
        {
          alias: "review",
          source: { kind: "artifact", nodeId: "one", selector: "structured", pointer: "/summary" },
        },
      ],
      configuration: { kind: "inherit" },
    },
    graph.nodes.at(-1)!,
  ];
  return graph;
}
test("strict structured result binds exact attempt field while native completion remains separate", async (t) => {
  const f = await evidenceFixture(t, jsonGraph());
  await f.run();
  f.finishAgent('{"summary":"exact owned result"}');
  await f.wait((r) => r.nodeAttempts[1]?.dispatchPhase === "accepted");
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1]?.instructions, "Use exact owned result");
  const run = await f.current();
  assert.equal(run.artifacts?.[1]?.type, "json");
  assert.ok(run.nodeAttempts[1]?.bindings?.[0]?.artifactId);
});
test("invalid strict output stops all dependents without repair and retains successful native proof", async (t) => {
  const f = await evidenceFixture(t, jsonGraph());
  await f.run();
  f.finishAgent('```json\n{"summary":"PASS"}\n```');
  const run = await f.wait((r) => r.status === "Failed");
  assert.equal(run.nodeAttempts[0]?.terminalProof?.state, "completedSuccess");
  assert.equal(run.nodeAttempts[0]?.outputValidation?.status, "invalid");
  assert.equal(f.sends.length, 1);
  await assert.rejects(
    f.service.run({
      target: f.target,
      requestId: "request-one",
      revision: 0,
      modelSelection: selection,
      mode: "build",
    }),
    /configuration/,
  );
});
