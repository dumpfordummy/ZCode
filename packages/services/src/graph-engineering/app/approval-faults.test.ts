import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalDefinition,
  approvalFixture,
  approve,
  command,
  pending,
} from "./approval.fixture.js";
import { target } from "./sequential.fixture.js";
import type { GraphSequentialRun } from "../contract.js";
import { recordSchema } from "../domain/record.js";

test("decision persistence failure has no effect; committed lost reply retry is idempotent", async () => {
  const f = await pending();
  const write = f.repository.write;
  f.repository.write = async (t, r) => {
    if ((r.runs[0] as GraphSequentialRun).approvalAttempts![0]!.decision)
      throw Error("Decision disk full");
    await write(t, r);
  };
  await assert.rejects(approve(f), /disk full/);
  assert.equal(f.sends.length, 1);
  assert.equal((await f.current()).approvalAttempts![0]!.decision, undefined);
  f.repository.write = write;
  const run = await f.current();
  const payload = {
    ...command(run),
    decisionId: "lost-reply",
    value: "approve" as const,
    comment: "Reviewed",
  };
  await f.service.decideApproval(payload); // Intentionally discard the successful transport reply.
  const restoredReply = await f.service.decideApproval(payload);
  assert.equal(
    (restoredReply as GraphSequentialRun).approvalAttempts![0]!.decision?.id,
    "lost-reply",
  );
  assert.equal(f.sends.length, 2);
});
test("committed decision plus undispatched successor survives restart but only explicit Continue dispatches", async () => {
  const f = await pending();
  const write = f.repository.write;
  f.repository.write = async (t, r) => {
    if ((r.runs[0] as GraphSequentialRun).nodeAttempts[1]!.dispatchPhase === "creating")
      throw Error("boundary crash");
    await write(t, r);
  };
  await assert.rejects(approve(f), /boundary crash/);
  const saved = structuredClone(f.saved());
  assert.equal(
    (saved.runs[0] as GraphSequentialRun).approvalAttempts![0]!.decision?.value,
    "approve",
  );
  assert.equal((saved.runs[0] as GraphSequentialRun).nodeAttempts[1]!.dispatchPhase, "planned");
  assert.equal(f.sends.length, 1);
  await f.service.disposeAndWait();
  const restored = approvalFixture(saved);
  const run = await restored.current();
  assert.equal(run.status, "AwaitingContinuation");
  assert.equal(restored.sends.length, 0);
  await restored.service.continueApproval(command(run));
  assert.equal(restored.sends.length, 1);
  await assert.rejects(restored.service.continueApproval(command(run)), /blocked/);
  assert.equal(restored.sends.length, 1);
});
test("uncertain creation and send boundaries retain Z2 guard and cannot Continue/replay", async () => {
  for (const stage of ["create", "send"] as const) {
    const f = await pending();
    f.native[stage] = async () => {
      throw Error(`lost ${stage} reply`);
    };
    await approve(f);
    assert.equal((await f.current()).status, "Unknown");
    await f.service.disposeAndWait();
    const restored = approvalFixture(f.saved());
    const run = await restored.current();
    assert.equal(run.status, "Interrupted");
    assert.equal(restored.creates.length, 0);
    assert.equal(restored.sends.length, 0);
    await assert.rejects(restored.service.continueApproval(command(run)), /blocked/);
    assert.equal(await restored.service.isSessionOwned({ ...target, sessionId: "native-1" }), true);
  }
});
test("source is rechecked after committed decision and before successor native send", async () => {
  for (const boundary of ["decision", "create"]) {
    const f = await pending({ source: true });
    const mutate = () =>
      f.setSnapshot({
        baseline: "changed after review",
        scope: "changed",
        complete: true,
        issues: [],
        files: [],
      });
    if (boundary === "decision") {
      const write = f.repository.write;
      f.repository.write = async (t, r) => {
        await write(t, r);
        if ((r.runs[0] as GraphSequentialRun).approvalAttempts![0]!.decision) mutate();
      };
    } else {
      const create = f.native.create;
      f.native.create = async (e) => {
        const result = await create(e);
        mutate();
        return result;
      };
    }
    if (boundary === "decision") await assert.rejects(approve(f), /changed/);
    else await approve(f);
    assert.equal((await f.current()).status, "StaleEvidence");
    assert.equal(f.sends.length, 1);
    assert.equal(f.creates.length, boundary === "decision" ? 1 : 2);
  }
});
test("pending request metadata failure publishes no actionable gate and no successor", async () => {
  const f = await pending({ entry: true });
  const base = f.saved();
  const gate = (base.runs[0] as GraphSequentialRun).approvalAttempts!.find(
    (g) => g.nodeId === "entry",
  )!;
  assert.ok(gate.request); // Independent persisted shape validation.
  for (const mutate of [
    (r: GraphSequentialRun) => {
      r.approvalAttempts!.find((g) => g.nodeId === "entry")!.request!.runId = "foreign";
    },
    (r: GraphSequentialRun) => {
      r.approvalAttempts!.find((g) => g.nodeId === "entry")!.status = "Approved";
    },
    (r: GraphSequentialRun) => {
      r.approvalAttempts!.find((g) => g.nodeId === "entry")!.request!.evidence[0]!.source = {
        kind: "node",
        nodeId: "verify",
      };
    },
  ]) {
    const record = structuredClone(base);
    mutate(record.runs[0] as GraphSequentialRun);
    assert.throws(() =>
      recordSchema.parse({ version: 3, workspaceKey: target.workspacePath, ...record }),
    );
  }
  const g = approvalFixture();
  await g.prepare(approvalDefinition());
  const original = g.repository.write;
  g.repository.write = async (t, r) => {
    if ((r.runs[0] as GraphSequentialRun)?.approvalAttempts?.some((a) => a.request))
      throw Error("request disk full");
    await original(t, r);
  };
  await g.run();
  g.emit(0, "completedSuccess", "Independent predecessor text");
  await g.settle();
  assert.equal((await g.current()).status, "Interrupted");
  assert.equal(g.sends.length, 1);
  assert.equal((await g.current()).approvalAttempts![0]!.request, undefined);
});
test("restart refuses continuation if selected source has changed, preserving frozen request", async () => {
  const f = await pending({ source: true });
  const old = structuredClone((await f.current()).approvalAttempts![0]!.request);
  await f.service.disposeAndWait();
  const restored = approvalFixture(f.saved());
  restored.setSnapshot({
    baseline: "new",
    scope: "changed",
    complete: true,
    issues: [],
    files: [],
  });
  const cold = await restored.current();
  await assert.rejects(restored.service.continueApproval(command(cold)), /changed/);
  assert.equal(restored.sends.length, 0);
  assert.deepEqual((await restored.current()).approvalAttempts![0]!.request, old);
});

