import assert from "node:assert/strict";
import test from "node:test";
import { Emitter } from "@zcode/rpc";
import type {
  IModelSelectionService,
  ISettingService,
  IZCodeAgentService,
  IZCodeSessionService,
} from "@zcode/services";
import {
  conversationSnapshotSchema,
  V4_WIRE_PROTOCOL_VERSION,
  type ConversationDelta,
  type ConversationTopicWireCandidate,
} from "@zcode/shared/zcode-protocol-v4";
import type { GraphRun } from "../contract.js";
import type { GraphNativeFact } from "../app/ports.js";
import { createGraphNativePort } from "./native.js";

function fixture() {
  const target = { workspacePath: "C:/synthetic/graph-native-fixture" };
  const run: GraphRun = {
    id: "run",
    attemptId: "attempt",
    requestId: "request",
    target,
    definition: {
      revision: 1,
      name: "Fixture",
      taskName: "Task",
      instructions: "fixture-only input",
      nodes: [],
      edges: [],
    },
    modelSelection: { providerId: "fixture", modelId: "controlled" },
    mode: "build",
    planEnabled: true,
    commandId: "input",
    inputId: "input",
    sessionId: "session",
    runtimeIdentity: "runtime-1",
    status: "Starting",
    createdAt: 1,
    updatedAt: 1,
  };
  const frames = new Emitter<ConversationTopicWireCandidate>();
  const restarted = new Emitter<{ workspaceKey: string }>();
  const commands: Parameters<IZCodeAgentService["sendConversationCommandV4"]>[0][] = [];
  let identity = "runtime-1";
  let autoResolve = false;
  let cold = false;
  let ordinal = 0;
  let mismatchedAck = false;
  let rejection: { reasonCode: string; message: string } | undefined;
  let created: Parameters<IZCodeSessionService["createSession"]>[0] | undefined;
  const snapshot = conversationSnapshotSchema.parse({
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
    config: { provider: "fixture", model: "controlled", thought: "", followupMode: "queue" },
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
  const emit = (payload: unknown, fromSeq: number, toSeq: number, deliveryKind = "online") =>
    frames.fire({
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
    });
  const agentService = {
    async getWorkspaceRuntimeIdentity() {
      return { generation: 1, identity, workspaceKey: target.workspacePath };
    },
    onAgentRuntimeRestarted: restarted.event,
    onDynamicConversationFrame: () => frames.event,
    async subscribeConversationV4() {
      // Reproduce the real two-channel ordering: initial frame precedes the subscription ACK.
      emit({ kind: "snapshot", snapshot }, 0, 0, "initial");
      return {
        ack: {
          subscriptionId: "subscription",
          mode: "snapshot",
          logEpoch: "epoch",
          openTiming: { sessionRuntimeState: cold ? "cold" : "warm" },
        },
      };
    },
    async unsubscribeConversationV4() {},
    async setConnectionFlowStateV4() {},
    async sendConversationCommandV4(
      params: Parameters<IZCodeAgentService["sendConversationCommandV4"]>[0],
    ) {
      commands.push(params);
      if (rejection)
        return {
          commandId: params.envelope.commandId,
          status: "rejected",
          revisionAtDecision: 1,
          ...rejection,
        };
      return {
        commandId: params.envelope.commandId,
        status: "accepted",
        revisionAtDecision: 1,
        ...(params.envelope.type === "sendText"
          ? {
              result: {
                type: "inputAccepted",
                inputId: mismatchedAck ? "wrong-input" : "input",
                delivery: "startNow",
              },
            }
          : {}),
      };
    },
  } as unknown as IZCodeAgentService;
  const port = createGraphNativePort({
    agentService,
    sessionService: {
      async initializeWorkspace() {
        return { available: true, workspaceKey: target.workspacePath };
      },
      async createSession(params: Parameters<IZCodeSessionService["createSession"]>[0]) {
        assert.equal(
          "sessionId" in params,
          false,
          "normal native creates must allocate their own session ID",
        );
        created = params;
        return { session: { sessionId: "session" } };
      },
    } as unknown as IZCodeSessionService,
    settingService: {
      async get() {
        return { askUserQuestionAutoResolutionEnabled: autoResolve };
      },
    } as unknown as ISettingService,
    modelSelectionService: {
      async getView() {
        return {
          providers: [{ providerId: "fixture", models: [{ modelId: "controlled" }] }],
          effectiveSelection: run.modelSelection,
        };
      },
    } as unknown as IModelSelectionService,
  });
  const facts: GraphNativeFact[] = [];
  const lost: string[] = [];
  return {
    port,
    run,
    commands,
    facts,
    lost,
    snapshot,
    created: () => created,
    observe: () =>
      port.observe(
        run,
        (fact) => facts.push(fact),
        (reason) => lost.push(reason),
      ),
    emit: (deltas: ConversationDelta[], fromSeq: number, toSeq: number) =>
      emit({ kind: "deltas", deltas }, fromSeq, toSeq),
    setIdentity(value: string) {
      identity = value;
    },
    setAutoResolve() {
      autoResolve = true;
    },
    setCold() {
      cold = true;
    },
    mismatchAck() {
      mismatchedAck = true;
    },
    reject(message: string) {
      rejection = { reasonCode: "proto.commandFailed", message };
    },
  };
}

test("native adapter retains the native allocated session and sends frozen input only after real subscription readiness", async () => {
  const f = fixture();
  assert.deepEqual(await f.port.available(), { available: true });
  const { sessionId: _sessionId, ...beforeCreation } = f.run;
  assert.deepEqual(await f.port.create(beforeCreation), {
    sessionId: "session",
    runtimeIdentity: "runtime-1",
  });
  assert.equal(f.created()?.persistence, "deferred");
  assert.equal(f.created()?.sessionId, undefined);
  await assert.rejects(f.port.send(f.run), /runtime.*unavailable/i);
  const subscription = await f.observe();
  assert.deepEqual(await f.port.send(f.run), { accepted: true });
  assert.equal(f.commands[0]?.envelope.commandId, f.run.commandId);
  assert.equal(f.commands[0]?.expectedRuntimeIdentity, f.run.runtimeIdentity);
  assert.deepEqual(f.commands[0]?.envelope.payload, {
    text: "fixture-only input",
    modelSelection: f.run.modelSelection,
    mode: "build",
    planEnabled: true,
  });
  assert.equal(f.facts.length, 0);
  subscription.dispose();
});

test("rejected native input preserves useful message and reason code without unbounded diagnostic output", async () => {
  const f = fixture();
  const subscription = await f.observe();
  f.reject("Synthetic workspace persistence failed: missing session record.");
  const rejected = await f.port.send(f.run);
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reason!, /missing session record/);
  assert.match(rejected.reason!, /proto.commandFailed/);
  f.reject("Synthetic bounded detail ".repeat(1_000));
  const long = await f.port.send(f.run);
  assert.ok(long.reason!.length <= 2_000);
  assert.match(long.reason!, /Synthetic bounded detail/);
  assert.match(long.reason!, /proto.commandFailed/);
  subscription.dispose();
});

test("native adapter fails closed for auto-answer, cold restore, mismatched input acceptance and changed runtime", async () => {
  const f = fixture();
  f.setAutoResolve();
  assert.equal((await f.port.available()).available, false);
  f.setCold();
  await assert.rejects(f.observe(), /cold/i);
  const normal = fixture();
  const subscription = await normal.observe();
  normal.mismatchAck();
  await assert.rejects(normal.port.send(normal.run), /input identity/i);
  normal.setIdentity("runtime-2");
  await assert.rejects(normal.port.send(normal.run), /runtime.*unavailable/i);
  assert.equal(await normal.port.reconcile(normal.run), "interrupted");
  assert.equal(normal.commands.length, 1);
  subscription.dispose();
});

test("native cancellation targets only the foreground execution of the original input", async () => {
  const f = fixture();
  const subscription = await f.observe();
  await assert.rejects(f.port.cancel(f.run), /foreground/i);
  f.emit(
    [
      {
        op: "row.appended",
        row: {
          kind: "turnHeader",
          rowId: 1,
          turnId: "turn",
          sourceCommandId: "input",
          origin: "userInput",
          state: "running",
          startedAt: 1,
          createdAt: 1,
          createdAtSeq: 1,
        },
      },
      {
        op: "state.updated",
        patch: {
          control: {
            ...f.snapshot.control,
            activeWorks: [
              { kind: "primaryTurn", foregroundExecutionId: "execution", startedAt: 1 },
            ],
          },
        },
      },
    ],
    0,
    1,
  );
  await f.port.cancel({ ...f.run, foregroundExecutionId: "execution" });
  assert.equal(f.commands[0]?.envelope.type, "stop");
  assert.equal(f.commands[0]?.expectedRuntimeIdentity, f.run.runtimeIdentity);
  assert.deepEqual(f.commands[0]?.envelope.payload, { expectedForegroundExecutionId: "execution" });
  await assert.rejects(
    f.port.cancel({ ...f.run, foregroundExecutionId: "another" }),
    /foreground/i,
  );
  assert.equal(f.commands.length, 1);
  subscription.dispose();
});
