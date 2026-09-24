import {
  applyConversationDeltas,
  conversationTopic,
  conversationTopicFrameSchema,
  TopicWireFrameAssembler,
  type ConversationSnapshot,
  type ConversationTopicFrame,
  type ConversationTopicWireCandidate,
  type TopicFrameDeliveryKind,
} from "@zcode/shared/zcode-protocol-v4";
import type { GraphNativeFact } from "../app/ports.js";

const MAX_FINAL_OUTPUT_LENGTH = 100_000;

function finalOutput(
  snapshot: ConversationSnapshot,
  turnId: string,
): Pick<GraphNativeFact, "finalOutput" | "outputIssue"> {
  const row = snapshot.rows.window.findLast(
    (item) => item.kind === "assistantText" && item.turnId === turnId,
  );
  if (!row || row.kind !== "assistantText" || row.state !== "complete" || !row.text.trim()) {
    return { outputIssue: "The exact completed native input has no usable final assistant text." };
  }
  if (row.text.length > MAX_FINAL_OUTPUT_LENGTH) {
    return {
      outputIssue: `The final assistant text exceeds the ${MAX_FINAL_OUTPUT_LENGTH}-character handoff limit.`,
    };
  }
  return {
    finalOutput: {
      text: row.text,
      turnId: row.turnId,
      rowId: row.rowId,
      ...(row.entityId ? { entityId: row.entityId } : {}),
      ...(row.assistantResponseId ? { assistantResponseId: row.assistantResponseId } : {}),
    },
  };
}

interface ObserverOptions {
  sessionId: string;
  commandId: string;
  subscriptionId: string;
  logEpoch: string;
  allowInitialTerminal: boolean;
  fact(value: GraphNativeFact): void;
  lost(reason: string): void;
  initial(): void;
}

/** A bounded projection of one owned input; native conversation remains authoritative. */
export function createGraphConversationObserver(options: ObserverOptions) {
  const topic = conversationTopic(options.sessionId);
  const assembler = new TopicWireFrameAssembler(conversationTopicFrameSchema);
  let snapshot: ConversationSnapshot | undefined;
  let currentFact: GraphNativeFact | undefined;
  let stopped = false;

  function lose(reason: string) {
    if (stopped) return;
    stopped = true;
    assembler.clear();
    options.lost(reason);
  }

  function publish(initial: boolean) {
    if (!snapshot || stopped) return;
    const headers = snapshot.rows.window.filter((row) => row.kind === "turnHeader");
    const own = headers.findLast((row) => row.sourceCommandId === options.commandId);
    const pending = snapshot.pendingCommands.some(
      (command) => command.commandId === options.commandId,
    );
    if (!own && !pending) return;
    if (own && own.state !== "running" && initial && !options.allowInitialTerminal) {
      // 冷恢复会从消息合成成功 header；只有原进程的 warm 投影可作为终态证据。
      lose("Cold terminal history cannot prove the graph input outcome.");
      return;
    }
    const ownsForeground = own?.state === "running" && headers.at(-1) === own;
    const interaction = snapshot.pendingInteractions.find((item) => {
      if (item.anchorRowId === null) return ownsForeground || pending;
      return Boolean(
        own &&
        snapshot!.rows.window.some(
          (row) => row.rowId === item.anchorRowId && row.turnId === own.turnId,
        ),
      );
    });
    const foregroundExecutionId = ownsForeground
      ? snapshot.control.activeWorks.find((work) => work.kind === "primaryTurn")
          ?.foregroundExecutionId
      : undefined;
    currentFact = {
      sourceCommandId: options.commandId,
      state: own?.state ?? "running",
      ...(own ? { turnId: own.turnId } : {}),
      ...(own?.state === "completedSuccess" ? finalOutput(snapshot, own.turnId) : {}),
      ...(interaction
        ? { waiting: interaction.kind === "userInput" ? "userInput" : "permission" }
        : {}),
      ...(foregroundExecutionId ? { foregroundExecutionId } : {}),
      logEpoch: snapshot.logEpoch,
      seq: snapshot.seq,
    };
    options.fact(currentFact);
    if (currentFact.state !== "running") {
      stopped = true;
      assembler.clear();
    }
  }

  function apply(frame: ConversationTopicFrame, deliveryKind: TopicFrameDeliveryKind) {
    if (stopped) return;
    if (
      !Number.isSafeInteger(frame.fromSeq) ||
      !Number.isSafeInteger(frame.toSeq) ||
      frame.fromSeq < 0 ||
      frame.toSeq < frame.fromSeq
    ) {
      lose("Invalid graph conversation sequence range.");
      return;
    }
    if (snapshot && frame.toSeq <= snapshot.seq) return;
    if (deliveryKind === "recovery") {
      // 丢帧后不把恢复快照当实时成功；保留不确定状态，禁止自动补发。
      lose("Graph conversation requires recovery; input outcome is unknown.");
      return;
    }
    if (frame.payload.kind === "snapshot") {
      const incoming = frame.payload.snapshot;
      if (
        incoming.sessionId !== options.sessionId ||
        incoming.logEpoch !== options.logEpoch ||
        incoming.seq !== frame.toSeq ||
        frame.fromSeq !== 0
      ) {
        lose("Graph conversation snapshot identity or epoch changed.");
        return;
      }
      if (snapshot || deliveryKind !== "initial") {
        lose("Unexpected replacement graph conversation snapshot.");
        return;
      }
      snapshot = incoming;
      options.initial();
      publish(true);
      return;
    }
    if (
      !snapshot ||
      deliveryKind !== "online" ||
      frame.fromSeq !== snapshot.seq ||
      frame.toSeq <= frame.fromSeq
    ) {
      lose("Graph conversation sequence gap; input outcome is unknown.");
      return;
    }
    snapshot = { ...applyConversationDeltas(snapshot, frame.payload.deltas), seq: frame.toSeq };
    publish(false);
  }

  return {
    accept(wire: ConversationTopicWireCandidate) {
      if (stopped || wire.topic !== topic || wire.subscriptionId !== options.subscriptionId) return;
      for (const event of assembler.accept(wire)) {
        if (event.kind === "fault")
          lose(`Graph conversation frame rejected: ${event.fault.reasonCode}`);
        else apply(event.frame, event.deliveryKind);
      }
    },
    expire() {
      for (const event of assembler.expire()) {
        if (event.kind === "fault")
          lose(`Graph conversation assembly failed: ${event.fault.reasonCode}`);
      }
    },
    get nextExpiryAt() {
      return assembler.nextExpiryAt;
    },
    get currentFact() {
      return currentFact;
    },
    dispose() {
      stopped = true;
      assembler.clear();
    },
  };
}
