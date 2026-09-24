import type { GraphParallelRun, GraphParallelChild } from "../parallel-contract.js";
import {
  combineParallelProposals,
  parallelChildDefinition,
  parallelChildStopped,
} from "../domain/parallel.js";
import { ParallelState } from "./parallel-state.js";

export class ParallelExecution {
  constructor(readonly owner: ParallelState) {}
  arm(run: GraphParallelRun) {
    const { state } = this.owner;
    if (!run.deadlineAt) return;
    const timer = setTimeout(
      () => {
        void state
          .serial(run.target, async () => {
            if (!this.owner.live.has(run.id)) return;
            await this.owner.stop(
              await this.owner.get(run.target, run.id),
              "Run-wide deadline exceeded. Owned active children were requested to cancel; unknown effects are retained.",
            );
          })
          .catch(() => this.owner.clear(run.id));
      },
      Math.max(0, run.deadlineAt - state.options.now()),
    );
    timer.unref?.();
    this.owner.timers.set(run.id, timer);
  }
  async launch(run: GraphParallelRun, child: GraphParallelChild, cost: number) {
    if (child.admission)
      throw new Error("Child dispatch intent already exists; uncertain work is not replayed.");
    await this.owner.verify(run);
    // 已知的前一次失败必须在下一次准入前生效，不能等父事件队列获得锁后才取消。
    for (const current of (await this.owner.children(run)).values())
      if (parallelChildStopped(current.status))
        throw new Error(`Owned child stopped: ${current.status}. No further admission.`);
    if (run.admissions + cost > run.plan.admissionBudget)
      throw new Error("Run-wide native admission budget exceeded.");
    child.admission = "reserved";
    run.admissions += cost;
    await this.owner.put(run);
    const target = { workspacePath: child.workspace!.workspacePath };
    const view = await this.owner.graph.getWorkspace(target);
    const definition = await this.owner.graph.saveDefinition({
      target,
      definition: parallelChildDefinition(run, child.id),
      expectedRevision: view.definition.revision,
    });
    child.definitionRevision = definition.revision;
    await this.owner.put(run);
    const result = await this.owner.graph.run({
      target,
      revision: definition.revision,
      requestId: child.requestId,
      ...run.settings,
    });
    child.runId = result.id;
    child.admission = "acknowledged";
    await this.owner.put(run);
    if (parallelChildStopped(result.status))
      throw new Error(`Owned child stopped: ${result.status}. No further admission.`);
  }
  async advance(run: GraphParallelRun) {
    if (!this.owner.live.has(run.id)) return;
    try {
      await this.owner.verify(run);
      const children = await this.owner.children(run);
      for (const child of children.values())
        if (parallelChildStopped(child.status)) {
          await this.owner.stop(
            run,
            `Owned child ${child.definition.name} stopped: ${child.status}. No partial integration or success.`,
          );
          return;
        }
      if (run.phase === "Workers") {
        const selected = run.children.filter((c) => c.selected);
        for (const child of selected) {
          if (children.get(child.id)?.status !== "Completed" || child.proposal) continue;
          const branch = run.plan.branches.find((b) => b.id === child.id)!;
          child.proposal = await this.owner.port.capture(child, branch.files, branch.additions);
          await this.owner.put(run);
        }
        let active = selected.filter((c) => c.admission && !c.proposal).length;
        for (const child of selected) {
          if (child.admission || active >= run.plan.concurrency) continue;
          await this.launch(run, child, 1);
          active++;
        }
        if (selected.every((c) => c.proposal)) {
          await this.owner.inactive(run);
          run.joinDigest = this.owner.digest(selected.map((c) => c.proposal));
          run.phase = "JoinReview";
          run.message =
            "All selected workers completed. Review full proposals and resolve each shared path explicitly before integration.";
          await this.owner.put(run);
        }
      } else if (
        run.phase === "Integrating" &&
        children.get("integration")?.status === "Completed"
      ) {
        await this.verifyIntegrated(run);
        run.phase = "Validating";
        run.message =
          "The integrated diff matches the reviewed proposal. Combined Build/Test and final human approval are required.";
        await this.owner.put(run);
        await this.launch(run, run.validation, 2);
      } else if (run.phase === "Validating" && children.get("validation")?.status === "Completed") {
        await this.verifyIntegrated(run);
        await this.owner.inactive(run);
        run.phase = "Completed";
        run.message =
          "Combined source was independently built/tested and explicitly approved. Original workspace remains unchanged.";
        await this.owner.put(run);
        this.owner.clear(run.id);
      }
    } catch (error) {
      await this.owner.stop(
        run,
        error instanceof Error ? error.message : "Parallel admission stopped.",
      );
    }
  }
  async verifyIntegrated(run: GraphParallelRun) {
    const expected = run.expectedProposal;
    if (!expected) throw new Error("Reviewed integration proposal is missing.");
    const actual = await this.owner.port.capture(
      run.integration,
      expected.files.map((f) => f.path),
      expected.files.filter((f) => f.kind === "add").map((f) => f.path),
    );
    if (this.owner.digest(actual.files) !== this.owner.digest(expected.files))
      throw new Error(
        "Integrated diff differs from the reviewed complete proposal. Combined tests were not authorized by that proposal.",
      );
    run.integration.proposal = actual;
  }
  async integration(run: GraphParallelRun, resolutions: Record<string, string>) {
    await this.owner.verify(run);
    await this.owner.inactive(run);
    for (const child of run.children.filter((c) => c.selected)) {
      const branch = run.plan.branches.find((b) => b.id === child.id)!;
      const actual = await this.owner.port.capture(child, branch.files, branch.additions);
      if (actual.digest !== child.proposal?.digest)
        throw new Error(`Worker ${child.id} changed after proposal capture.`);
    }
    run.expectedProposal = combineParallelProposals(
      run.children.filter((c) => c.selected).map((c) => c.proposal!),
      resolutions,
      (value) => this.owner.state.options.evidence!.digest(value),
    );
  }
}
