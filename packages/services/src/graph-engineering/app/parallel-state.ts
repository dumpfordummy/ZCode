import type { GraphRun, GraphWorkspaceTarget, IGraphEngineeringService } from "../contract.js";
import type { GraphParallelRun, GraphParallelChild } from "../parallel-contract.js";
import { parallelChildren } from "../domain/parallel.js";
import { isConfirmedTerminal, workspaceKey } from "../domain/definition.js";
import { runFingerprint } from "./attempts.js";
import { GraphState } from "./state.js";

export class ParallelState {
  readonly live = new Set<string>();
  readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    readonly state: GraphState,
    readonly graph: IGraphEngineeringService,
  ) {}
  get port() {
    if (!this.state.options.parallel) throw new Error("Fork/Join is unavailable in this Host.");
    return this.state.options.parallel;
  }
  digest(value: unknown) {
    if (!this.state.options.evidence) throw new Error("Native evidence is unavailable.");
    return this.state.options.evidence.digest(runFingerprint(value));
  }
  async get(target: GraphWorkspaceTarget, id: string) {
    const run = (await this.state.load(target)).parallel?.runs.find((r) => r.id === id);
    if (!run) throw new Error("Parallel run not found.");
    return structuredClone(run);
  }
  async put(run: GraphParallelRun) {
    const record = await this.state.load(run.target);
    if (!record.parallel) throw new Error("Parallel owner is unavailable.");
    run.updatedAt = this.state.options.now();
    await this.state.commit(run.target, {
      ...record,
      parallel: {
        ...record.parallel,
        runs: record.parallel.runs.map((r) => (r.id === run.id ? run : r)),
      },
    });
  }
  async child(
    run: GraphParallelRun,
    child: GraphParallelChild,
    history = false,
  ): Promise<GraphRun | undefined> {
    if (!child.workspace || (child.workspace.cleaned && !history)) return undefined;
    const target = { workspacePath: child.workspace.workspacePath };
    // 历史只读自有元数据；工作目录被改动时仍可查看，但不得因此初始化该目录的原生运行时。
    if (history) {
      const record =
        this.state.records.get(workspaceKey(target)) ??
        (await this.state.options.repository.read(target));
      return record?.runs.find((r) => r.requestId === child.requestId);
    }
    await this.port.validate(child.workspace);
    const view = await this.graph.getWorkspace(target);
    const found = view.runs.find((r) => r.requestId === child.requestId);
    if (found && child.runId && found.id !== child.runId)
      throw new Error("Child run identity mismatch.");
    if (found) child.runId = found.id;
    return found;
  }
  async children(run: GraphParallelRun, history = false) {
    const results = new Map<string, GraphRun>();
    for (const child of parallelChildren(run)) {
      const found = await this.child(run, child, history);
      if (found) results.set(child.id, found);
    }
    return results;
  }
  async verify(run: GraphParallelRun) {
    await this.port.verifyBase(run.preview);
    for (const child of [...run.children.filter((c) => c.selected), run.integration]) {
      if (!child.workspace || !child.inventory)
        throw new Error("Prepared child configuration is missing.");
      if (
        (await this.port.inventory(child.workspace, run.settings)).digest !== child.inventory.digest
      )
        throw new Error(`Native configuration changed for ${child.id}; new reviewed run required.`);
    }
    const record = await this.state.load(run.target);
    if (!record.parallel?.plan?.enabled)
      throw new Error("Fork/Join was disabled; no further admission.");
    if (run.deadlineAt !== undefined && this.state.options.now() >= run.deadlineAt)
      throw new Error("Run-wide deadline exceeded.");
  }
  clear(runId: string) {
    this.live.delete(runId);
    const timer = this.timers.get(runId);
    if (timer) clearTimeout(timer);
    this.timers.delete(runId);
  }
  async stop(run: GraphParallelRun, message: string) {
    this.clear(run.id);
    run.phase = "Stopped";
    run.message = message.slice(0, 3000);
    await this.put(run);
    for (const child of parallelChildren(run)) {
      // 一个目录失效不能阻止其他已知子任务的精确取消；失败的分支继续保留为未知。
      try {
        const existing = await this.child(run, child);
        if (existing && !isConfirmedTerminal(existing))
          await this.graph.cancel({ target: existing.target, runId: existing.id });
      } catch {
        /* 原生取消拒绝不是静止证明。 */
      }
    }
    await this.put(run);
  }
  async inactive(run: GraphParallelRun): Promise<GraphRun[]> {
    const results: GraphRun[] = [];
    for (const child of parallelChildren(run)) {
      let existing = await this.child(run, child);
      if (!existing) continue;
      existing = await this.graph.inspectRecovery({ target: existing.target, runId: existing.id });
      if (!isConfirmedTerminal(existing) && existing.recovery?.state !== "inactive")
        throw new Error(
          `Child ${child.id} is active or unknown; integration/cleanup/release is unavailable.`,
        );
      results.push(existing);
    }
    return results;
  }
  async bind(run: GraphParallelRun, child: GraphParallelChild) {
    const target = { workspacePath: child.workspace!.workspacePath };
    await this.state.serial(target, async () => {
      const record = await this.state.load(target);
      const parent = { target: run.target, runId: run.id, slot: child.id };
      if (record.parallelParent && record.parallelParent.runId !== run.id)
        throw new Error("Foreign child workspace owner.");
      await this.state.commit(target, { ...record, parallelParent: parent });
    });
  }
  dispose() {
    for (const id of this.live) this.clear(id);
  }
}
