import assert from "node:assert/strict";

import { GraphEngineeringService } from "./service.js";
import type { GraphNativeFact, GraphNativePort, GraphRecord, GraphRepository } from "./ports.js";
import type {
  GraphLegacyRun as GraphRun,
  GraphLegacyDefinition,
  GraphWorkspaceView,
} from "../contract.js";
import type { GraphNativeExecution } from "./ports.js";

type LegacyService = Omit<GraphEngineeringService, "getWorkspace" | "run" | "saveDefinition"> & {
  getWorkspace(target: Parameters<GraphEngineeringService["getWorkspace"]>[0]): Promise<
    Omit<GraphWorkspaceView, "definition" | "runs"> & {
      definition: GraphLegacyDefinition;
      runs: GraphRun[];
    }
  >;
  run(params: Parameters<GraphEngineeringService["run"]>[0]): Promise<GraphRun>;
  saveDefinition(
    params: Parameters<GraphEngineeringService["saveDefinition"]>[0],
  ): Promise<GraphLegacyDefinition>;
};

export const target = { workspacePath: "C:/synthetic/z1" };
export const selection = { providerId: "fixture", modelId: "controlled" };
export function fixture(initial?: GraphRecord) {
  let saved = initial ? structuredClone(initial) : null;
  let sequence = 0;
  let creates = 0;
  let sends = 0;
  let cancelled: GraphNativeExecution | undefined;
  let lastFact: GraphNativeFact | undefined;
  let listener: ((fact: GraphNativeFact) => void) | undefined;
  const repository: GraphRepository = {
    async read() {
      return saved ? structuredClone(saved) : null;
    },
    async write(_target, record) {
      saved = structuredClone(record);
    },
  };
  const native: GraphNativePort = {
    async available() {
      return { available: true };
    },
    async validateSelection() {},
    async create(run) {
      creates++;
      assert.ok(
        saved?.runs.some((item) => item.version === undefined && item.attemptId === run.attemptId),
      );
      assert.equal(run.sessionId, undefined);
      assert.equal(
        (
          saved!.runs.find(
            (item) => item.version === undefined && item.attemptId === run.attemptId,
          )! as GraphRun
        ).sessionId,
        undefined,
      );
      return { sessionId: `native-session-${creates}`, runtimeIdentity: "runtime-1" };
    },
    async observe(_run, callback) {
      assert.ok(_run.sessionId);
      assert.equal(
        (
          saved!.runs.find(
            (item) => item.version === undefined && item.attemptId === _run.attemptId,
          )! as GraphRun
        ).sessionId,
        _run.sessionId,
      );
      listener = callback;
      return { dispose() {} };
    },
    async send() {
      sends++;
      return { accepted: true };
    },
    async cancel(run) {
      cancelled = run;
    },
    async reconcile() {
      return initial ? "interrupted" : "same-runtime";
    },
    async inspect() {
      return lastFact?.state === "running" && lastFact.foregroundExecutionId
        ? { kind: "active", fact: lastFact }
        : { kind: "unknown", reason: "No exact execution" };
    },
  };
  const service = new GraphEngineeringService({
    repository,
    native,
    id: () => `id-${++sequence}`,
    now: () => sequence + 100,
  }) as LegacyService;
  const prepare = async () => {
    const view = await service.getWorkspace(target);
    return service.saveDefinition({
      target,
      expectedRevision: view.definition.revision,
      definition: { ...view.definition, instructions: "Inspect fixture and run its test" },
    });
  };
  const run = async (requestId = "request-1") =>
    service.run({ target, requestId, revision: 1, modelSelection: selection, mode: "build" });
  return {
    service,
    prepare,
    run,
    native,
    repository,
    emit: (fact: GraphNativeFact) => {
      lastFact = fact;
      listener?.(fact);
    },
    saved: () => saved! as GraphRecord & { definition: GraphLegacyDefinition; runs: GraphRun[] },
    counts: () => ({ creates, sends }),
    cancelled: () => cancelled,
  };
}
