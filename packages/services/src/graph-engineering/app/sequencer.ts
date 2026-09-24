import type {
  GraphRun,
  GraphSequentialRun,
  GraphTaskNode,
  GraphWorkspaceTarget,
} from "../contract.js";
import { isConfirmedTerminal } from "../domain/definition.js";
import { resolveGraphInstructions } from "../domain/bindings.js";
import type { GraphNativeFact } from "./ports.js";
import { nativeExecution, skipPending } from "./attempts.js";
import { GraphState } from "./state.js";

/** Coordinates existing native services; never owns a second execution queue. */
export class GraphSequencer {
  constructor(private readonly state: GraphState) {}
  async observe(run: GraphRun, attemptId: string): Promise<void> {
    this.state.observers.get(attemptId)?.dispose();
    this.state.observers.delete(attemptId);
    const observer = await this.state.options.native.observe(
      nativeExecution(run, attemptId),
      (fact) => {
        void this.state
          .serial(run.target, () => this.acceptFact(run.target, run.id, attemptId, fact))
          .catch(() => {
            this.state.interrupt(
              run.target,
              run.id,
              "Graph metadata could not be persisted. No successor was submitted; inspect the original native input.",
            );
          });
      },
      (reason) => {
        void this.state
          .serial(run.target, async () => {
            this.state.interrupt(run.target, run.id, reason);
            await this.state.put(await this.state.get(run.target, run.id));
          })
          .catch(() => {});
      },
    );
    if (this.state.disposed || isConfirmedTerminal(await this.state.get(run.target, run.id)))
      observer.dispose();
    else this.state.observers.set(attemptId, observer);
  }

  async dispatch(target: GraphWorkspaceTarget, runId: string): Promise<void> {
    let run = structuredClone(await this.state.get(target, runId));
    if (isConfirmedTerminal(run) || !this.state.liveRuns.has(runId)) return;
    const now = this.state.options.now();
    let attemptId: string;
    if (run.version === 2) {
      if (run.cancelRequestedAt !== undefined) return;
      const node = run.nodeAttempts.find((a) => a.status === "Pending");
      if (!node) return;
      const index = run.nodeAttempts.indexOf(node);
      if (
        run.nodeAttempts
          .slice(0, index)
          .some((a) => a.status !== "Completed" || a.terminalProof?.state !== "completedSuccess")
      )
        return;
      const definition = run.definition.nodes.find((n) => n.id === node.nodeId) as GraphTaskNode;
      try {
        const resolved = resolveGraphInstructions(definition, run.definition, run.nodeAttempts);
        node.resolvedInstructions = resolved.instructions;
        node.bindings = resolved.bindings;
      } catch (error) {
        node.status = "Failed";
        node.message = error instanceof Error ? error.message : "Graph binding failed.";
        node.updatedAt = now;
        run.status = "Failed";
        run.message = node.message;
        run.updatedAt = now;
        skipPending(run, now);
        await this.state.put(run);
        this.state.liveRuns.delete(runId);
        return;
      }
      node.status = "Starting";
      node.dispatchPhase = "creating";
      node.updatedAt = now;
      attemptId = node.attemptId;
      run.status = "Starting";
      run.updatedAt = now;
      await this.state.put(run);
    } else attemptId = run.attemptId;
    try {
      const execution = nativeExecution(run, attemptId);
      // 每个节点在创建前重新核验已冻结引用；不可用时不能替换模型或放宽权限。
      await this.state.options.native.validateSelection(execution);
      const created = await this.state.options.native.create(execution);
      if (!created.sessionId.trim() || !created.runtimeIdentity.trim())
        throw new Error("Native creation did not return a session and runtime identity.");
      if (run.version === 2) {
        const node = run.nodeAttempts.find((a) => a.attemptId === attemptId)!;
        Object.assign(node, created);
        node.dispatchPhase = "created";
      } else Object.assign(run, created);
      await this.state.put(run);
      await this.observe(run, attemptId);
      if (run.version === 2) {
        run = structuredClone(run);
        run.nodeAttempts.find((a) => a.attemptId === attemptId)!.dispatchPhase = "sending";
        await this.state.put(run);
      }
      const receipt = await this.state.options.native.send(nativeExecution(run, attemptId));
      run = structuredClone(run);
      run.status = receipt.accepted ? "Running" : "Unknown";
      run.message = receipt.accepted
        ? undefined
        : (receipt.reason ?? "Native admission was not confirmed. No automatic retry will occur.");
      if (run.version === 2) {
        const node = run.nodeAttempts.find((a) => a.attemptId === attemptId)!;
        node.status = run.status;
        node.message = run.message;
        if (receipt.accepted) node.dispatchPhase = "accepted";
        node.updatedAt = this.state.options.now();
      }
    } catch (error) {
      // 不确定创建/发送结果保留原身份；不能创建新 session 或重发来掩盖丢失回复。
      run = structuredClone(await this.state.get(target, runId));
      run.status = "Unknown";
      run.message = error instanceof Error ? error.message : "Native dispatch result is unknown.";
      if (run.version === 2) {
        const node = run.nodeAttempts.find((a) => a.attemptId === attemptId)!;
        node.status = "Unknown";
        node.message = run.message;
        node.updatedAt = this.state.options.now();
      }
    }
    run.updatedAt = this.state.options.now();
    await this.state.put(run);
  }

