import assert from "node:assert/strict";
import test from "node:test";
import {
  appendGraphApproval,
  appendGraphTool,
  connectGraphNodes,
} from "../src/graph-engineering/graphEditing.js";
import {
  upgradeGraphRouting,
  graphSelectedAttempt,
  captureGraphRunConfirmation,
  captureGraphContinuation,
  graphRoutingCanContinue,
  parseGraphConditionDraft,
} from "../src/graph-engineering/graphRoutingView.js";
import type {
  GraphSequentialDefinition,
  GraphSequentialRun,
  GraphRunContinueCommand,
} from "@zcode/services";
const definition: GraphSequentialDefinition = {
  version: 4,
  revision: 3,
  name: "Synthetic",
  nodes: [],
  edges: [],
};
test("explicit routing upgrade freezes a new draft and later existing node edits never downgrade it", () => {
  const before = structuredClone(definition),
    next = upgradeGraphRouting(definition);
  assert.equal(next.version, 5);
  assert.deepEqual(definition, before);
  assert.equal(next.routing?.limits.maxNodeAdmissions, 32);
  assert.equal(appendGraphApproval(next, "gate", "Gate").version, 5);
  assert.equal(appendGraphTool(next, "tool", "Tool").version, 5);
  const branched = {
    ...next,
    edges: [
      { source: "decision", sourcePort: "pass", target: "gate" },
      { source: "decision", sourcePort: "repair", target: "repair" },
    ],
  };
  assert.deepEqual(connectGraphNodes(branched, "decision", "human", "pass").edges, [
    branched.edges[1],
    { source: "decision", sourcePort: "pass", target: "human" },
  ]);
});
test("iteration navigation resolves exact attempts while source arrays and native sessions stay unchanged", () => {
  const run = {
    version: 5,
    nodeAttempts: [
      { nodeId: "repair", attemptId: "a0", sessionId: "s0" },
      { nodeId: "repair", attemptId: "a1", sessionId: "s1" },
    ],
    routing: {
      currentIterationId: "i1",
      iterations: [
        { id: "i0", attemptIds: { repair: "a0" } },
        { id: "i1", attemptIds: { repair: "a1" } },
      ],
    },
  } as GraphSequentialRun;
  const before = structuredClone(run);
  assert.equal(graphSelectedAttempt(run, "repair")?.attemptId, "a1");
  assert.equal(graphSelectedAttempt(run, "repair", "a0")?.sessionId, "s0");
  assert.equal(graphSelectedAttempt(run, "repair", "foreign"), undefined);
  assert.equal(
    graphSelectedAttempt(
      { ...run, routing: { ...run.routing!, iterations: [{ id: "i1", attemptIds: {} }] as never } },
      "repair",
    ),
    undefined,
  );
  assert.deepEqual(run, before);
});
test("run confirmation and repeated continuation preserve exact original intent", () => {
  const settings = {
    modelSelection: { providerId: "synthetic", modelId: "one" },
    mode: "edit" as const,
    planEnabled: false,
  };
  const captured = captureGraphRunConfirmation(upgradeGraphRouting(definition), settings);
  settings.modelSelection.modelId = "two";
  assert.equal(captured.settings.modelSelection.modelId, "one");
  const request: GraphRunContinueCommand = {
    action: "continue",
    target: { workspacePath: "C:/synthetic" },
    runId: "run",
    requestId: "first",
    checkpointId: "check",
    checkpointDigest: "digest",
  };
  assert.deepEqual(captureGraphContinuation(request, { ...request, requestId: "second" }), request);
  assert.throws(() =>
    captureGraphContinuation(request, { ...request, checkpointDigest: "changed" }),
  );
});
test("route continuation is explicit and unavailable after uncertainty, cancel, stop or consumed checkpoint", () => {
  const checkpoint = { id: "check", digest: "digest", resumeRequired: true };
  const run = {
    status: "AwaitingContinuation",
    routing: { checkpoints: [checkpoint] },
  } as GraphSequentialRun;
  assert.equal(graphRoutingCanContinue(run), true);
  for (const status of ["Unknown", "Interrupted", "CancelRequested", "Completed"])
    assert.equal(graphRoutingCanContinue({ ...run, status } as GraphSequentialRun), false);
  assert.equal(graphRoutingCanContinue({ ...run, cancelRequestedAt: 1 }), false);
  assert.equal(
    graphRoutingCanContinue({
      ...run,
      routing: {
        ...run.routing!,
        stopReason: { kind: "BudgetExhausted", message: "limit", at: 1 },
      },
    }),
    false,
  );
  assert.equal(
    graphRoutingCanContinue({
      ...run,
      routing: { ...run.routing!, checkpoints: [{ ...checkpoint, consumedAt: 1 }] as never },
    }),
    false,
  );
});

test("condition draft rejects malformed render structures and accepts bounded declarative JSON", () => {
  const good = {
    inputs: [
      { alias: "review", source: { kind: "artifact", nodeId: "review", selector: "structured" } },
    ],
    branches: [
      {
        exit: "pass",
        predicate: { op: "eq", alias: "review", pointer: "/outcome", value: "pass" },
      },
    ],
    verification: { testNodeIds: ["test"], reviewerNodeId: "review", successExit: "pass" },
  };
  assert.deepEqual(
    parseGraphConditionDraft(
      JSON.stringify(good.inputs),
      JSON.stringify(good.branches),
      JSON.stringify(good.verification),
    ),
    good,
  );
  for (const branches of [
    "[null]",
    '[{"exit":"x","predicate":{"op":"eval","code":"throw"}}]',
    '[{"exit":1,"predicate":{}}]',
  ])
    assert.throws(() => parseGraphConditionDraft("[]", branches, "null"));
  assert.throws(() => parseGraphConditionDraft('[{"alias":"a","source":null}]', "[]", "null"));
  assert.throws(() => parseGraphConditionDraft("[]", "[]", '{"testNodeIds":false}'));
});
