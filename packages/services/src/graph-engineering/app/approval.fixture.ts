import { createHash } from "node:crypto";
import type {
  GraphApprovalCommand,
  GraphApprovalNode,
  GraphSequentialRun,
  GraphSourceSnapshot,
} from "../contract.js";
import type { GraphRecord } from "./ports.js";
import { sequentialServiceFixture, sequenceDefinition, target } from "./sequential.fixture.js";

export function approvalDefinition(
  options: { entry?: boolean; final?: boolean; source?: boolean } = {},
) {
  const graph = sequenceDefinition();
  graph.version = 3;
  const gate = (id: string, after: string): GraphApprovalNode => ({
    id,
    type: "approval",
    position: { x: 0, y: 0 },
    name: id,
    reviewInstructions: `Review ${id}`,
    commentPolicy: "optional",
    evidence: [
      {
        alias: "review",
        source: after === "start" ? { kind: "start" } : { kind: "node", nodeId: after },
      },
      ...(options.source ? [{ alias: "code", source: { kind: "source" as const } }] : []),
    ],
  });
  const insert = (id: string, after: string) => {
    const edge = graph.edges.find((e) => e.source === after)!;
    graph.nodes.push(gate(id, after));
    graph.edges.push({ source: id, target: edge.target });
    edge.target = id;
  };
  insert("review", "analyze");
  if (options.entry) insert("entry", "start");
  if (options.final) insert("final", "verify");
  return graph;
}
export function approvalFixture(initial?: GraphRecord) {
  let snapshot: GraphSourceSnapshot = {
    baseline: "head-A/index-A",
    scope: "changed+untracked; ignored excluded",
    complete: true,
    issues: [],
    files: [
      { path: "fixture.txt", status: "unstaged:M", beforeText: "before", afterText: "after" },
    ],
  };
  let captures = 0;
  const evidence = {
    digest: (s: string) => createHash("sha256").update(s).digest("hex"),
    captureSource: async () => {
      captures++;
      return structuredClone(snapshot);
    },
  };
  const fixture = sequentialServiceFixture(initial, evidence);
  return {
    ...fixture,
    evidence,
    captures: () => captures,
    setSnapshot: (s: GraphSourceSnapshot) => {
      snapshot = s;
    },
  };
}
export function command(run: GraphSequentialRun, nodeId = "review"): GraphApprovalCommand {
  const r = run.approvalAttempts!.find((a) => a.nodeId === nodeId)!.request!;
  return {
    target,
    runId: run.id,
    nodeId,
    requestId: r.id,
    requestVersion: r.version,
    requestDigest: r.digest,
  };
}
export async function pending(
  options: { source?: boolean; entry?: boolean; final?: boolean } = {},
) {
  const f = approvalFixture();
  await f.prepare(approvalDefinition(options));
  await f.run();
  if (!options.entry) {
    f.emit(0, "completedSuccess", "Literal independently supplied analysis");
    await f.settle();
  }
  return f;
}
export async function approve(
  f: ReturnType<typeof approvalFixture>,
  nodeId = "review",
  decisionId = "decision",
) {
  return f.service.decideApproval({
    ...command(await f.current(), nodeId),
    decisionId,
    value: "approve",
    comment: "Reviewed synthetic evidence",
  });
}
