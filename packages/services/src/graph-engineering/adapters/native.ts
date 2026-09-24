import {
  type IModelSelectionService,
  type ISettingService,
  type IZCodeAgentService,
  type IZCodeSessionService,
} from "@zcode/services";
import type { CommandPayloadMap } from "@zcode/shared/zcode-protocol-v4";
import type { GraphNativePort, GraphNativeExecution } from "../app/ports.js";
import { observeGraphExecution, type ActiveObserver } from "./observation.js";

const MAX_NATIVE_DIAGNOSTIC_LENGTH = 2_000;

interface NativeOptions {
  agentService: IZCodeAgentService;
  sessionService: IZCodeSessionService;
  modelSelectionService: IModelSelectionService;
  settingService: ISettingService;
}

function requireSession(run: GraphNativeExecution): string {
  if (!run.sessionId) throw new Error("Graph attempt has no persisted native session identity.");
  return run.sessionId;
}
function clientId(run: GraphNativeExecution) {
  return `graph:${run.attemptId}`;
}

export function createGraphNativePort(options: NativeOptions): GraphNativePort {
  const active = new Map<string, ActiveObserver>();

  async function sameRuntime(run: GraphNativeExecution): Promise<boolean> {
    if (!run.runtimeIdentity) return false;
    try {
      const identity = await options.agentService.getWorkspaceRuntimeIdentity(run.target);
      return identity.identity === run.runtimeIdentity;
    } catch {
      return false;
    }
  }
  async function requireCurrent(run: GraphNativeExecution): Promise<ActiveObserver> {
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
      active.get(run.id)?.dispose();
      const entry = await observeGraphExecution(options, run, fact, lost, sameRuntime, () =>
        active.delete(run.id),
      );
      active.set(run.id, entry);
      return { dispose: () => entry.dispose() };
    },
    async send(run) {
      const entry = await requireCurrent(run);
      const payload: CommandPayloadMap["sendText"] = {
        text: run.instructions,
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
    async inspect(run) {
      if (!run.runtimeIdentity || !run.sessionId || run.inputId !== run.commandId) {
        return {
          kind: "unknown",
          reason: "The original native session, input or runtime identity is unproven.",
        };
      }
      if (!(await sameRuntime(run))) {
        try {
          const receipt = await options.agentService.getWorkspaceRuntimeRetirement({
            ...run.target,
            expectedRuntimeIdentity: run.runtimeIdentity,
          });
          const workspaceKey = run.target.workspaceIdentity?.trim() || run.target.workspacePath;
          if (
            receipt?.runtimeIdentity === run.runtimeIdentity &&
            receipt.workspaceKey === workspaceKey &&
            Number.isFinite(receipt.retiredAt)
          ) {
            return { kind: "inactive", proof: { kind: "runtime-retired", ...receipt } };
          }
        } catch {
          // 读取失败不是退出证明；原始进程清理尚未确认时必须继续保护输入。
        }
        return {
          kind: "unknown",
          reason:
            "The original runtime is unavailable and this Host has no confirmed retirement receipt. A replacement runtime or cold conversation cannot prove inactivity.",
        };
      }
      let inspection: ActiveObserver | undefined;
      let lostReason: string | undefined;
      try {
        // 检查使用独立订阅，不能替换运行中的观察者或顺带恢复顺序调度。
        inspection = await observeGraphExecution(
          options,
          run,
          () => {},
          (reason) => {
            lostReason = reason;
          },
          sameRuntime,
        );
        if (lostReason || !inspection.valid() || !(await sameRuntime(run))) {
          return {
            kind: "unknown",
            reason: lostReason ?? "The original runtime changed during inspection.",
          };
        }
        const fact = inspection.observer.currentFact;
        if (!fact || fact.sourceCommandId !== run.commandId || !fact.turnId) {
          return {
            kind: "unknown",
            reason:
              "The warm original runtime does not contain exact owned-input evidence in its visible snapshot. Pending admission or idle alone cannot prove inactivity.",
          };
        }
        if (fact.state === "running") {
          return fact.foregroundExecutionId
            ? { kind: "active", fact }
            : {
                kind: "unknown",
                reason:
                  "The owned input has no authoritative current foreground execution for targeted cancellation.",
              };
        }
        return {
          kind: "inactive",
          proof: {
            kind: "input-terminal",
            runtimeIdentity: run.runtimeIdentity,
            sessionId: run.sessionId,
            inputId: run.inputId,
            commandId: run.commandId,
            terminalProof: {
              sourceCommandId: fact.sourceCommandId,
              state: fact.state,
              turnId: fact.turnId,
              logEpoch: fact.logEpoch,
              seq: fact.seq,
            },
          },
          fact,
        };
      } catch (error) {
        return {
          kind: "unknown",
          reason: error instanceof Error ? error.message : "Native recovery inspection failed.",
        };
      } finally {
        inspection?.dispose();
      }
    },
  };
  return port;
}