test("a second source check during Continue preserves Stale evidence instead of generic interruption", async () => {
  const f = await pending({ source: true });
  const write = f.repository.write;
  f.repository.write = async (t, r) => {
    if ((r.runs[0] as GraphSequentialRun).nodeAttempts[1]!.dispatchPhase === "creating")
      throw Error("crash");
    await write(t, r);
  };
  await assert.rejects(approve(f), /crash/);
  await f.service.disposeAndWait();
  const restored = approvalFixture(f.saved());
  const cold = await restored.current();
  const capture = restored.evidence.captureSource;
  let reads = 0;
  restored.evidence.captureSource = async () => {
    const value = await capture();
    if (++reads === 1)
      restored.setSnapshot({
        baseline: "changed at dispatch",
        scope: "changed",
        complete: true,
        issues: [],
        files: [],
      });
    return value;
  };
  await assert.rejects(restored.service.continueApproval(command(cold)), /changed/);
  assert.equal((await restored.current()).status, "StaleEvidence");
  assert.equal(restored.sends.length, 0);
});

test("decision IDs cannot be reused across gate requests", async () => {
  const f = await pending({ entry: true });
  await approve(f, "entry", "same-id");
  f.emit(0, "completedSuccess", "analysis");
  await f.settle();
  await assert.rejects(approve(f, "review", "same-id"), /ID conflict/);
  assert.equal(f.sends.length, 1);
  assert.equal((await f.current()).status, "WaitingForApproval");
});

