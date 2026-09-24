import assert from "node:assert/strict";
import test from "node:test";
import { routingDefinition, routingFixture } from "./routing.fixture.js";
import { target } from "./sequential.fixture.js";

test("exclusive routes merge once and require the actual final gate", async () => {
  for (const value of [2, -1]) {
    const f = routingFixture();
    try {
      await f.prepare();
      await f.run();
      await f.emit("producer", JSON.stringify({ value }));
      const branch = value > 0 ? "positive" : "other";
      assert.equal(f.sends.length, 2);
      assert.equal((await f.current()).routing!.cursorNodeId, branch);
      await f.emit(branch, "branch complete");
      await f.emit("merge", "final result");
      const pending = await f.current();
      assert.equal(pending.status, "WaitingForApproval");
      const request = pending.approvalAttempts![0]!.request!;
      await f.service.decideApproval({
        target,
        runId: pending.id,
        nodeId: "gate",
        requestId: request.id,
        requestVersion: request.version,
        requestDigest: request.digest,
        decisionId: "reviewed",
        value: "approve",
        comment: "Independent review",
      });
      const run = await f.current();
      assert.equal(run.status, "Completed");
      assert.equal(run.routing!.admissions, 3);
      assert.equal(
        run.nodeAttempts.find((a) => a.nodeId === (value > 0 ? "other" : "positive"))!.status,
        "Skipped",
      );
      assert.equal(new Set(f.sends.map((s) => s.sessionId)).size, 3);
    } finally {
      await f.service.disposeAndWait();
    }
  }
});

test("invalid output, lost acceptance and exhausted admissions cannot route or repair", async () => {
  for (const kind of ["invalid", "unknown", "budget"] as const) {
    const f = routingFixture();
    try {
      const definition = routingDefinition();
      if (kind === "budget") definition.routing!.limits.maxNodeAdmissions = 1;
      await f.prepare(definition);
      if (kind === "unknown")
        f.options.native.send = async () => {
          throw Error("Lost receipt");
        };
      await f.run();
      if (kind !== "unknown")
        await f.emit("producer", kind === "invalid" ? "not JSON" : '{"value":2}');
      const run = await f.current();
      assert.equal(
        run.status,
        kind === "invalid" ? "NeedsHuman" : kind === "unknown" ? "Unknown" : "BudgetExhausted",
      );
      assert.equal(f.creates.length, 1);
      assert.equal(run.routing!.admissions, 1);
    } finally {
      await f.service.disposeAndWait();
    }
  }
});

test("persisted route checkpoint requires explicit continuation and duplicate request sends once", async () => {
  const f = routingFixture();
  await f.prepare();
  await f.run();
  const write = f.options.repository.write;
  f.options.repository.write = async (target, record) => {
    const run = record.runs.at(-1)!;
    if (
      run.version === 5 &&
      run.nodeAttempts.some((a) => a.nodeId === "positive" && a.dispatchPhase === "creating")
    )
      throw Error("Synthetic creating write fault");
    await write(target, record);
  };
  await f.emit("producer", '{"value":2}');
  assert.equal(f.creates.length, 1);
  const saved = f.saved();
  await f.service.disposeAndWait();
  const restored = routingFixture(saved, f.artifacts);
  try {
    const cold = await restored.current();
    assert.equal(cold.status, "AwaitingContinuation");
    assert.equal(restored.creates.length, 0);
    const checkpoint = cold.routing!.checkpoints.at(-1)!;
    const command = {
      action: "continue" as const,
      target,
      runId: cold.id,
      requestId: "continue-one",
      checkpointId: checkpoint.id,
      checkpointDigest: checkpoint.digest,
    };
    await restored.service.run(command);
    await restored.service.run(command);
    assert.equal(restored.sends.length, 1);
    assert.equal((await restored.current()).routing!.admissions, 2);
    await assert.rejects(
      restored.service.run({ ...command, checkpointDigest: "conflict" }),
      /conflict/,
    );
    assert.equal(restored.sends.length, 1);
  } finally {
    await restored.service.disposeAndWait();
  }
});

