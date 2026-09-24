import assert from "node:assert/strict";
import type { GraphSequentialDefinition, GraphSequentialRun } from "../contract.js";
import { recordSchema } from "../domain/record.js";
import type {
  GraphNativeExecution,
  GraphNativeFact,
  GraphNativeInspection,
  GraphNativePort,
  GraphRecord,
  GraphRepository,
  GraphEvidencePort,
} from "./ports.js";
import { GraphEngineeringService } from "./service.js";

export const target = { workspacePath: "C:/synthetic/z2" };
export const selection = { providerId: "fixture", modelId: "native" };
export function sequenceDefinition(): GraphSequentialDefinition {
  const task = (
    id: string,
    instructions: string,
    inputs: Array<{ alias: string; source: { kind: "start" } | { kind: "node"; nodeId: string } }>,
  ) => ({
    id,
    type: "task" as const,
    position: { x: 0, y: 0 },
    name: id,
    instructionMode: "bound" as const,
    instructions,
    inputs,
    configuration: { kind: "inherit" as const },
  });
  return {
    version: 2,
    revision: 0,
    name: "Synthetic",
    nodes: [
      { id: "end", type: "end", position: { x: 0, y: 0 }, outputNodeId: "verify" },
      task("verify", "Verify {{inputs.result}}", [
        { alias: "result", source: { kind: "node", nodeId: "implement" } },
      ]),
      { id: "start", type: "start", position: { x: 0, y: 0 }, request: "Request" },
      task("analyze", "Analyze {{inputs.request}}", [
        { alias: "request", source: { kind: "start" } },
      ]),
      task("implement", "Implement {{inputs.analysis}}", [
        { alias: "analysis", source: { kind: "node", nodeId: "analyze" } },
      ]),
    ],
    edges: [
      { source: "verify", target: "end" },
      { source: "implement", target: "verify" },
      { source: "start", target: "analyze" },
      { source: "analyze", target: "implement" },
    ],
  };
}
export function sequentialServiceFixture(initial?: GraphRecord, evidence?: GraphEvidencePort) {
  let saved = initial ? structuredClone(initial) : null;
  let id = initial ? 1000 : 0;
  let clock = 100;
  const creates: GraphNativeExecution[] = [];
  const sends: GraphNativeExecution[] = [];
  const cancellations: GraphNativeExecution[] = [];
  const listeners = new Map<string, (fact: GraphNativeFact) => void>();
  const lost = new Map<string, (reason: string) => void>();
  const facts = new Map<string, GraphNativeFact>();
  let inspection: GraphNativeInspection | undefined;
  const repository: GraphRepository = {
    async read() {
      return saved ? structuredClone(saved) : null;
    },
    async write(_target, record) {
      recordSchema.parse({
        version: record.definition.version === 3 ? 3 : 2,
        workspaceKey: target.workspacePath,
        ...record,
      });
      saved = structuredClone(record);
    },
  };
  const native: GraphNativePort = {
    async available() {
      return { available: true };
    },
    async validateSelection() {},
    async create(execution) {
      const stored = (
        saved!.runs.find((r) => r.id === saved!.runs.at(-1)!.id) as GraphSequentialRun
      ).nodeAttempts.find((a) => a.attemptId === execution.attemptId)!;
      assert.equal(stored.dispatchPhase, "creating");
      assert.equal(stored.resolvedInstructions, execution.instructions);
      creates.push(structuredClone(execution));
      const restoredSessions =
        initial?.runs
          .flatMap<{ sessionId?: string }>((r) => (r.version === undefined ? [r] : r.nodeAttempts))
          .filter((a) => a.sessionId).length ?? 0;
      return {
        sessionId: `native-${creates.length + restoredSessions}`,
        runtimeIdentity: "runtime-original",
      };
    },
    async observe(execution, callback, onLost) {
      listeners.set(execution.attemptId, callback);
      lost.set(execution.attemptId, onLost);
      return { dispose() {} };
    },
    async send(execution) {
      const node = (saved!.runs.at(-1) as GraphSequentialRun).nodeAttempts.find(
        (a) => a.attemptId === execution.attemptId,
      )!;
      assert.equal(node.dispatchPhase, "sending");
      sends.push(structuredClone(execution));
      return { accepted: true };
    },
    async cancel(execution) {
      cancellations.push(structuredClone(execution));
    },
    async reconcile() {
      return "same-runtime";
    },
    async inspect(execution) {
      if (inspection) return inspection;
      const fact = facts.get(execution.attemptId);
      if (fact?.state === "running" && fact.foregroundExecutionId) return { kind: "active", fact };
      if (fact && fact.state !== "running")
        return {
          kind: "inactive",
          fact,
          proof: {
            kind: "input-terminal",
            sessionId: execution.sessionId!,
            runtimeIdentity: execution.runtimeIdentity!,
            inputId: execution.inputId,
            commandId: execution.commandId,
            terminalProof: {
              sourceCommandId: fact.sourceCommandId,
              state: fact.state,
              logEpoch: fact.logEpoch,
              seq: fact.seq,
              turnId: fact.turnId,
            },
          },
        };
      return { kind: "unknown", reason: "Original execution unavailable" };
    },
  };
  const service = new GraphEngineeringService({
    repository,
    native,
    evidence,
    id: () => `id-${++id}`,
    now: () => ++clock,
  });
  const view = async () => service.getWorkspace(target);
  const current = async () => (await view()).runs.at(-1) as GraphSequentialRun;
  const emit = (
    index: number,
    state: GraphNativeFact["state"],
    text?: string,
    extra: Partial<GraphNativeFact> = {},
  ) => {
    const run = saved!.runs.at(-1) as GraphSequentialRun;
    const node = run.nodeAttempts[index]!;
    const fact: GraphNativeFact = {
      sourceCommandId: node.commandId,
      state,
      logEpoch: `epoch-${index}`,
      seq: ++clock,
      turnId: `turn-${index}`,
      ...(text === undefined ? {} : { finalOutput: { text, turnId: `turn-${index}`, rowId: 4 } }),
      ...extra,
    };
    facts.set(node.attemptId, fact);
    listeners.get(node.attemptId)?.(fact);
    return fact;
  };
  return {
    service,
    repository,
    native,
    creates,
    sends,
    cancellations,
    view,
    current,
    emit,
    saved: () => saved!,
    setInspection: (value: GraphNativeInspection | undefined) => {
      inspection = value;
    },
    lose: (index: number) => {
      const run = saved!.runs.at(-1) as GraphSequentialRun;
      lost.get(run.nodeAttempts[index]!.attemptId)?.("Synthetic observation lost");
    },
    prepare: async (definition = sequenceDefinition()) => {
      const v = await view();
      return service.saveDefinition({
        target,
        definition,
        expectedRevision: v.definition.revision,
      });
    },
    run: (requestId = "request") =>
      service.run({
        target,
        requestId,
        revision: 1,
        modelSelection: selection,
        mode: "build",
        planEnabled: false,
      }),
    settle: async () => {
      await view();
      await view();
    },
  };
}
