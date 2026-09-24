import type {
  GraphInactivityProof,
  GraphRecoveryInspection,
  GraphRun,
  GraphWorkspaceTarget,
} from "../contract.js";
import { isConfirmedTerminal, workspaceKey } from "../domain/definition.js";
import { activeAttempt, nativeExecution, skipPending } from "./attempts.js";
import { GraphState } from "./state.js";
import { GraphSequencer } from "./sequencer.js";

export class GraphRecovery {
  constructor(
    private readonly state: GraphState,
    private readonly sequencer: GraphSequencer,
  ) {}
  private async inspect(run: GraphRun): Promise<GraphRecoveryInspection> {
    const attempts: GraphRecoveryInspection["attempts"] = [];
    const nodes = run.version === 2 ? run.nodeAttempts : [run];
    for (const node of nodes) {
      const execution = nativeExecution(run, node.attemptId);
      let proof: GraphInactivityProof | undefined;
      if (node.terminalProof && node.sessionId && node.runtimeIdentity) {
        proof = {
          kind: "input-terminal",
          runtimeIdentity: node.runtimeIdentity,
          sessionId: node.sessionId,
          inputId: node.inputId,
          commandId: node.commandId,
          terminalProof: node.terminalProof,
        };
      } else if (
        "dispatchPhase" in node &&
        ["planned", "creating", "created"].includes(node.dispatchPhase)
      ) {
        // serial 已等待创建/发送 flight 结束；持久化 sending 意图前不可能调用 send。
        proof = {
          kind: "never-submitted",
          commandId: node.commandId,
          dispatchPhase: node.dispatchPhase,
        };
      }
      if (proof) {
        attempts.push({
          attemptId: node.attemptId,
          state: "inactive",
          reason: "Persisted evidence confirms this input cannot still execute.",
          proof,
        });
        continue;
      }
      const inspection = await this.state.options.native.inspect(execution);
      if (inspection.kind === "inactive") {
        const p = inspection.proof;
        const valid =
          p.kind === "input-terminal"
            ? p.runtimeIdentity === node.runtimeIdentity &&
              p.sessionId === node.sessionId &&
              p.commandId === node.commandId &&
              p.inputId === node.inputId &&
              p.terminalProof.sourceCommandId === node.commandId
            : p.kind === "runtime-retired" &&
              p.runtimeIdentity === node.runtimeIdentity &&
              p.workspaceKey === workspaceKey(run.target);
        attempts.push(
          valid
            ? {
                attemptId: node.attemptId,
                state: "inactive",
                reason: "Native authority confirms the original input is inactive.",
                proof: p,
              }
            : {
                attemptId: node.attemptId,
                state: "unknown",
                reason: "The inactivity evidence did not match the owned input/runtime.",
              },
        );
      } else if (inspection.kind === "active")
        attempts.push({
          attemptId: node.attemptId,
          state: "active",
          reason:
            "The original native input is still active. Use targeted Cancel or respond in its conversation.",
          foregroundExecutionId: inspection.fact.foregroundExecutionId,
        });
      else
        attempts.push({ attemptId: node.attemptId, state: "unknown", reason: inspection.reason });
    }
    const status = attempts.some((a) => a.state === "active")
      ? "active"
      : attempts.some((a) => a.state === "unknown")
        ? "unknown"
        : "inactive";
    return {
      inspectedAt: this.state.options.now(),
      state: status,
      attempts,
      reason:
        status === "inactive"
          ? "All graph inputs are confirmed inactive. Explicit release preserves unknown outcomes and does not undo files or submit work."
          : status === "active"
            ? "An owned native input is still active; release is refused."
            : "Inactivity is unproven. Inspect the original conversation/runtime; cold history or a replacement runtime cannot release this guard.",
    };
  }
  async inspectRecovery(target: GraphWorkspaceTarget, runId: string): Promise<GraphRun> {
    const run = structuredClone(await this.state.get(target, runId));
    if (isConfirmedTerminal(run)) return run;
    run.recovery = await this.inspect(run);
    run.updatedAt = this.state.options.now();
    await this.state.put(run);
    return structuredClone(run);
  }
  async release(
    target: GraphWorkspaceTarget,
    runId: string,
    reason: string,
    confirmed: boolean,
  ): Promise<GraphRun> {
    if (!confirmed || typeof reason !== "string" || !reason.trim() || reason.length > 2_000)
      throw new Error("Confirm release and provide an audit reason (1–2,000 characters).");
    const run = structuredClone(await this.state.get(target, runId));
    if (run.release) return run;
    if (!["Interrupted", "Unknown", "CancelRequested"].includes(run.status))
      throw new Error(
        "Only unresolved interrupted work can be released; active work must first be cancelled or finish.",
      );
    const inspection = await this.inspect(run);
    run.recovery = inspection;
    run.updatedAt = this.state.options.now();
    if (inspection.state !== "inactive") {
      await this.state.put(run);
      throw new Error(inspection.reason);
    }
    run.release = { releasedAt: this.state.options.now(), reason: reason.trim(), inspection };
    await this.state.put(run);
    this.state.liveRuns.delete(run.id);
    this.state.stopObserving(run);
    return structuredClone(run);
  }
  async cancel(target: GraphWorkspaceTarget, runId: string): Promise<GraphRun> {
    let run = structuredClone(await this.state.get(target, runId));
    if (isConfirmedTerminal(run)) return run;
    const node = activeAttempt(run);
    const now = this.state.options.now();
    run.status = "CancelRequested";
    run.updatedAt = now;
    if (run.version === 2) {
      run.cancelRequestedAt ??= now;
      skipPending(run, now);
    }
    await this.state.put(run);
    if (!node) {
      run.status = "Cancelled";
      await this.state.put(run);
      this.state.liveRuns.delete(runId);
      return run;
    }
    const execution = nativeExecution(run, node.attemptId);
    const inspection = await this.state.options.native.inspect(execution);
    if (inspection.kind === "inactive" && inspection.fact) {
      await this.sequencer.acceptFact(target, runId, node.attemptId, inspection.fact);
      return structuredClone(await this.state.get(target, runId));
    }
    if (
      inspection.kind !== "active" ||
      inspection.fact.sourceCommandId !== node.commandId ||
      !inspection.fact.foregroundExecutionId
    )
      throw new Error(
        "No exact active native execution is confirmed; inspect recovery or open its conversation. Cancellation intent remains recorded.",
      );
    run = structuredClone(await this.state.get(target, runId));
    const current =
      run.version === 2 ? run.nodeAttempts.find((a) => a.attemptId === node.attemptId)! : run;
    current.foregroundExecutionId = inspection.fact.foregroundExecutionId;
    await this.state.put(run);
    await this.sequencer.observe(run, node.attemptId);
    await this.state.options.native.cancel(nativeExecution(run, node.attemptId));
    return structuredClone(run);
  }
}
