import type { GraphSequentialRun, GraphRoutingState } from "../contract.js";
import { currentIteration } from "../domain/routing.js";
import { GraphState } from "./state.js";
import { runFingerprint, skipPending } from "./attempts.js";
import { frozenRoutingConfiguration } from "./routing-plan.js";

export class GraphRoutingChecks {
  constructor(private readonly state: GraphState) {}
  digest(value: unknown): string {
    return this.state.options.evidence!.digest(runFingerprint(value));
  }
  async source(run: GraphSequentialRun): Promise<string | undefined> {
    const region = run.definition.routing?.region;
    return region
      ? (await this.state.options.recipes!.fingerprint(run.target, region.sourcePaths)).digest
      : undefined;
  }
  async verify(run: GraphSequentialRun, reserve = false): Promise<boolean> {
    if (run.version !== 5) return true;
    if (run.routing!.stopReason || run.cancelRequestedAt !== undefined) return false;
    const routing = run.routing!;
    if (
      this.state.options.now() >= routing.deadlineAt ||
      (reserve && routing.admissions >= run.definition.routing!.limits.maxNodeAdmissions)
    ) {
      await this.stop(
        run,
        "BudgetExhausted",
        "The frozen native admission or wall-clock budget is exhausted.",
      );
      return false;
    }
    try {
      if (run.provenance) {
        const capture = await this.state.options.preflight?.capture(
          run.target,
          run.definition,
          run.defaults,
        );
        if (!capture || capture.digest !== run.provenance.digest)
          throw new Error(
            "Workflow reference or native configuration drift: review a new run before executing more nodes.",
          );
      }
      const record = await this.state.load(run.target);
      if (
        runFingerprint(record.definition) !== runFingerprint(run.definition) ||
        this.digest(frozenRoutingConfiguration(run)) !== routing.configurationDigest ||
        (await this.state.options.recipes!.read(run.target)).digest !==
          routing.recipeConfigurationDigest
      )
        throw new Error(
          "Saved graph, frozen settings or project recipes changed; start a newly reviewed run.",
        );
      const source = await this.source(run);
      if (source !== currentIteration(run)?.sourceDigest)
        throw new Error("Declared source changed outside the authorized writer attempt.");
    } catch (error) {
      await this.stop(
        run,
        "NeedsHuman",
        error instanceof Error ? error.message : "Routing constraints could not be verified.",
      );
      return false;
    }
    if (reserve) {
      if (this.state.options.now() >= routing.deadlineAt) {
        await this.stop(
          run,
          "BudgetExhausted",
          "The wall-clock deadline expired during constraint verification.",
        );
        return false;
      }
      routing.admissions++;
      const iteration = currentIteration(run)!;
      if (!iteration.visitedNodeIds.includes(routing.cursorNodeId))
        iteration.visitedNodeIds.push(routing.cursorNodeId);
      for (const checkpoint of routing.checkpoints)
        if (checkpoint.successorNodeId === routing.cursorNodeId && !checkpoint.consumedAt)
          checkpoint.consumedAt = this.state.options.now();
    }
    if (!reserve && this.state.options.now() >= routing.deadlineAt) {
      await this.stop(
        run,
        "BudgetExhausted",
        "The wall-clock deadline expired during constraint verification.",
      );
      return false;
    }
    return true;
  }
  async beforeEffect(run: GraphSequentialRun): Promise<boolean> {
    if (run.version !== 5 || this.state.options.now() < run.routing!.deadlineAt) return true;
    // sending 落盘可能跨过截止时刻；不发送，也不回退意图伪造安全续跑，保留待审计所有权。
    run.routing!.stopReason = {
      kind: "BudgetExhausted",
      message: "Deadline expired while persisting native intent; no native send/start was called.",
      at: this.state.options.now(),
    };
    run.cancelRequestedAt = this.state.options.now();
    run.status = "Unknown";
    run.message = run.routing!.stopReason.message;
    run.updatedAt = this.state.options.now();
    await this.state.put(run);
    this.state.liveRuns.delete(run.id);
    return false;
  }
  async stop(
    run: GraphSequentialRun,
    kind: NonNullable<GraphRoutingState["stopReason"]>["kind"],
    message: string,
  ): Promise<void> {
    run.routing!.stopReason ??= { kind, message, at: this.state.options.now() };
    run.status = run.routing!.stopReason.kind;
    run.message = run.routing!.stopReason.message;
    run.updatedAt = this.state.options.now();
    skipPending(run, run.updatedAt);
    await this.state.put(run);
    this.state.liveRuns.delete(run.id);
  }
}
