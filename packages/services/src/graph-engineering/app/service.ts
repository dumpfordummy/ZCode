import { Emitter, type IDisposable } from "@zcode/rpc";
import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import type { GraphRun, GraphWorkspaceTarget, IGraphEngineeringService } from "../contract.js";
import {
  defaultDefinition,
  isConfirmedTerminal,
  localTarget,
  validateDefinition,
  workspaceKey,
} from "../domain/definition.js";
import type { GraphNativeFact, GraphNativePort, GraphRecord, GraphRepository } from "./ports.js";

interface Options {
  repository: GraphRepository;
  native: GraphNativePort;
  id(): string;
  now(): number;
}
export interface GraphInputGuardRequest extends GraphWorkspaceTarget {
  sessionId: string;
  commandId?: string;
  commandType: string;
}
class MetadataOwnedElsewhere extends Error {
  constructor() {
    super(
      "This graph is owned by another ZCode window. Close that window before editing or running here.",
    );
  }
}

export class GraphEngineeringService implements IGraphEngineeringService {
  private readonly changed = new Emitter<{ workspaceKey: string }>();
  readonly onDidChange = this.changed.event;
  private readonly records = new Map<string, GraphRecord>();
  private readonly flights = new Map<string, Promise<unknown>>();
  private readonly observers = new Map<string, IDisposable>();
  private readonly cursors = new Map<string, { logEpoch: string; seq: number }>();
  private disposed = false;
  private shutdown?: Promise<void>;
  constructor(private readonly options: Options) {}