test("consecutive approvals retain source obligation until native dispatch and never revive stale gates on restart", async () => {
  for (const invalidate of ["source", "graph"]) {
    const f = approvalFixture(),
      graph = approvalDefinition({ source: true });
    graph.nodes.push({
      id: "second-review",
      type: "approval",
      position: { x: 0, y: 0 },
      name: "Second review",
      reviewInstructions: "Review request",
      commentPolicy: "optional",
      evidence: [{ alias: "request", source: { kind: "start" } }],
    });
    graph.edges.find((e) => e.source === "review")!.target = "second-review";
    graph.edges.push({ source: "second-review", target: "implement" });
    await f.prepare(graph);
    await f.run();
    f.emit(0, "completedSuccess", "Analysis");
    await f.settle();
    await approve(f);
    assert.equal((await f.current()).status, "WaitingForApproval");
    if (invalidate === "source")
      f.setSnapshot({
        baseline: "external edit",
        scope: "changed",
        complete: true,
        issues: [],
        files: [],
      });
    else {
      const view = await f.view();
      await f.service.saveDefinition({
        target,
        definition: { ...view.definition, name: "Changed" },
        expectedRevision: view.definition.revision,
      });
    }
    await assert.rejects(approve(f, "second-review", "second-decision"), /changed/);
    assert.equal((await f.current()).status, "StaleEvidence");
    assert.equal(f.sends.length, 1);
    await f.service.disposeAndWait();
    const restored = approvalFixture(f.saved());
    assert.equal((await restored.current()).status, "StaleEvidence");
    assert.equal(restored.sends.length, 0);
    await assert.rejects(
      restored.service.continueApproval(command(await restored.current())),
      /blocked/,
    );
  }
});

test("persisted sending identity cannot authorize native replay after live failure or cold restart", async () => {
  const f = await pending();
  f.native.send = async () => {
    throw Error("lost native reply");
  };
  await approve(f);
  const run = await f.current(),
    node = run.nodeAttempts[1]!;
  const guard = {
    ...target,
    sessionId: node.sessionId!,
    commandId: node.commandId,
    commandType: "sendText",
    expectedRuntimeIdentity: node.runtimeIdentity,
    envelope: {
      clientId: `graph:${node.attemptId}`,
      payload: {
        text: node.resolvedInstructions,
        modelSelection: node.settings.modelSelection,
        mode: node.settings.mode,
        planEnabled: node.settings.planEnabled,
      },
    },
  };
  await assert.rejects(f.service.assertInputAllowed(guard), /owns/);
  await f.service.disposeAndWait();
  const restored = approvalFixture(f.saved());
  await restored.current();
  await assert.rejects(restored.service.assertInputAllowed(guard), /owns/);
  assert.equal(restored.sends.length, 0);
});

test("native input exemption is one use and matches frozen runtime/client/payload", async () => {
  const f = approvalFixture();
  await f.prepare(approvalDefinition());
  const send = f.native.send;
  let guarded = false;
  f.native.send = async (execution) => {
    const params = {
      ...target,
      sessionId: execution.sessionId!,
      commandId: execution.commandId,
      commandType: "sendText",
      expectedRuntimeIdentity: execution.runtimeIdentity,
      envelope: {
        clientId: `graph:${execution.attemptId}`,
        payload: {
          text: execution.instructions,
          modelSelection: execution.modelSelection,
          mode: execution.mode,
          planEnabled: execution.planEnabled,
        },
      },
    };
    await assert.rejects(
      f.service.assertInputAllowed({ ...params, expectedRuntimeIdentity: "replacement" }),
      /owns/,
    );
    await assert.rejects(
      f.service.assertInputAllowed({
        ...params,
        envelope: { ...params.envelope, payload: { ...params.envelope.payload, text: "foreign" } },
      }),
      /owns/,
    );
    await f.service.assertInputAllowed(params);
    guarded = true;
    await assert.rejects(f.service.assertInputAllowed(params), /owns/);
    return send(execution);
  };
  await f.run();
  assert.equal(guarded, true);
  assert.equal(f.sends.length, 1);
});
