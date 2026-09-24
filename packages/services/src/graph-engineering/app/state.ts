import { Emitter, type IDisposable } from "@zcode/rpc";
import type { GraphRun, GraphWorkspaceTarget } from "../contract.js";
import { defaultDefinition, isConfirmedTerminal, workspaceKey } from "../domain/definition.js";
import type {
  GraphNativePort,
  GraphRecord,
  GraphRepository,
  GraphEvidencePort,
  GraphArtifactOptions,
} from "./ports.js";
import { resumableGate } from "../domain/approvals.js";
import { routeCheckpoint } from "../domain/routing.js";
import type { GraphPreflightPort } from "./workflow-ports.js";

export interface GraphOptions extends GraphArtifactOptions {
  parallel?: import("./parallel-ports.js").GraphParallelPort;
  repository: GraphRepository;
  native: GraphNativePort;
  evidence?: GraphEvidencePort;
  preflight?: GraphPreflightPort;
  id(): string;
  now(): number;
}
export class MetadataOwnedElsewhere extends Error {
  constructor() {
    super(
      "This graph is owned by another ZCode window. Close that window before editing or running here.",
    );
  }
}
/** Sole mutable graph owner; helper operations use its serialized transactions. */
export class GraphState {
  readonly changed = new Emitter<{ workspaceKey: string }>();
  readonly records = new Map<string, GraphRecord>();
  readonly observers = new Map<string, IDisposable>();
  readonly cursors = new Map<string, { logEpoch: string; seq: number }>();
  readonly liveRuns = new Set<string>();
  /** One-use live send authorization; persisted phases never recreate this permission. */
  readonly dispatching = new Set<string>();
  private readonly flights = new Map<string, Promise<unknown>>();
  disposed = false;
  private shutdown?: Promise<void>;
  constructor(readonly options: GraphOptions) {}

  serial<T>(target: GraphWorkspaceTarget, action: () => Promise<T>): Promise<T> {
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
  async load(target: GraphWorkspaceTarget): Promise<GraphRecord> {
    const key = workspaceKey(target);
    const existing = this.records.get(key);
    if (existing) return existing;
    if (
      this.options.repository.acquireOwnership &&
      !(await this.options.repository.acquireOwnership(target))
    )
      throw new MetadataOwnedElsewhere();
    const record = (await this.options.repository.read(target)) ?? {
      definition: defaultDefinition(),
      runs: [],
    };
    let interrupted = false;
    for (const run of record.parallel?.runs ?? []) {
      if (["Completed", "Stopped", "Interrupted"].includes(run.phase) || run.released) continue;
      run.phase = "Interrupted";
      run.message =
        "Host restarted. Inspect owned work; branches, integration and cleanup will not resume automatically.";
      run.updatedAt = this.options.now();
      interrupted = true;
    }
    for (const run of record.runs) {
      if (isConfirmedTerminal(run)) continue;
      const checkpoint = run.version === 5 ? routeCheckpoint(run) : undefined;
      if (checkpoint) {
        checkpoint.resumeRequired = true;
        run.status = "AwaitingContinuation";
        run.message =
          "The Host restarted at a persisted route checkpoint. Inspect and explicitly Continue; no work resumed.";
        run.updatedAt = Math.max(run.createdAt, this.options.now());
        interrupted = true;
        continue;
      }
      const gate = run.version !== undefined && run.version >= 3 ? resumableGate(run) : undefined;
      if (gate) {
        gate.resumeRequired = true;
        run.status = "AwaitingContinuation";
        run.message =
          "The owning app restarted. Continue explicitly to verify this gate; no native work has resumed.";
        run.updatedAt = Math.max(run.createdAt, this.options.now());
        interrupted = true;
        continue;
      }
      if (run.status === "StaleEvidence") continue;
      // 冷恢复绝不推进后继，即使旧 turn header 看起来成功；先保留证据再显式核验。
      run.status = "Interrupted";
      run.updatedAt = Math.max(run.createdAt, this.options.now());
      run.message =
        "The owning Host was interrupted. Inspect the original input; pending tasks will not be submitted automatically.";
      interrupted = true;
    }
    if (interrupted) await this.commit(target, record);
    else this.records.set(key, record);
    return record;
  }
  async commit(target: GraphWorkspaceTarget, record: GraphRecord): Promise<void> {
    if (this.disposed) throw new Error("Graph Engineering is closed.");
    await this.options.repository.write(target, record);
    // 持久化后的缓存必须脱离调用方工作副本；否则后续失败写入会把未落盘的阶段泄漏为已提交事实。
    this.records.set(workspaceKey(target), structuredClone(record));
    this.changed.fire({ workspaceKey: workspaceKey(target) });
  }
  async put(run: GraphRun): Promise<void> {
    const record = await this.load(run.target);
    await this.commit(run.target, {
      ...record,
      runs: record.runs.map((r) => (r.id === run.id ? run : r)),
    });
  }
  async get(target: GraphWorkspaceTarget, id: string): Promise<GraphRun> {
    const run = (await this.load(target)).runs.find((r) => r.id === id);
    if (!run) throw new Error("Graph attempt not found.");
    return run;
  }
  stopObserving(run: GraphRun): void {
    this.observers.get(`deadline:${run.id}`)?.dispose();
    this.observers.delete(`deadline:${run.id}`);
    const ids =
      run.version !== undefined
        ? [...run.nodeAttempts, ...(run.toolAttempts ?? [])].map((a) => a.attemptId)
        : [run.attemptId];
    for (const id of ids) {
      this.observers.get(id)?.dispose();
      this.observers.delete(id);
    }
  }
  interrupt(target: GraphWorkspaceTarget, runId: string, reason: string): void {
    const run = this.records.get(workspaceKey(target))?.runs.find((r) => r.id === runId);
    if (!run || isConfirmedTerminal(run)) return;
    this.liveRuns.delete(runId);
    this.stopObserving(run);
    run.status = "Interrupted";
    const checkpoint = run.version === 5 ? routeCheckpoint(run) : undefined;
    if (checkpoint) {
      checkpoint.resumeRequired = true;
      run.status = "AwaitingContinuation";
    }
    const gate = run.version !== undefined && run.version >= 3 ? resumableGate(run) : undefined;
    if (gate) {
      gate.resumeRequired = true;
      run.status = "AwaitingContinuation";
    }
    run.message = reason;
    run.updatedAt = Math.max(run.createdAt, this.options.now());
    this.changed.fire({ workspaceKey: workspaceKey(target) });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.liveRuns.clear();
    this.dispatching.clear();
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
