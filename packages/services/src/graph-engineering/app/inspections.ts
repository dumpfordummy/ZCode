import { inspectionSelectionSchema } from "@zcode/shared";
import type { ZCodeRecipeSnapshot } from "@zcode/shared";
import type { GraphInspection, GraphInspectionCommand } from "../inspection-types.js";
import type { InspectionOwner } from "./inspection-ports.js";
import type { GraphInputGuardRequest } from "./ports.js";
import { isConfirmedTerminal, workspaceKey } from "../domain/definition.js";
import { parallelUnresolved } from "../domain/parallel.js";

/** Separate non-evidence intents, governed by the existing GraphState serial/lease owner. */
export class GraphInspections {
  private readonly histories = new Map<string, GraphInspection[]>();
  private readonly starts = new Map<string, number>();
  private readonly dispatching = new Set<string>();
  constructor(private readonly state: InspectionOwner) {}
  private get port() {
    return this.state.options.inspection;
  }
  private time() {
    return this.state.options.monotonic?.() ?? this.state.options.now();
  }
  private mark(record: GraphInspection, phase: string) {
    const start = this.starts.get(record.id);
    if (start !== undefined && record.timings.length < 64)
      record.timings.push({ phase, elapsedMs: Math.max(0, this.time() - start) });
  }
  async history(target: GraphInspection["target"]): Promise<GraphInspection[]> {
    if (!this.port) return [];
    const key = workspaceKey(target);
    let rows = this.histories.get(key);
    if (!rows) {
      rows = await this.port.read(target);
      for (const row of rows)
        if (row.reserved) {
          row.status = "executor-lost";
          row.message =
            "Host restarted. Inspect the original operation; no command was replayed. Workspace remains reserved until native inactivity is established.";
        }
      this.histories.set(key, rows);
    }
    return rows;
  }
  async assertIdle(target: GraphInspection["target"]) {
    if ((await this.history(target)).some((row) => row.reserved))
      throw Error(
        "Project inspection owns this workspace; inspect or cancel its original operation first.",
      );
  }
  async sessions(target: GraphInspection["target"]) {
    return (await this.history(target)).flatMap((row) =>
      row.reserved && row.sessionId ? [row.sessionId] : [],
    );
  }
  async guard(input: GraphInputGuardRequest) {
    const owned = (await this.history(input)).find((row) => row.reserved);
    if (!owned) {
      if (input.request && typeof input.request === "object" && "inspection" in input.request)
        throw Error("Inspection has no live Host admission.");
      return;
    }
    const exact =
      input.sessionId === owned.sessionId &&
      input.commandType === "startRecipe" &&
      input.commandId === owned.id &&
      input.expectedRuntimeIdentity === owned.runtimeIdentity &&
      JSON.stringify(input.request) === JSON.stringify(owned.request) &&
      this.dispatching.delete(owned.id);
    if (!exact)
      throw Error(
        "Project inspection owns this workspace; only its exact live request may execute.",
      );
  }
  private async save(record: GraphInspection) {
    const rows = await this.history(record.target);
    const next = [...rows.filter((row) => row.id !== record.id), structuredClone(record)];
    while (next.length > 16) {
      const index = next.findIndex((row) => !row.reserved && row.id !== record.id);
      if (index < 0) throw Error("Inspection history limit reached.");
      this.starts.delete(next[index]!.id);
      next.splice(index, 1);
    }
    await this.port!.write(record.target, next);
    this.histories.set(workspaceKey(record.target), next);
    this.state.changed.fire({ workspaceKey: workspaceKey(record.target) });
  }
  private async terminal(
    record: GraphInspection,
    status: GraphInspection["status"],
    message: string,
  ) {
    record.status = status;
    record.message = message;
    if (status !== "succeeded") delete record.projection;
    await this.save(record);
    return structuredClone(record);
  }
  private async observe(record: GraphInspection, result: ZCodeRecipeSnapshot) {
    if (
      result.operationId !== record.id ||
      result.sessionId !== record.sessionId ||
      (result.status !== "unknown" && result.requestDigest !== record.requestDigest)
    )
      throw Error("Inspection operation identity mismatch.");
    if (result.status === "unknown")
      return this.terminal(
        record,
        "executor-lost",
        "Original native operation is unavailable; no retry or replay. Workspace remains reserved.",
      );
    if (result.completedAt !== undefined) {
      this.mark(record, "process-exit-observed");
      if (result.processStarted && !result.result?.processExitObserved)
        return this.terminal(
          record,
          "executor-lost",
          "Native process exit is unproved; workspace remains reserved.",
        );
      record.reserved = false;
      const outcome = result.inspectionOutcome ?? "failed";
      if (
        outcome === "succeeded" &&
        result.inspectionProjection &&
        result.processStarted &&
        result.result?.processExitObserved &&
        result.result.exitCode === 0
      ) {
        const fresh = await this.port!.fresh(record);
        if (fresh !== "current")
          return this.terminal(
            record,
            fresh,
            "Inspection provenance changed. Review a new request.",
          );
        record.projection = result.inspectionProjection;
        return this.terminal(
          record,
          "succeeded",
          "Configuration observed. Inspection alone is not a complete source scope; prepare the supported profile before Save. No Build or Test ran.",
        );
      }
      return this.terminal(
        record,
        outcome === "succeeded" ? "invalid-output" : outcome,
        "Inspection ended without a current valid configuration observation.",
      );
    }
    const status = result.inspectionVerifying
      ? "verifying-sources"
      : result.processStarted
        ? "running"
        : "awaiting-permission";
    if (record.status !== status)
      this.mark(
        record,
        status === "running" ? "process-start-observed" : "native-permission-pending",
      );
    record.status = status;
    record.message = result.inspectionVerifying
      ? "Native owner is verifying sources; no permission response is currently needed."
      : result.processStarted
        ? "Installed MSBuild is evaluating the reviewed project."
        : "Respond to the ordinary native permission request in the owned conversation.";
    await this.save(record);
    return structuredClone(record);
  }
  async command(command: GraphInspectionCommand): Promise<GraphInspection> {
    const target = command.target;
    const graph = await this.state.load(target); // acquires the existing Host lease
    if (!this.port) throw Error("Project inspection is unavailable on this Host.");
    if (command.action === "review") {
      await this.assertIdle(target);
      if (
        graph.runs.some((run) => !isConfirmedTerminal(run)) ||
        graph.parallel?.runs.some(parallelUnresolved)
      )
        throw Error("Active or unresolved Graph work blocks inspection.");
      const row: GraphInspection = {
        version: 1,
        kind: "project-inspection",
        id: this.state.options.id(),
        target,
        selection: inspectionSelectionSchema.parse(command.selection),
        status: "verifying-sources",
        reserved: false,
        scopeComplete: false,
        message: "Preparing the exact installed-engine review; no evaluation is running.",
        timings: [],
      };
      this.starts.set(row.id, this.time());
      this.mark(row, "review-requested");
      try {
        Object.assign(row, await this.port.review(row));
        if (!row.request?.inspection || row.request.operationId !== row.id)
          throw Error("Invalid native inspection review.");
        row.requestDigest = this.state.options.evidence!.digest(JSON.stringify(row.request));
        this.mark(row, "source-observation-complete");
        return this.terminal(
          row,
          "review-ready",
          "Review the exact command and scope. Evaluation can cause side effects. Confirmation still requires ordinary native permission.",
        );
      } catch {
        return this.terminal(
          row,
          "unavailable",
          "Installed-engine inspection is unavailable: verify the selected SDK, native capability, bounded source observation and runtime. Nothing was evaluated.",
        );
      }
    }
    const found = (await this.history(target)).find((row) => row.id === command.id);
    if (!found) throw Error("Inspection request is unavailable; no replay is permitted.");
    const row = structuredClone(found);
    if (command.action === "cancel") {
      this.mark(row, "user-cancel");
      if (!row.reserved)
        return this.terminal(row, "cancelled", "Inspection cancelled; no evaluation was started.");
      try {
        return await this.observe(row, await this.port.cancel(row));
      } catch {
        return this.terminal(
          row,
          "executor-lost",
          "Cancellation could not confirm original process exit; workspace remains reserved.",
        );
      }
    }
    if (command.action === "status") {
      if (row.reserved) {
        try {
          return await this.observe(row, await this.port.inspect(row));
        } catch {
          return this.terminal(
            row,
            "executor-lost",
            "Executor connection was lost; no retry or replay. Workspace remains reserved.",
          );
        }
      }
      if (["review-ready", "succeeded"].includes(row.status)) {
        if (this.state.options.now() >= (row.request?.inspection?.expiresAt ?? 0))
          return this.terminal(
            row,
            "expired",
            "Inspection review expired. Review again explicitly.",
          );
        try {
          const current = await this.port.fresh(row);
          if (current !== "current")
            return this.terminal(
              row,
              current,
              "Inspection provenance changed. Review again explicitly.",
            );
        } catch {
          return this.terminal(
            row,
            "executor-lost",
            "Original runtime is unavailable; no automatic resumption.",
          );
        }
      }
      return row;
    }
    if (
      row.status !== "review-ready" ||
      command.requestDigest !== row.requestDigest ||
      JSON.stringify(inspectionSelectionSchema.parse(command.selection)) !==
        JSON.stringify(row.selection)
    )
      throw Error("Inspection review identity or selection changed; review again.");
    if (this.state.options.now() >= row.request!.inspection!.expiresAt)
      return this.terminal(row, "expired", "Inspection review expired.");
    await this.assertIdle(target);
    if (
      graph.runs.some((run) => !isConfirmedTerminal(run)) ||
      graph.parallel?.runs.some(parallelUnresolved)
    )
      throw Error("Active Graph work blocks inspection admission.");
    this.mark(row, "user-confirmation");
    const fresh = await this.port.fresh(row);
    if (fresh !== "current")
      return this.terminal(row, fresh, "Inspection provenance changed before admission.");
    row.reserved = true;
    row.status = "verifying-sources";
    row.message =
      "Host is verifying reviewed sources before native permission; no permission request exists yet.";
    await this.save(row);
    this.mark(row, "host-admission-persisted");
    this.dispatching.add(row.id);
    try {
      return await this.observe(row, await this.port.start(row));
    } catch {
      return this.terminal(
        row,
        "executor-lost",
        "Native admission reply was lost; inspect the original operation. No replay.",
      );
    } finally {
      this.dispatching.delete(row.id);
    }
  }
}
