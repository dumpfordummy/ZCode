import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type {
  GraphSequentialDefinition,
  GraphSequentialRun,
  GraphRecipe,
  GraphToolOperation,
} from "../contract.js";
import type { GraphNativeFact, GraphNativeExecution, GraphRecord } from "../app/ports.js";
import { createGraphArtifactStore } from "../adapters/artifacts.js";
import { recordSchema } from "../domain/record.js";
import { GraphEngineeringService } from "../app/service.js";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const selection = { providerId: "fixture", modelId: "test-only" };
export const position = { x: 0, y: 0 };
export function toolDefinition(): GraphSequentialDefinition {
  return {
    version: 4,
    revision: 0,
    name: "Tools",
    nodes: [
      { id: "start", type: "start", request: "synthetic", position },
      { id: "one", type: "tool", name: "Command one", recipeId: "command", position },
      { id: "two", type: "tool", name: "Command two", recipeId: "command", position },
      { id: "end", type: "end", outputNodeId: "two", position },
    ],
    edges: [
      { source: "start", target: "one" },
      { source: "one", target: "two" },
      { source: "two", target: "end" },
    ],
  };
}
export const commandRecipe: GraphRecipe = {
  id: "command",
  name: "Fixture command",
  executable: "fixture.exe",
  args: ["{operationId}"],
  cwd: ".",
  timeoutMs: 1000,
  sourcePaths: [],
  expectedOutputs: [],
  verifier: { kind: "command" },
};
export async function evidenceFixture(
  t: TestContext,
  definition = toolDefinition(),
  initial?: GraphRecord,
) {
  const root = await mkdtemp(join(tmpdir(), "zcode-z4-owner-"));
  const target = { workspacePath: root };
  let saved: GraphRecord = initial ?? { definition, runs: [] },
    sequence = 0;
  const facts = new Map<string, (fact: GraphNativeFact) => void>();
  const sends: GraphNativeExecution[] = [],
    starts: string[] = [],
    cancels: string[] = [],
    operations = new Map<string, GraphToolOperation>();
  const fault = { write: false, start: false, finishWrite: false, source: hash("source") };
  const options = {
    repository: {
      async read() {
        return structuredClone(saved);
      },
      async write(_target: unknown, record: GraphRecord) {
        if (
          fault.write ||
          (fault.finishWrite &&
            record.runs.some(
              (r) => r.version === 4 && r.toolAttempts?.some((a) => a.status === "Completed"),
            ))
        )
          throw new Error("Synthetic disk write failure");
        recordSchema.parse({ version: 4, workspaceKey: root, ...record });
        saved = structuredClone(record);
      },
    },
    evidence: {
      digest: hash,
      async captureSource() {
        return { baseline: "fixture", scope: "none", files: [], complete: true, issues: [] };
      },
    },
    artifacts: createGraphArtifactStore(join(root, "data")),
    recipes: {
      async read() {
        return {
          recipes: [structuredClone(commandRecipe)],
          digest: hash("recipes"),
          sourcePath: ".zcode/config.json" as const,
        };
      },
      async save() {
        throw new Error("unused");
      },
      async fingerprint() {
        return { digest: fault.source, files: [] };
      },
      async validatePaths() {},
      async observeFiles() {
        return [];
      },
    },
    native: {
      async available() {
        return { available: true };
      },
      async validateSelection() {},
      async create() {
        return { sessionId: `agent-session-${++sequence}`, runtimeIdentity: "runtime" };
      },
      async observe(execution: GraphNativeExecution, callback: (fact: GraphNativeFact) => void) {
        facts.set(execution.attemptId, callback);
        return {
          dispose() {
            facts.delete(execution.attemptId);
          },
        };
      },
      async send(execution: GraphNativeExecution) {
        sends.push(execution);
        return { accepted: true };
      },
      async cancel() {
        throw new Error("Must not cancel an agent for a Tool.");
      },
      async reconcile() {
        return "same-runtime" as const;
      },
      async inspect() {
        return { kind: "unknown" as const, reason: "fixture" };
      },
    },
    tools: {
      async available() {
        return { available: true };
      },
      async create() {
        return { sessionId: `tool-session-${++sequence}`, runtimeIdentity: "runtime" };
      },
      async start(_target: unknown, attempt: import("../contract.js").GraphToolAttempt) {
        const stored = (saved.runs.at(-1) as GraphSequentialRun).toolAttempts!.find(
          (a) => a.operationId === attempt.operationId,
        )!;
        if (stored.dispatchPhase !== "sending")
          throw new Error("Intent was not persisted before native effect");
        starts.push(attempt.operationId);
        const op: GraphToolOperation = {
          operationId: attempt.operationId,
          sessionId: attempt.sessionId!,
          requestDigest: hash(attempt.operationId),
          recipeId: attempt.recipe.id,
          cwd: root,
          status: "awaiting_permission",
          processStarted: false,
        };
        operations.set(op.operationId, op);
        if (fault.start) throw new Error("Lost native start acknowledgement");
        return structuredClone(op);
      },
      async inspect(_target: unknown, attempt: import("../contract.js").GraphToolAttempt) {
        return structuredClone(operations.get(attempt.operationId)!);
      },
      async cancel(_target: unknown, attempt: import("../contract.js").GraphToolAttempt) {
        cancels.push(attempt.operationId);
        const op = operations.get(attempt.operationId)!;
        Object.assign(op, { status: "cancelled", completedAt: ++sequence });
        return structuredClone(op);
      },
    },
    id: () => `fixture-${++sequence}`,
    now: () => ++sequence,
  };
  const service = new GraphEngineeringService(options);
  t.after(async () => {
    await service.disposeAndWait();
    await rm(root, { recursive: true, force: true });
  });
  const current = async () =>
    (await service.getWorkspace(target)).runs.at(-1) as GraphSequentialRun;
  const run = () =>
    service.run({
      target,
      requestId: "request-one",
      revision: definition.revision,
      modelSelection: selection,
      mode: "edit",
      planEnabled: false,
    });
  const finishTool = (index = 0, exitCode = 0) => {
    const id = starts[index]!;
    const op = operations.get(id)!;
    Object.assign(op, {
      status: exitCode ? "failed" : "completed",
      processStarted: true,
      startedAt: ++sequence,
      completedAt: ++sequence,
      result: {
        status: exitCode ? "failed" : "completed",
        exitCode,
        processExitObserved: true,
        stdout: { text: "actual fixture observation", bytes: 26, truncated: false },
        stderr: { text: "", bytes: 0, truncated: false },
        durationMs: 1,
        timedOut: false,
        cancelled: false,
      },
    });
  };
  const finishAgent = (text: string) => {
    const sent = sends.at(-1)!;
    facts.get(sent.attemptId)!({
      sourceCommandId: sent.commandId,
      state: "completedSuccess",
      logEpoch: "epoch",
      seq: ++sequence,
      turnId: `turn-${sent.attemptId}`,
      finalOutput: { text, turnId: `turn-${sent.attemptId}`, rowId: 1 },
    });
  };
  const wait = async (predicate: (run: GraphSequentialRun) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const value = await current();
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected fixture state was not observed: " + JSON.stringify(await current()));
  };
  return {
    service,
    target,
    options,
    saved: () => structuredClone(saved),
    current,
    run,
    finishTool,
    finishAgent,
    wait,
    sends,
    starts,
    cancels,
    operations,
    fault,
  };
}
