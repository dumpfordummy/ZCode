import type { IGraphEngineeringService, GraphWorkspaceTarget } from "../contract.js";
import type {
  IGraphParallelService,
  GraphParallelRun,
  GraphParallelChild,
} from "../parallel-contract.js";
import { localTarget, isConfirmedTerminal, workspaceKey } from "../domain/definition.js";
import { graphSettingsSchema } from "../domain/sequential.js";
import { parallelPlanSchema } from "../domain/parallel-schema.js";
import { parallelChildren, parallelUnresolved } from "../domain/parallel.js";
import { GraphState, MetadataOwnedElsewhere } from "./state.js";
import { ParallelState } from "./parallel-state.js";
import { ParallelExecution } from "./parallel-execution.js";

const requireId = (value: string) => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(value))
    throw new Error("Stable request/decision ID required.");
  return value;
};
export class GraphParallelService implements IGraphParallelService {
  readonly owner: ParallelState;
  readonly execution: ParallelExecution;
  readonly onDidChange;
  private readonly subscription;
  constructor(
    private readonly state: GraphState,
    graph: IGraphEngineeringService,
  ) {
    this.owner = new ParallelState(state, graph);
    this.execution = new ParallelExecution(this.owner);
    this.onDidChange = state.changed.event;
    this.subscription = state.changed.event(({ workspaceKey: key }) => {
      for (const record of state.records.values())
        for (const run of record.parallel?.runs ?? []) {
          if (
            !this.owner.live.has(run.id) ||
            workspaceKey(run.target) === key ||
            !parallelChildren(run).some((c) => c.workspace?.workspacePath === key)
          )
            continue;
          void state
            .serial(run.target, async () =>
              this.execution.advance(await this.owner.get(run.target, run.id)),
            )
            .catch(() => this.owner.clear(run.id));
        }
    });
  }
  async get(value: GraphWorkspaceTarget) {
    const target = localTarget(value);
    return this.state.serial(target, async () => {
      let record;
      let readOnly = false;
      try {
        record = await this.state.load(target);
      } catch (error) {
        if (!(error instanceof MetadataOwnedElsewhere)) throw error;
        record = await this.state.options.repository.read(target);
        readOnly = true;
      }
      const parallel = structuredClone(record?.parallel ?? { runs: [] });
      const children: Record<string, Awaited<ReturnType<IGraphEngineeringService["run"]>>> = {};
      for (const run of parallel.runs)
        for (const [slot, child] of await this.owner.children(run, true))
          children[`${run.id}:${slot}`] = child;
      return { ...parallel, children, readOnly };
    });
  }
  async save(params: Parameters<IGraphParallelService["save"]>[0]) {
    const target = localTarget(params.target),
      plan = parallelPlanSchema.parse(params.plan);
    return this.state.serial(target, async () => {
      const record = await this.state.load(target);
      if ((record.parallel?.plan?.revision ?? 0) !== params.expectedRevision)
        throw new Error("Parallel plan revision changed; reload.");
      const saved = { ...plan, revision: params.expectedRevision + 1 };
      await this.state.commit(target, {
        ...record,
        parallel: { runs: record.parallel?.runs ?? [], plan: saved },
      });
      return saved;
    });
  }
  private async previewOwned(
    target: GraphWorkspaceTarget,
    revision: number,
    settings: Parameters<IGraphParallelService["preview"]>[0]["settings"],
  ) {
    const record = await this.state.load(target),
      plan = record.parallel?.plan;
    if (!plan || plan.revision !== revision)
      throw new Error("Save and reload the exact parallel plan first.");
    return this.owner.port.preview(target, plan, graphSettingsSchema.parse(settings));
  }
  async preview(params: Parameters<IGraphParallelService["preview"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () =>
      this.previewOwned(target, params.revision, params.settings),
    );
  }
  async prepare(params: Parameters<IGraphParallelService["prepare"]>[0]) {
    const target = localTarget(params.target);
    requireId(params.requestId);
    return this.state.serial(target, async () => {
      const record = await this.state.load(target),
        fingerprint = this.owner.digest(params);
      if (record.parallelParent)
        throw new Error("Owned worker/integration workspaces cannot host nested Fork/Join plans.");
      const old = record.parallel?.runs.find((r) => r.requestId === params.requestId);
      if (old) {
        if (old.requestFingerprint !== fingerprint)
          throw new Error("Preparation request ID reused with different inputs.");
        return structuredClone(old);
      }
      if (
        record.runs.some((r) => !isConfirmedTerminal(r)) ||
        record.parallel?.runs.some(parallelUnresolved)
      )
        throw new Error("Original workspace has unresolved Graph work.");
      if (params.acknowledgedUnknowns !== true)
        throw new Error(
          "Acknowledge native initialization, configured integrations and Unknown destinations before preparation.",
        );
      const preview = await this.previewOwned(target, params.revision, params.settings);
      if (preview.digest !== params.previewDigest)
        throw new Error("Base/configuration changed; review a new preview.");
      const id = this.state.options.id(),
        plan = structuredClone(record.parallel!.plan!),
        now = this.state.options.now();
      const child = (slot: string, selected = true): GraphParallelChild => ({
        id: slot,
        requestId: this.state.options.id(),
        selected,
      });
      const run: GraphParallelRun = {
        id,
        requestId: params.requestId,
        requestFingerprint: fingerprint,
        target,
        plan,
        settings: graphSettingsSchema.parse(params.settings),
        preview,
        phase: "Preparing",
        createdAt: now,
        updatedAt: now,
        admissions: 0,
        children: plan.branches.map((b) => child(b.id, b.selected)),
        integration: child("integration"),
        validation: child("validation"),
        preservedSlots: [],
        cleanup: [],
      };
      await this.state.commit(target, {
        ...record,
        parallel: { ...record.parallel!, runs: [...record.parallel!.runs, run] },
      });
      try {
        for (const entry of [...run.children.filter((c) => c.selected), run.integration]) {
          entry.workspace = await this.owner.port.prepare(
            preview,
            id,
            entry.id,
            this.state.options.id(),
          );
          await this.owner.put(run);
          await this.owner.bind(run, entry);
          entry.inventory = await this.owner.port.initialize(
            entry.workspace,
            run.settings,
            preview.recipes,
          );
          await this.owner.put(run);
        }
        run.validation.workspace = run.integration.workspace;
        run.validation.inventory = run.integration.inventory;
        run.preparedDigest = this.owner.digest({
          plan,
          preview,
          children: run.children,
          integration: run.integration,
          settings: run.settings,
        });
        run.phase = "Prepared";
        await this.owner.put(run);
      } catch (error) {
        await this.owner.stop(
          run,
          error instanceof Error
            ? error.message
            : "Preparation failed. Owned paths retained; no retry.",
        );
      }
      return structuredClone(run);
    });
  }
  async decide(params: Parameters<IGraphParallelService["decide"]>[0]) {
    if (!["plan", "integration"].includes(params.phase))
      throw new Error("Unknown parallel review phase.");
    const target = localTarget(params.target);
    requireId(params.decisionId);
    if (!params.comment.trim() || params.comment.length > 2000)
      throw new Error("A bounded review comment is required.");
    return this.state.serial(target, async () => {
      const run = await this.owner.get(target, params.runId),
        old = params.phase === "plan" ? run.planDecision : run.integrationDecision;
      if (old) {
        if (
          old.id !== params.decisionId ||
          old.digest !== params.digest ||
          old.comment !== params.comment ||
          old.approved !== params.approved ||
          ("resolutions" in old &&
            this.owner.digest(old.resolutions) !== this.owner.digest(params.resolutions ?? {}))
        )
          throw new Error("Conflicting repeated parallel decision.");
        return run;
      }
      if (
        params.phase === "plan"
          ? run.phase !== "Prepared" || run.preparedDigest !== params.digest
          : run.phase !== "JoinReview" || run.joinDigest !== params.digest
      )
        throw new Error("Review phase or digest changed.");
      const decision = {
        id: params.decisionId,
        digest: params.digest,
        approved: params.approved,
        comment: params.comment,
        at: this.state.options.now(),
      };
      if (!params.approved) {
        if (params.phase === "plan") run.planDecision = decision;
        else run.integrationDecision = { ...decision, resolutions: params.resolutions ?? {} };
        await this.owner.stop(run, "Human review rejected; no further admission.");
        return run;
      }
      if (params.acknowledgedUnknowns !== true)
        throw new Error("Review and acknowledge Unknown native behavior.");
      if (params.phase === "plan") {
        if (run.phase !== "Prepared" || run.preparedDigest !== params.digest)
          throw new Error("Prepared plan changed or cannot be admitted.");
        await this.owner.verify(run);
        run.planDecision = decision;
        run.deadlineAt = this.state.options.now() + run.plan.deadlineMs;
        run.phase = "Workers";
        await this.owner.put(run);
        this.owner.live.add(run.id);
        this.execution.arm(run);
        await this.execution.advance(run);
      } else {
        if (
          run.phase !== "JoinReview" ||
          run.joinDigest !== params.digest ||
          !this.owner.live.has(run.id)
        )
          throw new Error(
            "Join is not live and fully reviewed; interrupted work never integrates automatically.",
          );
        const resolutions = params.resolutions ?? {};
        await this.execution.integration(run, resolutions);
        run.integrationDecision = { ...decision, resolutions };
        run.phase = "Integrating";
        run.message =
          "Applying the explicitly reviewed proposals in the owned integration workspace.";
        await this.owner.put(run);
        try {
          await this.execution.launch(run, run.integration, 1);
        } catch (error) {
          await this.owner.stop(
            run,
            error instanceof Error ? error.message : "Integration admission unknown.",
          );
        }
      }
      return structuredClone(await this.owner.get(target, run.id));
    });
  }
  async control(params: Parameters<IGraphParallelService["control"]>[0]) {
    if (!["cancel", "inspect", "release", "cleanup", "preserve"].includes(params.action))
      throw new Error("Unknown parallel control action.");
    const target = localTarget(params.target);
    if (!params.reason.trim() || params.reason.length > 2000)
      throw new Error("A bounded audit reason is required.");
    return this.state.serial(target, async () => {
      const run = await this.owner.get(target, params.runId);
      if (params.action === "cancel") {
        run.cancelledAt = this.state.options.now();
        await this.owner.stop(run, params.reason);
      } else if (params.action === "inspect") {
        await this.owner.children(run);
        for (const child of parallelChildren(run)) {
          const actual = await this.owner.child(run, child);
          if (actual)
            await this.owner.graph.inspectRecovery({ target: actual.target, runId: actual.id });
        }
        await this.owner.put(run);
      } else if (params.action === "preserve") {
        const slots = params.slots ?? [];
        if (
          !slots.length ||
          new Set(slots).size !== slots.length ||
          slots.some((slot) => ![...run.children, run.integration].some((c) => c.id === slot)) ||
          typeof params.preserve !== "boolean" ||
          (run.retentionDecisions?.length ?? 0) >= 1000
        )
          throw new Error("Invalid retention decision or foreign workspace slot.");
        for (const slot of slots) {
          run.preservedSlots = run.preservedSlots.filter((s) => s !== slot);
          if (params.preserve) run.preservedSlots.push(slot);
        }
        (run.retentionDecisions ??= []).push({
          slots: [...slots],
          preserve: params.preserve,
          at: this.state.options.now(),
          reason: params.reason,
        });
        await this.owner.put(run);
      } else {
        if (this.owner.live.has(run.id) || ["Preparing", "Prepared"].includes(run.phase))
          throw new Error("Cancel/stop this plan before release or cleanup.");
        const children = await this.owner.inactive(run);
        if (params.action === "release") {
          run.released = { at: this.state.options.now(), reason: params.reason };
          await this.owner.put(run);
        } else {
          if (!params.slots?.length) throw new Error("Select exact owned workspaces.");
          if (
            new Set(params.slots).size !== params.slots.length ||
            params.slots.some((slot) => {
              const c = [...run.children, run.integration].find((c) => c.id === slot);
              return !c?.workspace || run.preservedSlots.includes(slot) || c.workspace.cleaned;
            })
          )
            throw new Error("Foreign, preserved or already cleaned workspace.");
          for (const slot of params.slots) {
            const child = [...run.children, run.integration].find((c) => c.id === slot);
            if (!child?.workspace || run.preservedSlots.includes(slot) || child.workspace.cleaned)
              throw new Error("Foreign, preserved or already cleaned workspace.");
            child.workspace = await this.owner.port.cleanup(
              child.workspace,
              children.filter((c) => c.target.workspacePath === child.workspace!.workspacePath),
            );
            if (slot === "integration") run.validation.workspace = child.workspace;
            run.cleanup.push({ slot, at: this.state.options.now(), reason: params.reason });
            await this.owner.put(run);
          }
        }
      }
      return structuredClone(run);
    });
  }
  dispose() {
    this.subscription.dispose();
    this.owner.dispose();
  }
}
