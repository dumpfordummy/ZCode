import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationSnapshotSchema,
  V4_WIRE_PROTOCOL_VERSION,
  type ConversationDelta,
  type ConversationSnapshot,
  type ConversationTopicWireCandidate,
  type TurnHeaderRow,
} from "@zcode/shared/zcode-protocol-v4";
import { createGraphConversationObserver } from "./observer.js";
import type { GraphNativeFact } from "../app/ports.js";

function snapshot(): ConversationSnapshot {
  return conversationSnapshotSchema.parse({
    protocolVersion: 1,
    sessionId: "session",
    logEpoch: "epoch",
    seq: 0,
    revision: 0,
    control: {
      phase: "draft",
      sessionEnded: false,
      canStop: false,
      stopState: "idle",
      stopTargetKind: "unknown",
      activeWorks: [],
      lastError: null,
      apiRetry: null,
    },
    availability: Object.fromEntries(
      [
        "fork",
        "compact",
        "switchModelConfig",
        "setFollowupMode",
        "queueEdit",
        "sendQueuedNow",
        "pauseGoal",
        "resumeGoal",
      ].map((key) => [key, { allowed: true }]),
    ),
    inputRouting: { mode: "startNow" },
    config: { provider: "fixture", model: "fixture", thought: "", followupMode: "queue" },
    usage: {
      contextWindow: null,
      cumulative: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
    queue: { items: [], autoDrain: true },
    pendingInteractions: [],
    pendingCommands: [],
    backgroundWorks: [],
    goal: null,
    plan: null,
    rows: { window: [], totalCount: 0, firstRowId: null },
  });
}
function turn(state: TurnHeaderRow["state"], sourceCommandId = "command"): TurnHeaderRow {
  return {
    kind: "turnHeader",
    rowId: 1,
    turnId: "turn",
    sourceCommandId,
    origin: "userInput",
    state,
    startedAt: 1,
    createdAt: 1,
    createdAtSeq: 1,
  };
}
function harness(allowInitialTerminal = false) {
  const facts: GraphNativeFact[] = [];
  const lost: string[] = [];
  let initial = 0;
  let ordinal = 0;
  const observer = createGraphConversationObserver({
    sessionId: "session",
    commandId: "command",
    subscriptionId: "subscription",
    logEpoch: "epoch",
    allowInitialTerminal,
    fact: (fact) => facts.push(fact),
    lost: (reason) => lost.push(reason),
    initial: () => initial++,
  });
  function wire(
    payload: unknown,
    fromSeq: number,
    toSeq: number,
    deliveryKind = "online",
  ): ConversationTopicWireCandidate {
    return {
      wireVersion: V4_WIRE_PROTOCOL_VERSION,
      kind: "complete",
      deliveryKind,
      logicalFrameId: `frame-${++ordinal}`,
      logicalFrameOrdinal: ordinal,
      topic: "conversation/session",
      subscriptionId: "subscription",
      frame: {
        topic: "conversation/session",
        subscriptionId: "subscription",
        fromSeq,
        toSeq,
        sentAt: 1,
        payload,
      },
    };
  }
  const start = (value = snapshot()) =>
    observer.accept(wire({ kind: "snapshot", snapshot: value }, 0, value.seq, "initial"));
  const delta = (deltas: ConversationDelta[], from: number, to: number) =>
    observer.accept(wire({ kind: "deltas", deltas }, from, to));
  return { observer, facts, lost, start, delta, wire, initial: () => initial };
}

test("observer matches original input, reflects waiting and freezes exact terminal outcome", () => {
  const f = harness();
  f.start();
  f.delta([{ op: "row.appended", row: turn("completedSuccess", "previous") }], 0, 1);
  assert.equal(f.facts.length, 0);
  f.delta(
    [
      { op: "row.upserted", row: turn("running") },
      {
        op: "state.updated",
        patch: {
          control: {
            ...snapshot().control,
            activeWorks: [
              { kind: "primaryTurn", foregroundExecutionId: "execution", startedAt: 1 },
            ],
          },
          pendingInteractions: [
            {
              interactionId: "question",
              kind: "userInput",
              anchorRowId: 1,
              createdAt: 1,
              payload: { kind: "userInput", prompt: "Choose", freeText: true },
            },
          ],
        },
      },
    ],
    1,
    2,
  );
  assert.equal(f.facts.at(-1)?.waiting, "userInput");
  assert.equal(f.facts.at(-1)?.foregroundExecutionId, "execution");
  f.delta([{ op: "row.upserted", row: turn("completedSuccess") }], 2, 3);
  f.delta([{ op: "row.upserted", row: turn("failed") }], 3, 4);
  assert.equal(f.facts.at(-1)?.state, "completedSuccess");
  assert.equal(f.facts.at(-1)?.seq, 3);
});

test("duplicate/out-of-order and foreign subscription frames cannot alter facts", () => {
  const f = harness();
  f.start();
  f.delta([{ op: "row.appended", row: turn("running") }], 0, 1);
  f.delta([{ op: "row.upserted", row: turn("failed") }], 0, 1);
  const foreign = f.wire(
    { kind: "deltas", deltas: [{ op: "row.upserted", row: turn("completedSuccess") }] },
    1,
    2,
  );
  f.observer.accept({ ...foreign, subscriptionId: "another-subscription" });
  assert.equal(f.facts.length, 1);
  assert.equal(f.facts[0]?.state, "running");
});

test("gap, epoch change and cold terminal snapshot fail closed without fabricated success", () => {
  const gap = harness();
  gap.start();
  gap.delta([{ op: "row.appended", row: turn("completedSuccess") }], 2, 3);
  assert.equal(gap.facts.length, 0);
  assert.match(gap.lost[0]!, /gap/i);
  const epoch = harness();
  epoch.start({ ...snapshot(), logEpoch: "different" });
  assert.equal(epoch.initial(), 0);
  assert.match(epoch.lost[0]!, /epoch/i);
  const cold = harness();
  cold.start({
    ...snapshot(),
    rows: { window: [turn("completedSuccess")], totalCount: 1, firstRowId: 1 },
  });
  assert.equal(cold.facts.length, 0);
  assert.match(cold.lost[0]!, /cold|terminal/i);
});

test("verified warm original-runtime snapshot can reconcile original input", () => {
  const warm = harness(true);
  warm.start({
    ...snapshot(),
    seq: 7,
    rows: { window: [turn("completedInterrupted")], totalCount: 1, firstRowId: 1 },
  });
  assert.equal(warm.facts[0]?.state, "completedInterrupted");
  assert.equal(warm.facts[0]?.seq, 7);
});
