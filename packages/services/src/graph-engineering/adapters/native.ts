import { randomUUID } from "node:crypto";
import type { IDisposable } from "@zcode/rpc";
import {
  createZCodeAgentConnectionScope,
  type IModelSelectionService,
  type ISettingService,
  type IZCodeAgentService,
  type IZCodeSessionService,
} from "@zcode/services";
import { ZCODE_VERSION } from "@zcode/shared";
import {
  helloMessageSchema,
  V4_WIRE_PROTOCOL_VERSION,
  type CommandPayloadMap,
  type ConversationTopicWireCandidate,
} from "@zcode/shared/zcode-protocol-v4";
import type { GraphRun } from "../contract.js";
import type { GraphNativePort } from "../app/ports.js";
import { createGraphConversationObserver } from "./observer.js";

const INITIAL_SNAPSHOT_TIMEOUT_MS = 15_000;
const MAX_PENDING_FRAMES = 1_024;
const MAX_PENDING_BYTES = 32 * 1024 * 1024;
const MAX_NATIVE_DIAGNOSTIC_LENGTH = 2_000;

interface NativeOptions {
  agentService: IZCodeAgentService;
  sessionService: IZCodeSessionService;
  modelSelectionService: IModelSelectionService;
  settingService: ISettingService;
}
interface ActiveObserver {
  service: IZCodeAgentService;
  observer: ReturnType<typeof createGraphConversationObserver>;
  valid(): boolean;
  dispose(): void;
}

