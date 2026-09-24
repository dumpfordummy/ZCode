import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import type {
  GraphLegacyRun,
  GraphNativeSettings,
  GraphNodeAttempt,
  GraphRun,
  GraphSequentialRun,
  GraphTaskNode,
  GraphWorkspaceTarget,
  IGraphEngineeringService,
} from "../contract.js";
import {
  defaultDefinition,
  isConfirmedTerminal,
  localTarget,
  validateDefinition,
  validateReadiness,
  workspaceKey,
} from "../domain/definition.js";
import { runFingerprint } from "./attempts.js";
import { GraphRecovery } from "./recovery.js";
import { GraphSequencer } from "./sequencer.js";
import { GraphState, MetadataOwnedElsewhere, type GraphOptions } from "./state.js";

export interface GraphInputGuardRequest extends GraphWorkspaceTarget {
  sessionId: string;
  commandId?: string;
  commandType: string;
}
export class GraphEngineeringService implements IGraphEngineeringService {
  private readonly state: GraphState;
  private readonly sequencer: GraphSequencer;
  private readonly recovery: GraphRecovery;
  readonly onDidChange;
  constructor(options: GraphOptions) {
    this.state = new GraphState(options);
    this.sequencer = new GraphSequencer(this.state);
    this.recovery = new GraphRecovery(this.state, this.sequencer);
    this.onDidChange = this.state.changed.event;
  }
  async validateDefinition(params: Parameters<IGraphEngineeringService["validateDefinition"]>[0]) {
    return validateReadiness(params.definition);
  }
  async getWorkspace(value: GraphWorkspaceTarget) {
    const target = localTarget(value);
    return this.state.serial(target, async () => {
      try {
        return {
          ...structuredClone(await this.state.load(target)),
          availability: await this.state.options.native.available(),
        };
      } catch (error) {
        if (!(error instanceof MetadataOwnedElsewhere)) throw error;
        return {
          ...((await this.state.options.repository.read(target)) ?? {
            definition: defaultDefinition(),
            runs: [],
          }),
          availability: { available: false, reason: error.message },
          readOnly: true,
        };
      }
    });
  }
  async saveDefinition(params: Parameters<IGraphEngineeringService["saveDefinition"]>[0]) {
    const target = localTarget(params.target);
    const definition = validateDefinition(params.definition);
    return this.state.serial(target, async () => {
      const record = await this.state.load(target);
      if (record.definition.revision !== params.expectedRevision)
        throw new Error("Graph revision changed; reload before saving.");
      if (record.definition.version === 2 && definition.version !== 2)
        throw new Error("A sequential graph cannot be silently downgraded to Z1.");
      const saved = { ...definition, revision: record.definition.revision + 1 };
      await this.state.commit(target, { ...record, definition: saved });
      return structuredClone(saved);
    });
  }
  async run(params: Parameters<IGraphEngineeringService["run"]>[0]): Promise<GraphRun> {
    const target = localTarget(params.target);
    if (!params.requestId?.trim() || params.requestId.length > 200)
      throw new Error("A stable request ID is required (at most 200 characters).");
    return this.state.serial(target, async () => {
      const record = await this.state.load(target);
      const defaults: GraphNativeSettings = {
        modelSelection: modelSelectionSchema.parse(params.modelSelection),
        mode: submissionModeSchema.parse(params.mode),
        planEnabled: params.planEnabled ?? false,
      };
      if (typeof defaults.planEnabled !== "boolean")
        throw new Error("Plan mode must be a boolean.");
      const fingerprint = runFingerprint({ target, revision: params.revision, ...defaults });
      const duplicate = record.runs.find((run) => run.requestId === params.requestId);
      if (duplicate) {
        const old =
          duplicate.version === 2
            ? duplicate.requestFingerprint
            : runFingerprint({
                target: duplicate.target,
                revision: duplicate.definition.revision,
                modelSelection: duplicate.modelSelection,
                mode: duplicate.mode,
                planEnabled: duplicate.planEnabled ?? false,
              });
        if (old !== fingerprint)
          throw new Error(
            "The same Run request ID was reused with different configuration or revision.",
          );
        return structuredClone(duplicate);
      }
      if (record.runs.some((run) => !isConfirmedTerminal(run)))
        throw new Error(
          "This workspace has an unresolved Graph Engineering attempt. Inspect or safely release it before starting additional work.",
        );
      if (record.definition.revision !== params.revision)
        throw new Error("Graph revision changed; save and reload before running.");
      const definition = validateDefinition(record.definition);
      const ready = validateReadiness(definition);
      if (ready.errors.length) throw new Error(ready.errors.join("\n"));
      const availability = await this.state.options.native.available();
      if (!availability.available)
        throw new Error(availability.reason ?? "Native agent unavailable.");
      let run: GraphRun;
      const now = this.state.options.now();
      if (definition.version === 2) {
        const nodeAttempts: GraphNodeAttempt[] = [];
        for (const nodeId of ready.path) {
          const node = definition.nodes.find((n) => n.id === nodeId) as GraphTaskNode;
          const settings =
            node.configuration.kind === "inherit"
              ? { ...structuredClone(defaults), source: "workspace" as const }
              : {
                  modelSelection: structuredClone(node.configuration.modelSelection),
                  mode: node.configuration.mode,
                  planEnabled: node.configuration.planEnabled,
                  source: "node" as const,
                };
          await this.state.options.native.validateSelection(settings);
          const commandId = this.state.options.id();
          nodeAttempts.push({
            nodeId,
            attemptId: this.state.options.id(),
            commandId,
            inputId: commandId,
            status: "Pending",
            dispatchPhase: "planned",
            settings,
            createdAt: now,
            updatedAt: now,
          });
        }
        const start = definition.nodes.find((n) => n.type === "start")!;
        run = {
          version: 2,
          id: this.state.options.id(),
          requestId: params.requestId,
          requestFingerprint: fingerprint,
          target: structuredClone(target),
          definition: structuredClone(definition),
          defaults,
          plannedPath: ready.path,
          startInput: start.type === "start" ? start.request : "",
          nodeAttempts,
          status: "Starting",
          createdAt: now,
          updatedAt: now,
        } satisfies GraphSequentialRun;
      } else {
        await this.state.options.native.validateSelection(defaults);
        const commandId = this.state.options.id();
        run = {
          id: this.state.options.id(),
          attemptId: this.state.options.id(),
          requestId: params.requestId,
          target: structuredClone(target),
          definition: structuredClone(definition),
          ...defaults,
          commandId,
          inputId: commandId,
          status: "Starting",
          createdAt: now,
          updatedAt: now,
        } satisfies GraphLegacyRun;
      }
      // 首次持久化成功才发布占位；失败时零 native 调用，同 request 可安全重试。
      await this.state.commit(target, { ...record, runs: [...record.runs, run] });
      this.state.liveRuns.add(run.id);
      try {
        await this.sequencer.dispatch(target, run.id);
      } catch (error) {
        // ACK 后落盘失败也必须立即关闭推进许可，否则已排队终态会错误启动后继。
        this.state.interrupt(
          target,
          run.id,
          "Graph dispatch metadata could not be persisted. Inspect the owned input; no successor will be submitted.",
        );
        throw error;
      }
      return structuredClone(await this.state.get(target, run.id));
    });
  }
  async cancel(params: Parameters<IGraphEngineeringService["cancel"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () => this.recovery.cancel(target, params.runId));
  }
  async inspectRecovery(params: Parameters<IGraphEngineeringService["inspectRecovery"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () => this.recovery.inspectRecovery(target, params.runId));
  }
  async releaseInterrupted(params: Parameters<IGraphEngineeringService["releaseInterrupted"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () =>
      this.recovery.release(target, params.runId, params.reason, params.confirmed),
    );
  }
  private async guardedRuns(target: GraphWorkspaceTarget): Promise<GraphRun[]> {
    // Guard 不能等待同 workspace 的 run flight，否则 sendText 会与自己的准入死锁。
    const record =
      this.state.records.get(workspaceKey(target)) ??
      (await this.state.options.repository.read(target));
    return record?.runs.filter((run) => !isConfirmedTerminal(run)) ?? [];
  }
  async isSessionOwned(params: GraphWorkspaceTarget & { sessionId: string }): Promise<boolean> {
    return (await this.protectedSessionIds(params)).includes(params.sessionId);
  }
  async protectedSessionIds(target: GraphWorkspaceTarget): Promise<string[]> {
    return (await this.guardedRuns(target)).flatMap((run) =>
      run.version === 2
        ? run.nodeAttempts.flatMap((n) => (n.sessionId ? [n.sessionId] : []))
        : run.sessionId
          ? [run.sessionId]
          : [],
    );
  }
  async assertInputAllowed(params: GraphInputGuardRequest): Promise<void> {
    for (const run of await this.guardedRuns(params)) {
      const node =
        run.version === 2
          ? run.nodeAttempts.find((n) => n.sessionId === params.sessionId)
          : run.sessionId === params.sessionId
            ? run
            : undefined;
      if (!node) continue;
      const sending =
        run.version === 2
          ? "dispatchPhase" in node &&
            node.dispatchPhase === "sending" &&
            !node.terminalProof &&
            run.cancelRequestedAt === undefined
          : run.status === "Starting";
      if (!(sending && params.commandType === "sendText" && params.commandId === node.commandId))
        throw new Error(
          "Graph Engineering owns this run. Additional prompts and model/mode changes are blocked until completion or confirmed-inactive release; native permission and question responses remain available.",
        );
    }
  }
  dispose(): void {
    this.state.dispose();
  }
  async disposeAndWait(): Promise<void> {
    await this.state.disposeAndWait();
  }
}
