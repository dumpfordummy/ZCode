import { randomUUID } from "node:crypto";
import type { IDisposable } from "@zcode/rpc";
import { createZCodeAgentConnectionScope, type IZCodeAgentService } from "@zcode/services";
import { ZCODE_VERSION } from "@zcode/shared";
import {
  helloMessageSchema,
  V4_WIRE_PROTOCOL_VERSION,
  type ConversationTopicWireCandidate,
} from "@zcode/shared/zcode-protocol-v4";
import type { GraphNativeExecution, GraphNativeFact } from "../app/ports.js";
import { createGraphConversationObserver } from "./observer.js";

const INITIAL_SNAPSHOT_TIMEOUT_MS = 15_000;
const MAX_PENDING_FRAMES = 1_024;
const MAX_PENDING_BYTES = 32 * 1024 * 1024;
export interface ActiveObserver {
  service: IZCodeAgentService;
  observer: ReturnType<typeof createGraphConversationObserver>;
  valid(): boolean;
  dispose(): void;
}
function clientId(run: GraphNativeExecution) {
  return `graph:${run.attemptId}`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function observeGraphExecution(
  options: { agentService: IZCodeAgentService },
  run: GraphNativeExecution,
  fact: (value: GraphNativeFact) => void,
  lost: (reason: string) => void,
  sameRuntime: (run: GraphNativeExecution) => Promise<boolean>,
  onDispose?: () => void,
): Promise<ActiveObserver> {
  const sessionId = run.sessionId;
  if (!sessionId) throw new Error("Graph attempt has no persisted native session identity.");
  if (!(await sameRuntime(run))) throw new Error("The original graph runtime no longer exists.");
  const scope = createZCodeAgentConnectionScope(options.agentService, {
    connectionId: `graph:${run.attemptId}:${randomUUID()}`,
    clientMode: "desktop-continuous",
  });
  let invalid = false;
  let disposed = false;
  let observer: ReturnType<typeof createGraphConversationObserver> | undefined;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;
  let fragmentTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingBytes = 0;
  const pending: ConversationTopicWireCandidate[] = [];
  const subscriptions: IDisposable[] = [];
  const initial = Promise.withResolvers<void>();
  // subscribe 与初帧使用两个通道；先挂接 rejection，避免 early disconnect 产生未处理拒绝。
  void initial.promise.catch(() => {});
  const fail = (reason: string) => {
    if (invalid || disposed) return;
    invalid = true;
    clearTimeout(initialTimer);
    clearTimeout(fragmentTimer);
    observer?.dispose();
    initial.reject(new Error(reason));
    lost(reason);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(initialTimer);
    clearTimeout(fragmentTimer);
    for (const subscription of subscriptions) subscription.dispose();
    observer?.dispose();
    pending.length = 0;
    onDispose?.();
    void scope
      .dispose()
      .catch((error: unknown) => lost(`Graph observation cleanup failed: ${message(error)}`));
  };
  const scheduleExpiry = () => {
    clearTimeout(fragmentTimer);
    const at = observer?.nextExpiryAt;
    if (at != null) {
      fragmentTimer = setTimeout(() => observer?.expire(), Math.max(1, at - Date.now()));
      fragmentTimer.unref();
    }
  };
  try {
    const hello = helloMessageSchema.parse(await scope.service.helloConversationV4());
    await scope.service.initializeConversationV4({
      kind: "clientHello",
      protocolVersion: V4_WIRE_PROTOCOL_VERSION,
      clientId: clientId(run),
      clientKind: "desktop",
      appVersion: ZCODE_VERSION,
      capabilities: {
        workspaceHookReviewUi: true,
        ...(hello.capabilities.workflowRunDeltas ? { workflowRunDeltas: true } : {}),
      },
    });
    const workspaceKey = run.target.workspaceIdentity?.trim() || run.target.workspacePath;
    subscriptions.push(
      options.agentService.onAgentRuntimeRestarted((event) => {
        if (event.workspaceKey === workspaceKey)
          fail("The native graph runtime restarted; input outcome is unknown.");
      }),
    );
    const lifecycle = options.agentService.onAgentRuntimeLifecycle?.((event) => {
      if (
        event.workspaceKey === workspaceKey &&
        (event.state === "unavailable" || event.runtimeIdentity.identity !== run.runtimeIdentity)
      ) {
        fail("The native graph runtime disconnected; input outcome is unknown.");
      }
    });
    if (lifecycle) subscriptions.push(lifecycle);
    subscriptions.push(
      scope.service.onDynamicConversationFrame(run.target)((wire) => {
        if (invalid || disposed) return;
        if (observer) {
          observer.accept(wire);
          scheduleExpiry();
          return;
        }
        pendingBytes += Buffer.byteLength(JSON.stringify(wire));
        if (pending.length >= MAX_PENDING_FRAMES || pendingBytes > MAX_PENDING_BYTES) {
          fail("Graph subscription initial frame buffer exceeded its limit.");
          return;
        }
        pending.push(wire);
      }),
    );
    const result = await scope.service.subscribeConversationV4({
      ...run.target,
      sessionId,
      visibility: "background",
      expectedRuntimeIdentity: run.runtimeIdentity,
    });
    if (invalid || !(await sameRuntime(run)))
      throw new Error("Graph runtime changed while subscribing.");
    if (run.observationEpoch && result.ack.logEpoch !== run.observationEpoch)
      throw new Error("The original graph observation epoch changed.");
    if (result.ack.mode !== "snapshot" || result.ack.openTiming?.sessionRuntimeState === "cold") {
      throw new Error("Cold native session history cannot verify an active graph attempt.");
    }
    observer = createGraphConversationObserver({
      sessionId,
      commandId: run.commandId,
      subscriptionId: result.ack.subscriptionId,
      logEpoch: result.ack.logEpoch,
      allowInitialTerminal: result.ack.openTiming?.sessionRuntimeState === "warm",
      fact,
      lost: fail,
      initial: () => {
        clearTimeout(initialTimer);
        initial.resolve();
      },
    });
    initialTimer = setTimeout(
      () => fail("Native graph initial snapshot did not arrive; no input was resubmitted."),
      INITIAL_SNAPSHOT_TIMEOUT_MS,
    );
    initialTimer.unref();
    for (const wire of pending.splice(0)) observer.accept(wire);
    scheduleExpiry();
    await initial.promise;
    if (invalid || !(await sameRuntime(run)))
      throw new Error("Graph runtime changed before observation was ready.");
    return {
      service: scope.service,
      observer,
      valid: () => !invalid && !disposed,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
