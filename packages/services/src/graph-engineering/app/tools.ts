import type {
  GraphSequentialRun,
  GraphToolAttempt,
  GraphToolOperation,
  GraphWorkspaceTarget,
} from "../contract.js";
import { runFingerprint, skipPending } from "./attempts.js";
import { GraphState } from "./state.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphToolEvidence } from "./tool-evidence.js";
import { GraphRouting } from "./routing.js";
import { currentToolAttempt } from "../domain/routing.js";

const terminal = (operation: GraphToolOperation) =>
  ["completed", "failed", "cancelled"].includes(operation.status) &&
  operation.completedAt !== undefined;
/** Native owns the process. This class only observes exact operation facts on the existing owner. */
export class GraphTools {
  private readonly evidence: GraphToolEvidence;
  constructor(
    private readonly state: GraphState,
    artifacts: GraphArtifacts,
    private readonly dispatch: (target: GraphWorkspaceTarget, runId: string) => Promise<void>,
    private readonly beforeStart: (run: GraphSequentialRun, nodeId: string) => Promise<void>,
    private readonly routing: GraphRouting,
  ) {
    this.evidence = new GraphToolEvidence(state, artifacts);
  }
  async start(run: GraphSequentialRun, nodeId: string): Promise<void> {
    const attempt = currentToolAttempt(run, nodeId);
    const port = this.state.options.tools;
    if (
      !attempt ||
      attempt.status !== "Pending" ||
      !port ||
      !this.state.options.recipes ||
      !this.state.options.artifacts
    )
      throw new Error("Native Tool services are unavailable.");
    try {
      if (
        this.state.options.evidence!.digest(runFingerprint(attempt.recipe)) !== attempt.recipeDigest
      )
        throw new Error("Frozen recipe digest changed.");
      await this.evidence.prepare(run, attempt);
    } catch (error) {
      attempt.status = "Failed";
      attempt.message = error instanceof Error ? error.message : "Tool preflight failed.";
      run.status = "Failed";
      run.message = attempt.message;
      skipPending(run, this.state.options.now());
      await this.state.put(run);
      this.state.liveRuns.delete(run.id);
      return;
    }
    if (!(await this.routing.verify(run, true))) return;
    attempt.status = "Starting";
    attempt.dispatchPhase = "creating";
    run.status = "Starting";
    attempt.updatedAt = run.updatedAt = this.state.options.now();
    await this.state.put(run);
    try {
      Object.assign(attempt, await port.create(run.target));
      if (!attempt.sessionId || !attempt.runtimeIdentity)
        throw new Error("Native Tool creation returned no exact session/runtime.");
      attempt.dispatchPhase = "created";
      await this.state.put(run);
      // 会话创建是异步边界，人工批准必须在真实命令启动前再次核验，不能沿用创建前的旧快照。
      await this.beforeStart(run, nodeId);
      attempt.dispatchPhase = "sending";
      await this.state.put(run);
      if (!(await this.routing.checks.beforeEffect(run))) return;
      this.state.dispatching.add(attempt.operationId);
      let operation: GraphToolOperation;
      try {
        operation = await port.start(run.target, attempt);
      } finally {
        this.state.dispatching.delete(attempt.operationId);
      }
      attempt.dispatchPhase = "accepted";
      await this.accept(run, attempt, operation);
      if (!terminal(operation) && operation.status !== "unknown") this.observe(run, attempt);
    } catch (error) {
      // 原始创建/启动回执丢失时保留同一意图与身份；绝不另建进程猜测执行结果。
      const current = structuredClone(
        await this.state.get(run.target, run.id),
      ) as GraphSequentialRun;
      if (current.status === "StaleEvidence" || current.routing?.stopReason) return;
      const owned = current.toolAttempts!.find((a) => a.attemptId === attempt.attemptId)!;
      owned.status = current.status = "Unknown";
      current.message = owned.message =
        error instanceof Error ? error.message : "Native Tool outcome is unknown.";
      current.updatedAt = owned.updatedAt = this.state.options.now();
      this.state.liveRuns.delete(run.id);
      await this.state.put(current);
    }
  }
  private observe(run: GraphSequentialRun, attempt: GraphToolAttempt): void {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispose = () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
    this.state.observers.set(attempt.attemptId, { dispose });
    const poll = async () => {
      try {
        const operation = await this.state.options.tools!.inspect(run.target, attempt);
        if (disposed || this.state.disposed) return;
        await this.state.serial(run.target, async () => {
          const current = structuredClone(
            await this.state.get(run.target, run.id),
          ) as GraphSequentialRun;
          const owned = current.toolAttempts!.find((a) => a.attemptId === attempt.attemptId)!;
          if (owned.operation && terminal(owned.operation)) return;
          if (runFingerprint(owned.operation) !== runFingerprint(operation))
            await this.accept(current, owned, operation);
        });
        if (terminal(operation) || operation.status === "unknown") {
          dispose();
          this.state.observers.delete(attempt.attemptId);
          return;
        }
      } catch (error) {
        dispose();
        this.state.interrupt(
          run.target,
          run.id,
          error instanceof Error ? error.message : "Native Tool observation was lost.",
        );
        return;
      }
      if (!disposed) timer = setTimeout(() => void poll(), 200);
    };
    timer = setTimeout(() => void poll(), 0);
  }
  private async accept(
    run: GraphSequentialRun,
    attempt: GraphToolAttempt,
    operation: GraphToolOperation,
  ): Promise<void> {
    if (
      operation.operationId !== attempt.operationId ||
      operation.sessionId !== attempt.sessionId ||
      (operation.status !== "unknown" &&
        (operation.recipeId !== attempt.recipe.id ||
          !operation.requestDigest ||
          (attempt.operation?.requestDigest &&
            operation.requestDigest !== attempt.operation.requestDigest)))
    )
      throw new Error("Native Tool observation identity mismatch.");
    // 终态标签不能替代真实退出证据；矛盾回执必须继续占有工作区，防止仍运行的进程被误判为空闲。
    if (terminal(operation) && operation.processStarted && !operation.result?.processExitObserved)
      operation = { ...operation, status: "unknown", error: "Process exit was not observed." };
    attempt.operation = operation;
    attempt.updatedAt = run.updatedAt = this.state.options.now();
    if (terminal(operation)) {
      await this.evidence.finish(run, attempt);
      if (run.version === 5) await this.routing.completed(run, attempt.nodeId, attempt.status);
      else {
        run.status =
          attempt.status === "Completed"
            ? "Running"
            : attempt.status === "Cancelled"
              ? "Cancelled"
              : "Failed";
        run.message = attempt.message;
        if (attempt.status !== "Completed") {
          skipPending(run, attempt.updatedAt);
          this.state.liveRuns.delete(run.id);
        }
      }
      await this.state.put(run);
      if (
        (attempt.status === "Completed" || (run.version === 5 && run.status === "Running")) &&
        this.state.liveRuns.has(run.id) &&
        run.cancelRequestedAt === undefined
      )
        void this.state
          .serial(run.target, () => this.dispatch(run.target, run.id))
          .catch(() =>
            this.state.interrupt(
              run.target,
              run.id,
              "Tool evidence or successor persistence failed; no replay.",
            ),
          );
    } else {
      attempt.status =
        operation.status === "unknown"
          ? "Unknown"
          : run.cancelRequestedAt !== undefined
            ? "CancelRequested"
            : operation.status === "awaiting_permission"
              ? "WaitingForPermission"
              : "Running";
      run.status = attempt.status;
      if (operation.status === "unknown") this.state.liveRuns.delete(run.id);
      await this.state.put(run);
    }
  }
  async cancel(run: GraphSequentialRun): Promise<boolean> {
    const attempt = run.toolAttempts?.find(
      (a) =>
        a.dispatchPhase !== "planned" &&
        a.status !== "Skipped" &&
        !(a.operation && terminal(a.operation)),
    );
    if (!attempt) return false;
    if (["creating", "created"].includes(attempt.dispatchPhase)) {
      attempt.status = run.status = "Cancelled";
      await this.state.put(run);
      this.state.liveRuns.delete(run.id);
      return true;
    }
    const operation = await this.state.options.tools!.cancel(run.target, attempt);
    await this.accept(run, attempt, operation);
    if (!terminal(operation) && operation.status !== "unknown") this.observe(run, attempt);
    return true;
  }
}