function requireSession(run: GraphRun): string {
  if (!run.sessionId) throw new Error("Graph attempt has no persisted native session identity.");
  return run.sessionId;
}
function clientId(run: GraphRun) {
  return `graph:${run.attemptId}`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createGraphNativePort(options: NativeOptions): GraphNativePort {
  const active = new Map<string, ActiveObserver>();

  async function sameRuntime(run: GraphRun): Promise<boolean> {
    if (!run.runtimeIdentity) return false;
    try {
      const identity = await options.agentService.getWorkspaceRuntimeIdentity(run.target);
      return identity.identity === run.runtimeIdentity;
    } catch {
      return false;
    }
  }
  async function requireCurrent(run: GraphRun): Promise<ActiveObserver> {
    const entry = active.get(run.id);
    if (!entry?.valid() || !(await sameRuntime(run))) {
      throw new Error("The original graph runtime is unavailable; work was not resubmitted.");
    }
    return entry;
  }

  const port: GraphNativePort = {
    async available() {
      const settings = await options.settingService.get();
      if (settings.askUserQuestionAutoResolutionEnabled !== false) {
        return {
          available: false,
          reason:
            "Disable automatic question resolution in Settings before running Graph Engineering. Native questions must wait for your response.",
        };
      }
      try {
        const view = await options.modelSelectionService.getView();
        return view.providers.some((provider) => provider.models.length > 0)
          ? { available: true }
          : {
              available: false,
              reason: "Configure an available model in the existing provider settings.",
            };
      } catch {
        return { available: false, reason: "The native model registry is unavailable." };
      }
    },
    async validateSelection(run) {
      const view = await options.modelSelectionService.getView({ selection: run.modelSelection });
      const effective = view.effectiveSelection;
      if (
        view.selectionIssue ||
        !effective ||
        effective.providerId !== run.modelSelection.providerId ||
        effective.modelId !== run.modelSelection.modelId ||
        effective.options?.reasoningLevel !== run.modelSelection.options?.reasoningLevel
      ) {
        throw new Error(
          `Select an available native model before running the graph (${view.selectionIssue ?? "selection changed"}).`,
        );
      }
    },
    async create(run) {
      const initialized = await options.sessionService.initializeWorkspace(run.target);
      if (!initialized.available)
        throw new Error(initialized.reason ?? "The native agent runtime is unavailable.");
      const before = await options.agentService.getWorkspaceRuntimeIdentity(run.target);
      const snapshot = await options.sessionService.createSession({
        ...run.target,
        // V4 admission 只会先持久化 deferred 草稿；直接标记 immediate 会漏掉 session 父行。
        persistence: "deferred",
        model: run.modelSelection,
        mode: run.mode,
      });
      const after = await options.agentService.getWorkspaceRuntimeIdentity(run.target);
      if (before.identity !== after.identity) {
        throw new Error("Native session creation identity changed; acceptance is unknown.");
      }
      // 普通 native create 由运行时分配 ID；调用方必须先持久化返回值，再订阅或发送输入。
      return { sessionId: snapshot.session.sessionId, runtimeIdentity: after.identity };
    },
    async observe(run, fact, lost) {
      const sessionId = requireSession(run);
      if (!(await sameRuntime(run)))
        throw new Error("The original graph runtime no longer exists.");
      active.get(run.id)?.dispose();
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
        active.delete(run.id);
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
            (event.state === "unavailable" ||
              event.runtimeIdentity.identity !== run.runtimeIdentity)
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
        if (
          result.ack.mode !== "snapshot" ||
          result.ack.openTiming?.sessionRuntimeState === "cold"
        ) {
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
        active.set(run.id, {
          service: scope.service,
          observer,
          valid: () => !invalid && !disposed,
          dispose,
        });
        return { dispose };
      } catch (error) {
        dispose();
        throw error;
      }
    },
    async send(run) {
      const entry = await requireCurrent(run);
      const payload: CommandPayloadMap["sendText"] = {
        text: run.definition.instructions,
        modelSelection: run.modelSelection,
        mode: run.mode,
        ...(run.planEnabled === undefined ? {} : { planEnabled: run.planEnabled }),
      };
      const ack = await entry.service.sendConversationCommandV4({
        ...run.target,
        expectedRuntimeIdentity: run.runtimeIdentity,
        envelope: {
          commandId: run.commandId,
          clientId: clientId(run),
          sessionId: requireSession(run),
          type: "sendText",
          payload,
          issuedAt: run.createdAt,
        },
      });
      if (ack.commandId !== run.commandId || !(await sameRuntime(run)))
        throw new Error("Native input acceptance could not be correlated to the original runtime.");
      if (ack.status === "accepted" || ack.status === "duplicate") {
        if (ack.result?.type !== "inputAccepted" || ack.result.inputId !== run.inputId) {
          throw new Error("Native input acceptance did not prove the persisted input identity.");
        }
        return { accepted: true };
      }
      return {
        accepted: false,
        // 原生 reasonCode 只标记错误类别；保留 message 才能解释实际失败原因，禁止展开整个 ACK。
        reason:
          [ack.reasonCode, ack.message?.trim()]
            .filter(Boolean)
            .join(": ")
            .slice(0, MAX_NATIVE_DIAGNOSTIC_LENGTH) || `Native input ${ack.status}.`,
      };
    },
    async cancel(run) {
      const entry = await requireCurrent(run);
      const current = entry.observer.currentFact;
      if (
        !run.foregroundExecutionId ||
        current?.state !== "running" ||
        current.foregroundExecutionId !== run.foregroundExecutionId
      ) {
        throw new Error(
          "The original foreground execution is not available for safe cancellation.",
        );
      }
      const ack = await entry.service.sendConversationCommandV4({
        ...run.target,
        expectedRuntimeIdentity: run.runtimeIdentity,
        envelope: {
          commandId: `${run.commandId}:stop`,
          clientId: clientId(run),
          sessionId: requireSession(run),
          type: "stop",
          payload: {
            expectedForegroundExecutionId: run.foregroundExecutionId,
          } satisfies CommandPayloadMap["stop"],
          issuedAt: Date.now(),
        },
      });
      if (ack.commandId !== `${run.commandId}:stop` || !(await sameRuntime(run))) {
        throw new Error("Native cancellation could not be correlated to the original runtime.");
      }
      if (ack.status !== "accepted" && ack.status !== "duplicate")
        throw new Error(ack.reasonCode ?? "Native cancellation was not accepted.");
    },
    async reconcile(run) {
      return (await sameRuntime(run)) ? "same-runtime" : "interrupted";
    },
  };
  return port;
}
