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
import { GraphApprovals } from "./approvals.js";
import { nextStep } from "../domain/approvals.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphTools } from "./tools.js";
import { GraphRouting } from "./routing.js";
import { currentIteration, currentTaskAttempt, currentApprovalAttempt } from "../domain/routing.js";

/** Coordinates existing native services; never owns a second execution queue. */
export class GraphSequencer {
  readonly artifacts: GraphArtifacts;
  readonly tools: GraphTools;
  readonly routing: GraphRouting;
  constructor(
    private readonly state: GraphState,
    private readonly approvals: GraphApprovals,
  ) {
    this.artifacts = new GraphArtifacts(state);
    this.routing = new GraphRouting(state, this.artifacts);
    this.tools = new GraphTools(
      state,
      this.artifacts,
      (target, runId) => this.dispatch(target, runId),
      async (run, nodeId) => {
        await this.approvals.beforeDispatch(run, nodeId);
        if (!(await this.routing.verify(run))) throw new Error(run.message);
      },
      this.routing,
    );
  }
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
    if (run.version !== undefined) {
      if (run.cancelRequestedAt !== undefined) return;
      if (run.version === 5) {
        if (!(await this.routing.verify(run))) return;
        const gate = currentApprovalAttempt(run, run.routing!.cursorNodeId);
        if (gate?.status === "Approved") {
          await this.approvals.beforeDispatch(run, run.routing!.cursorNodeId);
          await this.routing.completed(run, gate.nodeId, "Approved");
          await this.state.put(run);
        }
        const cursor = run.routing!.cursorNodeId;
        const control = run.definition.nodes.find((n) => n.id === cursor);
        if (control?.type === "condition") {
          await this.routing.decisions.evaluate(run, control);
          if (this.state.liveRuns.has(run.id))
            void this.state
              .serial(target, () => this.dispatch(target, runId))
              .catch(() =>
                this.state.interrupt(
                  target,
                  runId,
                  "Route successor persistence failed; no replay.",
                ),
              );
          return;
        }
        if (control?.type === "end") {
          await this.approvals.beforeDispatch(run, control.id);
          this.routing.finish(run);
          await this.state.put(run);
          this.state.liveRuns.delete(run.id);
          this.state.stopObserving(run);
          return;
        }
      }
      const next = nextStep(run);
      await this.approvals.beforeDispatch(run, next ?? null);
      if (!next) {
        this.finishNode(run, "Completed", now);
        await this.state.put(run);
        this.state.liveRuns.delete(runId);
        return;
      }
      if (run.definition.nodes.find((n) => n.id === next)?.type === "approval") {
        await this.approvals.prepare(run, next);
        return;
      }
      if (run.definition.nodes.find((n) => n.id === next)?.type === "tool") {
        await this.tools.start(run, next);
        return;
      }
      const node = currentTaskAttempt(run, next);
      if (!node || node.status !== "Pending") return;
      const index = run.nodeAttempts.indexOf(node);
      if (
        run.version !== 5 &&
        run.nodeAttempts
          .slice(0, index)
          .some((a) => a.status !== "Completed" || a.terminalProof?.state !== "completedSuccess")
      )
        return;
      const definition = run.definition.nodes.find((n) => n.id === node.nodeId) as GraphTaskNode;
      try {
        const artifacts = await Promise.all(
          definition.inputs.flatMap((binding) =>
            binding.source.kind === "artifact"
              ? [this.artifacts.binding(run as GraphSequentialRun, binding.source, binding.alias)]
              : [],
          ),
        );
        if (run.version === 5)
          for (const binding of definition.inputs) {
            if (binding.source.kind !== "repair-feedback") continue;
            const feedback = currentIteration(run)?.feedback;
            if (!feedback || feedback.digest !== this.routing.checks.digest(feedback.text))
              throw new Error("Exact repair feedback is unavailable.");
            artifacts.push({ ...binding, text: feedback.text });
          }
        const resolved = resolveGraphInstructions(
          definition,
          run.definition,
          run.version === 5
            ? run.nodeAttempts.filter(
                (a) => a.iterationId === (run as GraphSequentialRun).routing!.currentIterationId,
              )
            : run.nodeAttempts,
          artifacts,
          run.provenance,
        );
        node.resolvedInstructions = resolved.instructions;
        node.bindings = resolved.bindings;
      } catch (error) {
        node.status = "Failed";
        node.message = error instanceof Error ? error.message : "Graph binding failed.";
        node.updatedAt = now;
        if (run.version === 5) {
          await this.routing.checks.stop(run, "NeedsHuman", node.message);
          return;
        }
        run.status = "Failed";
        run.message = node.message;
        run.updatedAt = now;
        skipPending(run, now);
        await this.state.put(run);
        this.state.liveRuns.delete(runId);
        return;
      }
      if (!(await this.routing.verify(run, true))) return;
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
      if (run.version !== undefined) {
        const node = run.nodeAttempts.find((a) => a.attemptId === attemptId)!;
        Object.assign(node, created);
        node.dispatchPhase = "created";
      } else Object.assign(run, created);
      await this.state.put(run);
      await this.observe(run, attemptId);
      if (run.version !== undefined) {
        run = structuredClone(run);
        await this.approvals.beforeDispatch(
          run,
          run.nodeAttempts.find((a) => a.attemptId === attemptId)!.nodeId,
        );
        if (!(await this.routing.verify(run))) return;
        run.nodeAttempts.find((a) => a.attemptId === attemptId)!.dispatchPhase = "sending";
        await this.state.put(run);
        if (!(await this.routing.checks.beforeEffect(run))) return;
      }
      const sending = nativeExecution(run, attemptId);
      this.state.dispatching.add(sending.commandId);
      let receipt: Awaited<ReturnType<GraphState["options"]["native"]["send"]>>;
      try {
        receipt = await this.state.options.native.send(sending);
      } finally {
        this.state.dispatching.delete(sending.commandId);
      }
      run = structuredClone(run);
      run.status = receipt.accepted ? "Running" : "Unknown";
      if (run.version === 5 && !receipt.accepted) this.state.liveRuns.delete(run.id);
      run.message = receipt.accepted
        ? undefined
        : (receipt.reason ?? "Native admission was not confirmed. No automatic retry will occur.");
      if (run.version !== undefined) {
        const node = run.nodeAttempts.find((a) => a.attemptId === attemptId)!;
        node.status = run.status;
        node.message = run.message;
        if (receipt.accepted) node.dispatchPhase = "accepted";
        node.updatedAt = this.state.options.now();
      }
    } catch (error) {
      // 不确定创建/发送结果保留原身份；不能创建新 session 或重发来掩盖丢失回复。
      run = structuredClone(await this.state.get(target, runId));
      if (run.status === "StaleEvidence" || (run.version === 5 && run.routing?.stopReason)) return;
      run.status = "Unknown";
      if (run.version === 5) this.state.liveRuns.delete(run.id);
      run.message = error instanceof Error ? error.message : "Native dispatch result is unknown.";
      if (run.version !== undefined) {
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
    const node =
      run.version !== undefined ? run.nodeAttempts.find((a) => a.attemptId === attemptId)! : run;
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
        ...(run.version !== undefined && fact.turnId ? { turnId: fact.turnId } : {}),
      };
      if ("dispatchPhase" in node) {
        node.finalOutput = fact.finalOutput;
        node.outputIssue = fact.outputIssue;
        if (run.version !== undefined && run.version >= 4 && fact.state === "completedSuccess")
          await this.artifacts.captureOutput(run, node);
      }
      if (run.version === 5 && "nodeId" in node)
        await this.routing.completed(run, node.nodeId, node.status);
      else if (run.version !== undefined) this.finishNode(run, node.status, now);
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
        run.version !== undefined &&
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
    if (
      run.nodeAttempts.some((a) => a.status === "Pending") ||
      run.toolAttempts?.some((a) => a.status !== "Completed") ||
      run.approvalAttempts?.some((g) => g.status !== "Approved")
    ) {
      run.status = "Running";
      return;
    }
    const end = run.definition.nodes.find((n) => n.type === "end");
    const selected = run.nodeAttempts.find((a) => a.nodeId === end?.outputNodeId);
    const tool = run.toolAttempts?.find(
      (a) => a.nodeId === end?.outputNodeId && a.status === "Completed",
    );
    if (tool) {
      run.resultArtifactId = run.artifactBindings?.find(
        (b) =>
          b.attemptId === tool.attemptId &&
          b.selector === (tool.recipe.verifier.kind === "test" ? "test" : "command"),
      )?.artifactId;
      run.status = run.resultArtifactId ? "Completed" : "Failed";
      run.message = run.resultArtifactId
        ? undefined
        : "Selected End tool has no captured result artifact.";
      return;
    }
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
