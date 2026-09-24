import assert from "node:assert/strict";
import test from "node:test";
import { routingDefinition, routingFixture } from "./routing.fixture.js";
import { target } from "./sequential.fixture.js";

test("an approved intermediate gate can admit its fresh native successor without becoming stale", async () => {
  const fixture = routingFixture();
  try {
    const graph = routingDefinition();
    graph.nodes.push({
      id: "intermediate",
      type: "approval",
      position: { x: 0, y: 0 },
      name: "Approve next work",
      reviewInstructions: "Review the completed analysis",
      commentPolicy: "required",
      evidence: [{ alias: "analysis", source: { kind: "node", nodeId: "producer" } }],
    });
    for (const edge of graph.edges) if (edge.target === "merge") edge.target = "intermediate";
    graph.edges.push({ source: "intermediate", target: "merge" });
    await fixture.prepare(graph);
    await fixture.run();
    await fixture.emit("producer", '{"value":2}');
    await fixture.emit("positive", "Completed branch");
    const waiting = await fixture.current();
    assert.equal(waiting.status, "WaitingForApproval");
    const request = waiting.approvalAttempts!.find((a) => a.nodeId === "intermediate")!.request!;
    await fixture.service.decideApproval({
      target,
      runId: waiting.id,
      nodeId: "intermediate",
      requestId: request.id,
      requestVersion: request.version,
      requestDigest: request.digest,
      decisionId: "approve-next-work",
      value: "approve",
      comment: "The analysis is reviewed; perform the next step",
    });
    const active = await fixture.current();
    assert.equal(
      active.approvalAttempts!.find((a) => a.nodeId === "intermediate")!.status,
      "Approved",
    );
    assert.equal(fixture.creates.length, 3);
    assert.equal(fixture.sends.length, 3);
    assert.equal(
      fixture.sends.at(-1)!.attemptId,
      active.nodeAttempts.find((a) => a.nodeId === "merge")!.attemptId,
    );
    assert.equal(new Set(fixture.sends.map((input) => input.sessionId)).size, 3);
    await fixture.emit("merge", "Final result");
    assert.equal((await fixture.current()).status, "WaitingForApproval");
  } finally {
    await fixture.service.disposeAndWait();
  }
});