  async acceptFact(
    target: GraphWorkspaceTarget,
    runId: string,
    attemptId: string,
    fact: GraphNativeFact,
  ): Promise<void> {
    const current = await this.state.get(target, runId);
    if (this.state.disposed || isConfirmedTerminal(current)) return;
    const execution = nativeExecution(current, attemptId);
    if (fact.sourceCommandId !== execution.commandId) return;
    const cursor = this.state.cursors.get(attemptId);
    if (
      (cursor && (cursor.logEpoch !== fact.logEpoch || fact.seq <= cursor.seq)) ||
      (execution.observationEpoch && execution.observationEpoch !== fact.logEpoch)
    )
      return;
    const run = structuredClone(current);
    const node = run.version === 2 ? run.nodeAttempts.find((a) => a.attemptId === attemptId)! : run;
    if (node.terminalProof) return;
    const now = this.state.options.now();
    if (fact.foregroundExecutionId) node.foregroundExecutionId = fact.foregroundExecutionId;
    if ("dispatchPhase" in node) node.observationEpoch = fact.logEpoch;
    if (fact.state !== "running") {
      node.status =
        fact.state === "completedSuccess"
          ? "Completed"
          : fact.state === "completedInterrupted"
            ? "Cancelled"
            : "Failed";
      node.terminalProof = {
        sourceCommandId: fact.sourceCommandId,
        state: fact.state,
        logEpoch: fact.logEpoch,
        seq: fact.seq,
        ...(run.version === 2 && fact.turnId ? { turnId: fact.turnId } : {}),
      };
      if ("dispatchPhase" in node) {
        node.finalOutput = fact.finalOutput;
        node.outputIssue = fact.outputIssue;
      }
      if (run.version === 2) this.finishNode(run, node.status, now);
      else
        run.message =
          node.status === "Completed"
            ? "The native input completed. Inspect the conversation, files and tests to verify the task outcome."
            : undefined;
    } else {
      node.status =
        run.status === "CancelRequested"
          ? "CancelRequested"
          : fact.waiting === "permission"
            ? "WaitingForPermission"
            : fact.waiting === "userInput"
              ? "WaitingForUser"
              : "Running";
      if (run.status !== "Interrupted") run.status = node.status;
      node.message = undefined;
    }
    node.updatedAt = now;
    run.updatedAt = now;
    await this.state.put(run);
    this.state.cursors.set(attemptId, { logEpoch: fact.logEpoch, seq: fact.seq });
    if (fact.state !== "running") {
      this.state.observers.get(attemptId)?.dispose();
      this.state.observers.delete(attemptId);
      if (isConfirmedTerminal(run)) {
        this.state.liveRuns.delete(runId);
        this.state.stopObserving(run);
      } else if (
        this.state.liveRuns.has(runId) &&
        run.version === 2 &&
        run.cancelRequestedAt === undefined
      ) {
        // 下一次串行 admission 单独排队，让已经接受的 Cancel 在边界先执行；不用延时猜同步。
        void this.state
          .serial(target, () => this.dispatch(target, runId))
          .catch(() =>
            this.state.interrupt(
              target,
              runId,
              "Successor metadata could not be persisted; no automatic retry.",
            ),
          );
      }
    }
  }

  private finishNode(run: GraphSequentialRun, status: string, now: number): void {
    if (run.cancelRequestedAt !== undefined) {
      run.status = "Cancelled";
      skipPending(run, now);
      return;
    }
    if (!this.state.liveRuns.has(run.id)) {
      run.status = "Interrupted";
      return;
    }
    if (status !== "Completed") {
      run.status = status === "Cancelled" ? "Cancelled" : "Failed";
      skipPending(run, now);
      return;
    }
    if (run.nodeAttempts.some((a) => a.status === "Pending")) {
      run.status = "Running";
      return;
    }
    const end = run.definition.nodes.find((n) => n.type === "end");
    const selected = run.nodeAttempts.find((a) => a.nodeId === end?.outputNodeId);
    if (!selected?.finalOutput?.text.trim()) {
      run.status = "Failed";
      run.message =
        "The selected End task completed without usable final text. No task was retried.";
    } else {
      run.status = "Completed";
      run.result = selected.finalOutput;
      run.message = undefined;
    }
  }
}
