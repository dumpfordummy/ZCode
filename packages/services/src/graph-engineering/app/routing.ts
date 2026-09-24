import type { GraphRunContinueCommand, GraphSequentialRun } from "../contract.js";
import {
  currentApprovalAttempt,
  currentIteration,
  currentTaskAttempt,
  currentToolAttempt,
  routeCheckpoint,
} from "../domain/routing.js";
import { GraphArtifacts } from "./artifacts.js";
import { GraphState } from "./state.js";
import { GraphRoutingChecks } from "./routing-checks.js";
import { GraphRoutingDecision } from "./routing-decision.js";
import { skipPending } from "./attempts.js";

export class GraphRouting {
  readonly checks: GraphRoutingChecks;
  readonly decisions: GraphRoutingDecision;
  constructor(
    private readonly state: GraphState,
    artifacts: GraphArtifacts,
  ) {
    this.checks = new GraphRoutingChecks(state);
    this.decisions = new GraphRoutingDecision(state, artifacts);
  }
  async verify(run: GraphSequentialRun, reserve = false): Promise<boolean> {
    if (!(await this.checks.verify(run, false))) return false;
    if (run.version === 5) {
      try {
        await this.decisions.verifyCheckpoint(run);
      } catch (error) {
        await this.checks.stop(
          run,
          "NeedsHuman",
          error instanceof Error ? error.message : "Checkpoint evidence changed.",
        );
        return false;
      }
    }
    return reserve ? this.checks.verify(run, true) : true;
  }
  async completed(run: GraphSequentialRun, nodeId: string, status: string): Promise<void> {
    if (run.version !== 5) return;
    if (run.cancelRequestedAt !== undefined || run.routing!.stopReason) {
      run.status = run.routing!.stopReason?.kind ?? "Cancelled";
      skipPending(run, this.state.options.now());
      return;
    }
    if (!this.state.liveRuns.has(run.id)) {
      run.status = "Interrupted";
      return;
    }
    const tool = currentToolAttempt(run, nodeId);
    const region = run.definition.routing!.region;
    const definitiveFailure =
      status === "Failed" &&
      region?.bodyNodeIds.includes(nodeId) &&
      tool?.verification?.observationValid === true &&
      tool.verification.outcome === "fail";
    if (status !== "Completed" && status !== "Approved" && !definitiveFailure) {
      await this.checks.stop(
        run,
        "NeedsHuman",
        `Node ${nodeId} did not produce a definitive usable result. No repair is authorized.`,
      );
      return;
    }
    const iteration = currentIteration(run)!;
    if (nodeId === region?.entryNodeId || nodeId === region?.repairEntryNodeId)
      iteration.sourceDigest = await this.checks.source(run);
    else if (!(await this.checks.verify(run))) return;
    if (!iteration.visitedNodeIds.includes(nodeId)) iteration.visitedNodeIds.push(nodeId);
    const next = run.definition.edges.find((e) => e.source === nodeId);
    if (!next) throw new Error("Frozen route successor is missing.");
    run.routing!.cursorNodeId = next.target;
    run.status = "Running";
  }
  finish(run: GraphSequentialRun): void {
    const end = run.definition.nodes.find((n) => n.id === run.routing!.cursorNodeId);
    const gate = currentApprovalAttempt(run, run.definition.routing!.finalGateId);
    if (end?.type !== "end" || gate?.status !== "Approved")
      throw new Error("Final human gate has not approved this iteration.");
    const task = end.outputNodeId ? currentTaskAttempt(run, end.outputNodeId) : undefined;
    const tool = end.outputNodeId ? currentToolAttempt(run, end.outputNodeId) : undefined;
    if (task?.status === "Completed" && task.finalOutput?.text.trim())
      run.result = task.finalOutput;
    else if (tool?.status === "Completed")
      run.resultArtifactId = run.artifactBindings?.find(
        (b) =>
          b.attemptId === tool.attemptId &&
          b.selector === (tool.recipe.verifier.kind === "test" ? "test" : "command"),
      )?.artifactId;
    if (!run.result && !run.resultArtifactId)
      throw new Error(
        "Current End output is unavailable; skipped branch outputs cannot complete the run.",
      );
    run.status = "Completed";
    run.message = undefined;
    skipPending(run, this.state.options.now());
  }
  async continue(
    params: GraphRunContinueCommand,
  ): Promise<{ run: GraphSequentialRun; dispatch: boolean }> {
    const current = await this.state.get(params.target, params.runId);
    if (current.version !== 5 || !current.routing)
      throw new Error("Only an explicit routing checkpoint can continue.");
    const run = structuredClone(current),
      routing = run.routing!;
    const prior = routing.continuations.find((c) => c.requestId === params.requestId);
    if (prior) {
      if (
        prior.checkpointId !== params.checkpointId ||
        prior.checkpointDigest !== params.checkpointDigest
      )
        throw new Error("Continuation request ID conflict.");
      return { run, dispatch: false };
    }
    const checkpoint = routing.checkpoints.at(-1);
    if (
      run.status !== "AwaitingContinuation" ||
      !checkpoint?.resumeRequired ||
      routeCheckpoint(run)?.id !== checkpoint.id ||
      checkpoint.id !== params.checkpointId ||
      checkpoint.digest !== params.checkpointDigest ||
      checkpoint.consumedAt ||
      routing.cursorNodeId !== checkpoint.successorNodeId ||
      routing.currentIterationId !== checkpoint.iterationId
    )
      throw new Error(
        "This checkpoint cannot continue: identity, activity or successor intent changed.",
      );
    const { digest, resumeRequired: _resume, consumedAt: _consumed, ...body } = checkpoint;
    if (digest !== this.checks.digest(body))
      throw new Error("Checkpoint digest does not match its persisted decision.");
    if (!(await this.verify(run))) return { run, dispatch: false };
    checkpoint.resumeRequired = false;
    routing.continuations.push({
      requestId: params.requestId,
      checkpointId: params.checkpointId,
      checkpointDigest: params.checkpointDigest,
    });
    run.status = "Running";
    run.message = undefined;
    await this.state.put(run);
    this.state.liveRuns.add(run.id);
    return { run, dispatch: true };
  }
}
