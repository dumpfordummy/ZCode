import { assertGraphInputAllowed } from "./input-guard.js";
import { armRoutingDeadline } from "./routing-deadline.js";
import { modelSelectionSchema } from "@zcode/shared";
import { submissionModeSchema } from "@zcode/shared/zcode-protocol-v4";
import type {
  GraphNativeSettings,
  GraphRun,
  GraphWorkspaceTarget,
  IGraphEngineeringService,
} from "../contract.js";
import {
  defaultDefinition,
  isConfirmedTerminal,
  localTarget,
  validateDefinition,
  validateReadiness,
} from "../domain/definition.js";
import { runFingerprint } from "./attempts.js";
import { GraphRecovery } from "./recovery.js";
import { createRunPlan } from "./run-plan.js";
import { GraphSequencer } from "./sequencer.js";
import { GraphState, MetadataOwnedElsewhere, type GraphOptions } from "./state.js";
import type { GraphRuntimeGate } from "./runtime-ports.js";
import { GraphApprovals } from "./approvals.js";
import { GraphParallelService } from "./parallel-service.js";
import { parallelUnresolved } from "../domain/parallel.js";
import { assertParallelAdmission, parallelGuardedRuns } from "./parallel-guard.js";

import type { GraphInputGuardRequest } from "./ports.js";
import { checksStartSchema } from "../domain/checks-record.js";
import { GRAPH_CHECKS_ADMISSION_REJECTED } from "../checks-types.js";
export type { GraphInputGuardRequest } from "./ports.js";
export interface GraphServiceOptions extends GraphOptions {
  /** 缺省仅用于不涉及原生边界的测试夹具；生产组合根（node.ts）必须提供并有测试固定。 */
  runtime?: GraphRuntimeGate;
}
export class GraphEngineeringService implements IGraphEngineeringService {
  readonly parallelService: GraphParallelService;
  private readonly state: GraphState;
  private readonly sequencer: GraphSequencer;
  private readonly recovery: GraphRecovery;
  private readonly runtime?: GraphRuntimeGate;
  private readonly approvals: GraphApprovals;
  readonly onDidChange;
  constructor(options: GraphServiceOptions) {
    this.runtime = options.runtime;
    this.state = new GraphState(options);
    this.approvals = new GraphApprovals(this.state);
    this.sequencer = new GraphSequencer(this.state, this.approvals);
    this.recovery = new GraphRecovery(this.state, this.sequencer);
    this.onDidChange = this.state.changed.event;
    this.parallelService = new GraphParallelService(this.state, this);
  }
  async validateDefinition(params: Parameters<IGraphEngineeringService["validateDefinition"]>[0]) {
    return validateReadiness(params.definition);
  }
  async getWorkspace(value: GraphWorkspaceTarget) {
    const target = localTarget(value);
    return this.state.serial(target, async () => {
      try {
        return {
          ...structuredClone(await this.state.load(target)),
          availability:
            ((await this.state.load(target)).definition.version ?? 0) >= 4 &&
            !(await this.state.load(target)).definition.nodes.some((n) => n.type === "task") &&
            this.state.options.tools
              ? await this.state.options.tools.available()
              : await this.state.options.native.available(),
        };
      } catch (error) {
        if (!(error instanceof MetadataOwnedElsewhere)) throw error;
        return {
          ...((await this.state.options.repository.read(target)) ?? {
            definition: defaultDefinition(),
            runs: [],
          }),
          availability: { available: false, reason: error.message },
          readOnly: true,
        };
      }
    });
  }
  async saveDefinition(params: Parameters<IGraphEngineeringService["saveDefinition"]>[0]) {
    const target = localTarget(params.target);
    const definition = validateDefinition(params.definition);
    return this.state.serial(target, async () => {
      const record = await this.state.load(target);
      if (record.definition.revision !== params.expectedRevision)
        throw new Error("Graph revision changed; reload before saving.");
      if (record.definition.version !== undefined && definition.version === undefined)
        throw new Error("A sequential graph cannot be silently downgraded to Z1.");
      if ((record.definition.version ?? 1) > (definition.version ?? 1))
        throw new Error("A Human Approval graph cannot be downgraded to version 2.");
      const saved = { ...definition, revision: record.definition.revision + 1 };
      await this.state.commit(target, { ...record, definition: saved });
      return structuredClone(saved);
    });
  }
  async run(params: Parameters<IGraphEngineeringService["run"]>[0]): Promise<GraphRun> {
    const target = localTarget(params.target);
    if (!params.requestId?.trim() || params.requestId.length > 200)
      throw new Error("A stable request ID is required (at most 200 characters).");
    return this.state.serial(target, async () => {
      if (params.action === "continue") {
        const result = await this.sequencer.routing.continue({ ...params, target });
        if (result.dispatch) {
          armRoutingDeadline(this.state, result.run, (t, id) => this.recovery.cancel(t, id));
          try {
            await this.sequencer.dispatch(target, result.run.id);
          } catch (error) {
            this.state.interrupt(
              target,
              result.run.id,
              "Continuation dispatch persistence failed; no replay.",
            );
            throw error;
          }
        }
        return structuredClone(await this.state.get(target, result.run.id));
      }
      const record = await this.state.load(target);
      const defaults: GraphNativeSettings = {
        modelSelection: modelSelectionSchema.parse(params.modelSelection),
        mode: submissionModeSchema.parse(params.mode),
        planEnabled: params.planEnabled ?? false,
      };
      if (typeof defaults.planEnabled !== "boolean")
        throw new Error("Plan mode must be a boolean.");
      const checks =
        params.action === "checks" ? checksStartSchema.parse(params.checks) : undefined;
      const fingerprint = runFingerprint({
        target,
        revision: params.revision,
        ...defaults,
        ...(checks ? { checks } : {}),
        ...("preflight" in params && params.preflight ? { preflight: params.preflight } : {}),
      });
      const duplicate = record.runs.find((run) => run.requestId === params.requestId);
      if (duplicate) {
        const old =
          duplicate.version !== undefined
            ? duplicate.requestFingerprint
            : runFingerprint({
                target: duplicate.target,
                revision: duplicate.definition.revision,
                modelSelection: duplicate.modelSelection,
                mode: duplicate.mode,
                planEnabled: duplicate.planEnabled ?? false,
              });
        if (old !== fingerprint)
          throw new Error(
            "The same Run request ID was reused with different configuration or revision.",
          );
        return structuredClone(duplicate);
      }
      let run: GraphRun;
      try {
        if (record.runs.some((run) => !isConfirmedTerminal(run)))
          throw new Error(
            "This workspace has an unresolved Graph Engineering attempt. Inspect or safely release it before starting additional work.",
          );
        await assertParallelAdmission(
          this.state,
          record,
          target,
          { requestId: params.requestId, revision: params.revision, settings: defaults },
          this.parallelService.owner.live,
        );
        if (record.definition.revision !== params.revision)
          throw new Error("Graph revision changed; save and reload before running.");
        const checksPort = this.state.options.checks;
        if (checks && !checksPort)
          throw new Error("Project-check calibration is unavailable on this host.");
        const checksPreview = checks
          ? await checksPort!.capture(
              target,
              params.revision,
              checks.selection,
              checks.expectedDigest,
            )
          : undefined;
        if (
          checksPreview &&
          (checksPreview.digest !== checks!.digest ||
            (checksPreview.unknowns.length && !checks!.acknowledgedUnknowns))
        )
          throw new Error(
            "Project checks or source/environment changed, or Unknown effects were not acknowledged. Prepare and review again.",
          );
        const definition = validateDefinition(checksPreview?.definition ?? record.definition);
        const ready = validateReadiness(definition);
        if (ready.errors.length) throw new Error(ready.errors.join("\n"));
        const toolOnly =
          (definition.version ?? 0) >= 4 && !definition.nodes.some((n) => n.type === "task");
        const useTools = toolOnly && !!this.state.options.tools;
        const availability = useTools
          ? await this.state.options.tools!.available()
          : await this.state.options.native.available();
        if (!availability.available)
          throw new Error(availability.reason ?? "Native agent unavailable.");
        // 准入阶段核验原生运行时能力：失败时尚无记录、native session 或输入（零副作用）。
        await this.runtime?.require(target, useTools ? "tool" : "model");
        run = await createRunPlan(this.state.options, {
          definition,
          target,
          requestId: params.requestId,
          fingerprint,
          defaults,
          path: ready.path,
          ...(checksPreview
            ? {
                capturedRecipes: {
                  recipes: checksPreview.recipes,
                  digest: checksPreview.recipeDigest,
                },
              }
            : {}),
        });
        if (checksPreview && run.version !== undefined) {
          const { definition: _definition, ...preview } = checksPreview;
          run.purpose = {
            kind: "checks",
            preview,
            acceptedAt: run.createdAt,
            acknowledgedUnknowns: checks!.acknowledgedUnknowns,
          };
        }
        if (params.action !== "checks" && run.version === 5 && run.definition.template) {
          const preflight = this.state.options.preflight;
          if (!preflight || !params.preflight?.digest)
            throw new Error("Review the native execution preflight before starting this workflow.");
          const captured = await preflight.capture(target, run.definition, defaults);
          if (captured.digest !== params.preflight.digest)
            throw new Error(
              "Workflow references or configuration changed; prepare and review a new run.",
            );
          if (captured.unknowns.length && params.preflight.acknowledgedUnknowns !== true)
            throw new Error(
              "An explicit operational acknowledgment of Unknown destinations is required.",
            );
          run.provenance = {
            ...captured,
            operationalDecision: {
              acknowledgedUnknowns: params.preflight.acknowledgedUnknowns,
              acceptedAt: this.state.options.now(),
            },
          };
        }
      } catch (error) {
        // 只有已排除重复请求且尚未尝试落盘时才明确拒绝；写入/ACK 丢失仍必须保留原请求对账。
        if (params.action === "checks" && error instanceof Error)
          error.name = GRAPH_CHECKS_ADMISSION_REJECTED;
        throw error;
      }
      // 首次持久化成功才发布占位；失败时零 native 调用，同 request 可安全重试。
      await this.state.commit(target, { ...record, runs: [...record.runs, run] });
      this.state.liveRuns.add(run.id);
      armRoutingDeadline(this.state, run, (t, id) => this.recovery.cancel(t, id));
      try {
        await this.sequencer.dispatch(target, run.id);
      } catch (error) {
        // ACK 后落盘失败也必须立即关闭推进许可，否则已排队终态会错误启动后继。
        this.state.interrupt(
          target,
          run.id,
          "Graph dispatch metadata could not be persisted. Inspect the owned input; no successor will be submitted.",
        );
        throw error;
      }
      return structuredClone(await this.state.get(target, run.id));
    });
  }
  async cancel(params: Parameters<IGraphEngineeringService["cancel"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () => this.recovery.cancel(target, params.runId));
  }
  async recipes(params: Parameters<IGraphEngineeringService["recipes"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, async () => {
      const port = this.state.options.recipes;
      if (!port) throw new Error("Project recipes are unavailable.");
      const record = await this.state.load(target);
      if (params.action === "read") return port.read(target);
      if (record.runs.some((r) => !isConfirmedTerminal(r)))
        throw new Error("Project recipe edits are blocked while a graph is unresolved.");
      if (record.parallel?.runs.some(parallelUnresolved))
        throw new Error("Project recipes are frozen while Fork/Join is unresolved.");
      return port.save(target, params.recipes, params.expectedDigest);
    });
  }
  async artifact(params: Parameters<IGraphEngineeringService["artifact"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, async () => {
      const run = await this.state.get(target, params.runId);
      if (run.version === undefined || run.version < 4)
        throw new Error("This historical run has no Z4 artifacts.");
      return params.action === "manifest"
        ? { kind: "manifest" as const, text: this.sequencer.artifacts.manifest(run) }
        : {
            kind: "content" as const,
            ...(await this.sequencer.artifacts.read(run, params.artifactId)),
          };
    });
  }
  async decideApproval(params: Parameters<IGraphEngineeringService["decideApproval"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, async () => {
      const result = await this.approvals.decide({ ...params, target });
      try {
        if (result.dispatch) await this.sequencer.dispatch(target, params.runId);
        return structuredClone(await this.state.get(target, params.runId));
      } catch (error) {
        // 写入失败不能让排队终态继续推进；已落盘决策可按原 id 查询，但不猜测重发。
        const run = await this.state.get(target, params.runId);
        if (run.status !== "StaleEvidence")
          this.state.interrupt(
            target,
            params.runId,
            "Approval dispatch stopped. Inspect durable state before explicit continuation.",
          );
        throw error;
      }
    });
  }
  async continueApproval(params: Parameters<IGraphEngineeringService["continueApproval"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, async () => {
      const result = await this.approvals.continue({ ...params, target });
      armRoutingDeadline(this.state, result.run, (t, id) => this.recovery.cancel(t, id));
      try {
        if (result.dispatch) await this.sequencer.dispatch(target, params.runId);
      } catch (error) {
        // 二次证据核验已明确标记 stale 时保留该事实，不能用通用中断覆盖。
        if ((await this.state.get(target, params.runId)).status !== "StaleEvidence")
          this.state.interrupt(
            target,
            params.runId,
            "Continuation dispatch stopped; uncertain work will not be replayed.",
          );
        throw error;
      }
      return structuredClone(await this.state.get(target, params.runId));
    });
  }
  async inspectRecovery(params: Parameters<IGraphEngineeringService["inspectRecovery"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () => this.recovery.inspectRecovery(target, params.runId));
  }
  async releaseInterrupted(params: Parameters<IGraphEngineeringService["releaseInterrupted"]>[0]) {
    const target = localTarget(params.target);
    return this.state.serial(target, () =>
      this.recovery.release(target, params.runId, params.reason, params.confirmed),
    );
  }
  async isSessionOwned(params: GraphWorkspaceTarget & { sessionId: string }): Promise<boolean> {
    return (await this.protectedSessionIds(params)).includes(params.sessionId);
  }
  async protectedSessionIds(target: GraphWorkspaceTarget): Promise<string[]> {
    return (await parallelGuardedRuns(this.state, target)).flatMap((run) =>
      run.version !== undefined
        ? [...run.nodeAttempts, ...(run.toolAttempts ?? [])].flatMap((n) =>
            n.sessionId ? [n.sessionId] : [],
          )
        : run.sessionId
          ? [run.sessionId]
          : [],
    );
  }
  async assertInputAllowed(params: GraphInputGuardRequest): Promise<void> {
    return assertGraphInputAllowed(this.state, params);
  }
  dispose(): void {
    this.parallelService.dispose();
    this.state.dispose();
  }
  async disposeAndWait(): Promise<void> {
    this.parallelService.dispose();
    await this.state.disposeAndWait();
  }
}
