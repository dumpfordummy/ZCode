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
import { validateDefinition, validateReadiness } from "../domain/definition.js";

test("Z3 readiness preserves v2, requires explicit evidence and earlier task sources", () => {
  const graph = approvalDefinition();
  assert.deepEqual(validateReadiness(graph).errors, []);
  assert.throws(() => validateDefinition({ ...graph, version: 2 }), /version-3/);
  const node = graph.nodes.find((n) => n.type === "approval")!;
  if (node.type !== "approval") throw Error();
  node.evidence = [];
  assert.match(validateReadiness(graph).errors.join(" "), /evidence/);
  node.evidence = [{ alias: "bad", source: { kind: "node", nodeId: "verify" } }];
  assert.match(validateReadiness(graph).errors.join(" "), /earlier/);
});
test("gate freezes exact upstream evidence, performs zero native work until one explicit winner", async () => {
  const f = await pending();
  const run = await f.current();
  const request = run.approvalAttempts![0]!.request!;
  assert.equal(run.status, "WaitingForApproval");
  assert.equal(f.creates.length, 1);
  assert.equal(f.sends.length, 1);
  assert.equal(request.evidence[0]!.text, "Literal independently supplied analysis");
  assert.equal(request.evidence[0]!.sourceSessionId, f.creates.length ? "native-1" : undefined);
  const payload = {
    ...command(run),
    decisionId: "once",
    value: "approve" as const,
    comment: "Review",
  };
  const outcomes = await Promise.allSettled([
    f.service.decideApproval(payload),
    f.service.decideApproval(payload),
    f.service.decideApproval({ ...payload, decisionId: "conflicting", value: "reject" }),
  ]);
  assert.deepEqual(
    outcomes.map((o) => o.status),
    ["fulfilled", "fulfilled", "rejected"],
  );
  assert.equal(f.sends.length, 2);
  assert.equal(f.creates.length, 2);
  const after = await f.current();
  assert.deepEqual(after.approvalAttempts![0]!.request, request);
  assert.equal(after.approvalAttempts![0]!.decision?.actor.kind, "local-user");
  await assert.rejects(f.service.decideApproval({ ...payload, comment: "changed" }), /conflict/);
});
test("entry and final gates are real controls; final output completes only after final approval", async () => {
  const f = await pending({ entry: true, final: true });
  assert.equal(f.sends.length, 0);
  await approve(f, "entry", "entry-d");
  assert.equal(f.sends.length, 1);
  f.emit(0, "completedSuccess", "analyzed");
  await f.settle();
  await approve(f);
  f.emit(1, "completedSuccess", "implemented");
  await f.settle();
  f.emit(2, "completedSuccess", "verified");
  await f.settle();
  assert.equal((await f.current()).status, "WaitingForApproval");
  assert.equal(f.sends.length, 3);
  await approve(f, "final", "final-d");
  assert.equal((await f.current()).status, "Completed");
  assert.equal((await f.current()).result?.text, "verified");
  assert.equal(f.sends.length, 3);
});
test("cancel/reject waiting gates have no stop or successor; late decisions cannot resurrect", async () => {
  for (const action of ["cancel", "reject"] as const) {
    const f = await pending();
    const run = await f.current();
    if (action === "cancel") await f.service.cancel({ target, runId: run.id });
    else
      await f.service.decideApproval({
        ...command(run),
        decisionId: "reject",
        value: "reject",
        comment: "No",
      });
    assert.equal((await f.current()).status, action === "cancel" ? "Cancelled" : "Rejected");
    assert.equal(f.cancellations.length, 0);
    assert.equal(f.sends.length, 1);
    await assert.rejects(approve(f), /cannot|conflict/);
    assert.equal(f.sends.length, 1);
  }
});
test("required comment, stale request version and incomplete source evidence never authorize", async () => {
  const f = approvalFixture();
  const graph = approvalDefinition({ entry: true, source: true });
  const gate = graph.nodes.find((n) => n.id === "entry")!;
  if (gate.type !== "approval") throw Error();
  gate.commentPolicy = "required";
  await f.prepare(graph);
  await f.run();
  const run = await f.current();
  const base = {
    ...command(run, "entry"),
    decisionId: "d",
    value: "approve" as const,
    comment: "",
  };
  await assert.rejects(f.service.decideApproval(base), /comment/);
  await assert.rejects(
    f.service.decideApproval({ ...base, comment: "ok", requestVersion: 2 }),
    /conflict/,
  );
  f.setSnapshot({
    baseline: "head-A/index-A",
    scope: "bounded",
    complete: false,
    issues: ["Binary blob"],
    files: [{ path: "image.bin", status: "untracked", issue: "binary" }],
  });
  await assert.rejects(f.service.decideApproval({ ...base, comment: "ok" }), /changed/);
  assert.equal(f.sends.length, 0);
  assert.equal((await f.current()).status, "StaleEvidence");
  const g = approvalFixture();
  g.setSnapshot({
    baseline: "none",
    scope: "unavailable",
    complete: false,
    issues: ["No Git repository"],
    files: [],
  });
  await g.prepare(approvalDefinition({ entry: true, source: true }));
  await g.run();
  assert.equal(
    (await g.current()).approvalAttempts!.find((a) => a.nodeId === "entry")!.request!.complete,
    false,
  );
  await assert.rejects(approve(g, "entry"), /incomplete/);
  assert.equal(g.sends.length, 0);
});
test("graph changes and source changes invalidate review while frozen evidence remains unchanged", async () => {
  for (const change of ["graph", "source"]) {
    const f = await pending({ source: true });
    const run = await f.current(),
      snapshot = structuredClone(run.approvalAttempts![0]!.request);
    if (change === "graph") {
      const v = await f.view();
      await f.service.saveDefinition({
        target,
        definition: { ...v.definition, name: "Changed" },
        expectedRevision: v.definition.revision,
      });
    } else
      f.setSnapshot({
        baseline: "head-B",
        scope: "changed+untracked",
        complete: true,
        issues: [],
        files: [],
      });
    await assert.rejects(approve(f), /changed/);
    assert.equal(f.sends.length, 1);
    assert.equal((await f.current()).status, "StaleEvidence");
    assert.deepEqual((await f.current()).approvalAttempts![0]!.request, snapshot);
  }
});
test("cold pending gate keeps exact request and demands explicit Continue before decision", async () => {
  const f = await pending();
  const original = await f.current();
  await f.service.disposeAndWait();
  const restored = approvalFixture(f.saved());
  const cold = await restored.current();
  assert.equal(cold.status, "AwaitingContinuation");
  assert.deepEqual(cold.approvalAttempts![0]!.request, original.approvalAttempts![0]!.request);
  assert.equal(restored.sends.length, 0);
  await assert.rejects(approve(restored), /Continue/);
  await restored.service.continueApproval(command(cold));
  assert.equal(restored.sends.length, 0);
  await approve(restored);
  assert.equal(restored.sends.length, 1);
  await assert.rejects(restored.service.continueApproval(command(cold)), /blocked/);
});

test("changed frozen native settings cannot inherit a previously displayed request", async () => {
  const f = await pending();
  const saved = structuredClone(f.saved());
  await f.service.disposeAndWait();
  const run = saved.runs[0];
  if (!run || run.version !== 3) throw Error("Expected Z3 fixture");
  run.nodeAttempts[1]!.settings.mode = "plan";
  const restored = approvalFixture(saved);
  const cold = await restored.current();
  await assert.rejects(restored.service.continueApproval(command(cold)), /settings|changed/);
  assert.equal((await restored.current()).status, "StaleEvidence");
  assert.equal(restored.sends.length, 0);
});