test("deadline and source/configuration changes stop before another native admission", async () => {
  for (const kind of ["deadline", "configuration"] as const) {
    const f = routingFixture();
    try {
      await f.prepare();
      await f.run();
      if (kind === "deadline") f.advanceClock(3600001);
      else {
        const graph = routingDefinition();
        graph.name = "Edited during run";
        await f.service.saveDefinition({ target, definition: graph, expectedRevision: 1 });
      }
      await f.emit("producer", '{"value":2}');
      assert.equal(f.creates.length, 1);
      assert.equal(
        (await f.current()).status,
        kind === "deadline" ? "BudgetExhausted" : "NeedsHuman",
      );
    } finally {
      await f.service.disposeAndWait();
    }
  }
});

test("cold prepared final gate uses the original approval continuation, not its incoming route", async () => {
  const f = routingFixture();
  const definition = routingDefinition();
  definition.nodes = definition.nodes.filter((n) => !["positive", "other", "merge"].includes(n.id));
  definition.edges = definition.edges.filter(
    (e) => !["positive", "other", "merge"].includes(e.source),
  );
  for (const edge of definition.edges) if (edge.source === "condition") edge.target = "gate";
  const gate = definition.nodes.find((n) => n.type === "approval")!;
  if (gate.type === "approval")
    gate.evidence = [{ alias: "result", source: { kind: "node", nodeId: "producer" } }];
  const end = definition.nodes.find((n) => n.type === "end")!;
  if (end.type === "end") end.outputNodeId = "producer";
  await f.prepare(definition);
  await f.run();
  await f.emit("producer", '{"value":2}');
  assert.equal((await f.current()).status, "WaitingForApproval");
  const saved = f.saved();
  await f.service.disposeAndWait();
  const restored = routingFixture(saved, f.artifacts);
  try {
    const cold = await restored.current(),
      request = cold.approvalAttempts![0]!.request!;
    assert.equal(cold.status, "AwaitingContinuation");
    assert.equal(cold.approvalAttempts![0]!.resumeRequired, true);
    const command = {
      target,
      runId: cold.id,
      nodeId: "gate",
      requestId: request.id,
      requestVersion: request.version,
      requestDigest: request.digest,
    };
    await restored.service.continueApproval(command);
    assert.equal((await restored.current()).status, "WaitingForApproval");
    await restored.service.decideApproval({
      ...command,
      decisionId: "final",
      value: "approve",
      comment: "Reviewed",
    });
    assert.equal((await restored.current()).status, "Completed");
    assert.equal(restored.sends.length, 0);
  } finally {
    await restored.service.disposeAndWait();
  }
});

test("deadline crossing async verification or durable sending intent never calls native send", async () => {
  for (const boundary of ["verify", "sending"] as const) {
    const f = routingFixture();
    try {
      await f.prepare();
      if (boundary === "verify") {
        const create = f.options.native.create;
        f.options.native.create = async (input) => {
          const result = await create(input);
          const read = f.options.recipes!.read;
          f.options.recipes!.read = async (target) => {
            const value = await read(target);
            f.advanceClock(3600001);
            return value;
          };
          return result;
        };
      } else {
        const write = f.options.repository.write;
        f.options.repository.write = async (target, record) => {
          await write(target, record);
          if (
            record.runs.some(
              (r) => r.version === 5 && r.nodeAttempts.some((a) => a.dispatchPhase === "sending"),
            )
          )
            f.advanceClock(3600001);
        };
      }
      await f.run();
      assert.equal(f.creates.length, 1);
      assert.equal(f.sends.length, 0);
      const run = await f.current();
      assert.equal(run.routing!.stopReason?.kind, "BudgetExhausted");
      assert.equal(run.status, boundary === "verify" ? "BudgetExhausted" : "Unknown");
    } finally {
      await f.service.disposeAndWait();
    }
  }
});

test("late authoritative completion after an uncertain admission reconciles but never routes", async () => {
  const f = routingFixture();
  try {
    await f.prepare();
    f.options.native.send = async () => {
      throw Error("Lost native ACK");
    };
    await f.run();
    assert.equal((await f.current()).status, "Unknown");
    await f.emit("producer", '{"value":2}');
    const run = await f.current();
    assert.equal(
      run.nodeAttempts.find((a) => a.nodeId === "producer")!.terminalProof?.state,
      "completedSuccess",
    );
    assert.equal(run.status, "Interrupted");
    assert.equal(run.routing!.iterations.length, 1);
    assert.equal(f.creates.length, 1);
    assert.equal(run.routing!.conditionAttempts[0]!.status, "Pending");
  } finally {
    await f.service.disposeAndWait();
  }
});