  private serial<T>(target: GraphWorkspaceTarget, action: () => Promise<T>): Promise<T> {
    const key = workspaceKey(target);
    const next = (this.flights.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(() => {
        if (this.disposed) throw new Error("Graph Engineering is closed.");
        return action();
      });
    this.flights.set(key, next);
    void next
      .finally(() => {
        if (this.flights.get(key) === next) this.flights.delete(key);
      })
      .catch(() => {});
    return next;
  }

  private async load(target: GraphWorkspaceTarget): Promise<GraphRecord> {
    const key = workspaceKey(target);
    const existing = this.records.get(key);
    if (existing) return existing;
    if (this.disposed) throw new Error("Graph Engineering is closed.");
    if (
      this.options.repository.acquireOwnership &&
      !(await this.options.repository.acquireOwnership(target))
    )
      throw new MetadataOwnedElsewhere();
    const record = (await this.options.repository.read(target)) ?? {
      definition: defaultDefinition(),
      runs: [],
    };
    this.records.set(key, record);
    for (const run of record.runs) {
      if (isConfirmedTerminal(run)) continue;
      // 冷历史会合成成功终态；缺少同代运行证据时只保留中断，绝不重发。
      const sameRuntime =
        run.sessionId &&
        run.runtimeIdentity &&
        (await this.options.native.reconcile(run).catch(() => "interrupted")) === "same-runtime";
      if (sameRuntime)
        await this.observe(run).catch(() =>
          this.interrupt(run, "Native observation could not be restored."),
        );
      else
        this.interrupt(
          run,
          "The original native runtime is unavailable. Review the same conversation; Z1 will not resend this input.",
        );
    }
    if (record.runs.some((run) => !isConfirmedTerminal(run))) await this.persist(target, record);
    return record;
  }

  private async persist(target: GraphWorkspaceTarget, record: GraphRecord): Promise<void> {
    if (this.disposed) throw new Error("Graph Engineering is closed.");
    await this.options.repository.write(target, record);
    this.changed.fire({ workspaceKey: workspaceKey(target) });
  }

  async getWorkspace(targetValue: GraphWorkspaceTarget) {
    const target = localTarget(targetValue);
    return this.serial(target, async () => {
      try {
        return {
          ...structuredClone(await this.load(target)),
          availability: await this.options.native.available(),
        };
      } catch (error) {
        if (!(error instanceof MetadataOwnedElsewhere)) throw error;
        return {
          ...((await this.options.repository.read(target)) ?? {
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
    return this.serial(target, async () => {
      const record = await this.load(target);
      if (record.definition.revision !== params.expectedRevision)
        throw new Error("Graph revision changed; reload before saving.");
      const savedDefinition = { ...definition, revision: record.definition.revision + 1 };
      await this.persist(target, { ...record, definition: savedDefinition });
      record.definition = savedDefinition;
      return structuredClone(record.definition);
    });
  }

  async run(params: Parameters<IGraphEngineeringService["run"]>[0]): Promise<GraphRun> {
    const target = localTarget(params.target);
    if (!params.requestId?.trim()) throw new Error("A stable request ID is required.");
    return this.serial(target, async () => {
      const record = await this.load(target);
      const duplicate = record.runs.find((run) => run.requestId === params.requestId);
      if (duplicate) return structuredClone(duplicate);
      if (record.runs.some((run) => !isConfirmedTerminal(run)))
        throw new Error(
          "This workspace has an unresolved Graph Engineering attempt. Open its conversation before starting additional work.",
        );
      if (record.definition.revision !== params.revision)
        throw new Error("Graph revision changed; save and reload before running.");
      const definition = validateDefinition(record.definition);
      if (!definition.instructions.trim()) throw new Error("Agent Task instructions are required.");
      const availability = await this.options.native.available();
      if (!availability.available)
        throw new Error(availability.reason ?? "Native agent unavailable.");
      const modelSelection = modelSelectionSchema.parse(params.modelSelection);
      const mode = submissionModeSchema.parse(params.mode);
      if (params.planEnabled !== undefined && typeof params.planEnabled !== "boolean")
        throw new Error("Plan mode must be a boolean.");
      await this.options.native.validateSelection({ modelSelection, mode });
      const commandId = this.options.id();
      const run: GraphRun = {
        id: this.options.id(),
        attemptId: this.options.id(),
        requestId: params.requestId,
        target: structuredClone(target),
        definition: structuredClone(definition),
        modelSelection,
        mode,
        planEnabled: params.planEnabled ?? false,
        commandId,
        inputId: commandId,
        status: "Starting",
        createdAt: this.options.now(),
        updatedAt: this.options.now(),
      };
      // 首次落盘失败时还未调用 native，不能留下内存中的 Starting 占位阻止安全重试。
      await this.persist(target, { ...record, runs: [...record.runs, run] });
      record.runs.push(run);
      try {
        const created = await this.options.native.create(run);
        if (!created.sessionId.trim() || !created.runtimeIdentity.trim())
          throw new Error(
            "Native session creation did not return its session and runtime identity.",
          );
        Object.assign(run, created);
        await this.persist(target, record);
        await this.observe(run);
        const receipt = await this.options.native.send(run);
        // ACK 只证明准入；拒绝或失联也不能证明执行没有发生，不允许换 ID 重试。
        run.status = receipt.accepted ? "Running" : "Unknown";
        if (!receipt.accepted)
          run.message =
            receipt.reason ?? "Native admission was not confirmed. No automatic retry will occur.";
      } catch (error) {
        run.status = "Unknown";
        run.message = error instanceof Error ? error.message : "Native dispatch result is unknown.";
      }
      run.updatedAt = this.options.now();
      await this.persist(target, record);
      return structuredClone(run);
    });
  }

  private async observe(run: GraphRun): Promise<void> {
    this.observers.get(run.id)?.dispose();
    const observer = await this.options.native.observe(
      run,
      (fact) => {
        void this.serial(run.target, async () => this.acceptFact(run, fact)).catch(() =>
          this.interrupt(
            run,
            "Graph metadata could not be persisted; review the native conversation.",
          ),
        );
      },
      (reason) => {
        void this.serial(run.target, async () => {
          if (!isConfirmedTerminal(run)) {
            this.interrupt(run, reason);
            await this.persist(run.target, await this.load(run.target));
          }
        }).catch(() => {});
      },
    );
    if (this.disposed || isConfirmedTerminal(run)) observer.dispose();
    else this.observers.set(run.id, observer);
  }

  private async acceptFact(run: GraphRun, fact: GraphNativeFact): Promise<void> {
    if (this.disposed || isConfirmedTerminal(run) || fact.sourceCommandId !== run.commandId) return;
    const cursor = this.cursors.get(run.id);
    if (cursor && (cursor.logEpoch !== fact.logEpoch || fact.seq <= cursor.seq)) return;
    const next = structuredClone(run);
    if (fact.foregroundExecutionId) next.foregroundExecutionId = fact.foregroundExecutionId;
    if (fact.state !== "running") {
      next.status =
        fact.state === "completedSuccess"
          ? "Completed"
          : fact.state === "completedInterrupted"
            ? "Cancelled"
            : "Failed";
      next.terminalProof = {
        sourceCommandId: fact.sourceCommandId,
        state: fact.state,
        logEpoch: fact.logEpoch,
        seq: fact.seq,
      };
      next.message =
        next.status === "Completed"
          ? "The native input completed. Inspect the conversation, files and tests to verify the task outcome."
          : undefined;
    } else if (run.status !== "CancelRequested") {
      next.status =
        fact.waiting === "permission"
          ? "WaitingForPermission"
          : fact.waiting === "userInput"
            ? "WaitingForUser"
            : "Running";
      next.message = undefined;
    }
    next.updatedAt = this.options.now();
    const record = await this.load(run.target);
    // 终态只有成功持久化后才释放所有权；磁盘失败不能把未保存的成功暴露给下一次输入。
    await this.persist(run.target, {
      ...record,
      runs: record.runs.map((item) => (item === run ? next : item)),
    });
    Object.assign(run, next);
    this.cursors.set(run.id, { logEpoch: fact.logEpoch, seq: fact.seq });
    if (isConfirmedTerminal(run)) {
      this.observers.get(run.id)?.dispose();
      this.observers.delete(run.id);
    }
  }

  private interrupt(run: GraphRun, reason: string): void {
    run.status = "Interrupted";
    run.message = reason;
    run.updatedAt = this.options.now();
    this.observers.get(run.id)?.dispose();
    this.observers.delete(run.id);
  }

  async cancel(params: { target: GraphWorkspaceTarget; runId: string }): Promise<GraphRun> {
    const target = localTarget(params.target);
    return this.serial(target, async () => {
      const record = await this.load(target);
      const run = record.runs.find((item) => item.id === params.runId);
      if (!run) throw new Error("Graph attempt not found.");
      if (isConfirmedTerminal(run)) return structuredClone(run);
      if (!run.foregroundExecutionId)
        throw new Error(
          "No exact active native execution is confirmed; open the conversation to inspect its state.",
        );
      if ((await this.options.native.reconcile(run)) !== "same-runtime")
        throw new Error("The original native execution is unavailable; cancellation was not sent.");
      run.status = "CancelRequested";
      run.updatedAt = this.options.now();
      await this.persist(target, record);
      await this.options.native.cancel(run);
      return structuredClone(run);
    });
  }

  async isSessionOwned(params: GraphWorkspaceTarget & { sessionId: string }): Promise<boolean> {
    // Guard 内部不能等待同 workspace 的 run flight，否则 sendText 会与自己的准入死锁。
    const record =
      this.records.get(workspaceKey(params)) ?? (await this.options.repository.read(params));
    return (
      record?.runs.some((run) => run.sessionId === params.sessionId && !isConfirmedTerminal(run)) ??
      false
    );
  }

  async protectedSessionIds(target: GraphWorkspaceTarget): Promise<string[]> {
    const record =
      this.records.get(workspaceKey(target)) ?? (await this.options.repository.read(target));
    return (
      record?.runs.flatMap((run) =>
        run.sessionId && !isConfirmedTerminal(run) ? [run.sessionId] : [],
      ) ?? []
    );
  }

  async assertInputAllowed(params: GraphInputGuardRequest): Promise<void> {
    const record =
      this.records.get(workspaceKey(params)) ?? (await this.options.repository.read(params));
    const owner = record?.runs.find(
      (run) => run.sessionId === params.sessionId && !isConfirmedTerminal(run),
    );
    if (owner && !(params.commandType === "sendText" && params.commandId === owner.commandId))
      throw new Error(
        "Graph Engineering owns this input. Additional prompts and model/mode changes are blocked until its native attempt completes; permission and question responses remain available.",
      );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const observer of this.observers.values()) observer.dispose();
    this.observers.clear();
    this.changed.dispose();
    this.shutdown = Promise.allSettled(this.flights.values()).then(async () => {
      await this.options.repository.dispose?.();
    });
    void this.shutdown.catch(() => {});
  }

  async disposeAndWait(): Promise<void> {
    this.dispose();
    await this.shutdown;
  }
}
