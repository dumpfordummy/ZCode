import assert from "node:assert/strict";
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

import type { GraphNativeFact, GraphNativeExecution } from "../app/ports.js";
import { createGraphNativePort } from "./native.js";

export function fixture() {
  const target = { workspacePath: "C:/synthetic/graph-native-fixture" };
  const run: GraphNativeExecution = {
    id: "run",
    attemptId: "attempt",
    target,
    instructions: "fixture-only input",
    modelSelection: { providerId: "fixture", modelId: "controlled" },
    mode: "build",
    planEnabled: true,
    commandId: "input",
    inputId: "input",
    sessionId: "session",
    runtimeIdentity: "runtime-1",
    createdAt: 1,
  };
  const frames = new Emitter<ConversationTopicWireCandidate>();
  const restarted = new Emitter<{ workspaceKey: string }>();
  const commands: Parameters<IZCodeAgentService["sendConversationCommandV4"]>[0][] = [];
  let identity = "runtime-1";
  let retired: { runtimeIdentity: string; workspaceKey: string; retiredAt: number } | null = null;
  const subscriptions: Parameters<IZCodeAgentService["subscribeConversationV4"]>[0][] = [];
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
    async getWorkspaceRuntimeRetirement() {
      return retired;
    },
    async subscribeConversationV4(
      params: Parameters<IZCodeAgentService["subscribeConversationV4"]>[0],
    ) {
      subscriptions.push(params);
      // Reproduce the real two-channel ordering: initial frame precedes the subscription ACK.
      emit({ kind: "snapshot", snapshot }, 0, snapshot.seq, "initial");
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
    subscriptions,
    setRetirement(value: typeof retired) {
      retired = value;
    },
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
