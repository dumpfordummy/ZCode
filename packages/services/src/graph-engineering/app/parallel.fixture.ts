import { createHash } from "node:crypto";
import type { GraphRecipe, GraphSequentialRun } from "../contract.js";
import type { GraphNativeExecution, GraphNativeFact, GraphRecord } from "./ports.js";
import type { GraphParallelPlan, GraphParallelInventory } from "../parallel-contract.js";
import { unknownExecutionEnvironment } from "@zcode/shared";
import { routingFixture } from "./routing.fixture.js";
import { GraphEngineeringService } from "./service.js";
import { recordSchema } from "../domain/record.js";
import { parallelPlanSchema } from "../domain/parallel-schema.js";
import { target, selection } from "./sequential.fixture.js";
export { target };
export const settings = { modelSelection: selection, mode: "build" as const, planEnabled: false };
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const plan: GraphParallelPlan = {
  version: 1,
  revision: 0,
  enabled: true,
  name: "Fixture fork",
  request: "Synthetic task",
  sharedContract: "Independent files only",
  resultRequirements: "Combined independent tests and final review",
  concurrency: 2,
  deadlineMs: 60000,
  admissionBudget: 5,
  branches: ["a", "b"].map((id) => ({
    id,
    name: id,
    selected: true,
    instructions: `Edit ${id}.cs`,
    files: [`${id}.cs`],
    additions: [],
  })),
  buildRecipeId: "build",
  testRecipeId: "test",
};
export const recipes: GraphRecipe[] = [
  {
    id: "build",
    name: "build",
    executable: "fixture",
    args: [],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["a.cs"],
    expectedOutputs: ["bin/a"],
    verifier: { kind: "build" },
  },
  {
    id: "test",
    name: "test",
    executable: "fixture",
    args: [],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["a.cs"],
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      minimumTests: 1,
      reportPath: "test.json",
      requiredTests: ["fixture"],
      buildNodeId: "build",
    },
  },
];
export function parallelFixture() {
  const f = routingFixture(),
    records = new Map<string, GraphRecord>();
  const listeners = new Map<string, (fact: GraphNativeFact) => void>();
  let seq = 0,
    drift = false,
    invalidSlot: string | undefined,
    retired = false;
  const inventory: GraphParallelInventory = {
    environment: { ...unknownExecutionEnvironment("fixture"), status: "available" },
    providerId: selection.providerId,
    modelId: selection.modelId,
    destination: "http://127.0.0.1",
    modelDigest: hash("model"),
    digest: hash("inventory"),
    unknowns: [],
  };
  const base = {
    workspacePath: target.workspacePath,
    head: "a".repeat(40),
    digest: hash("base"),
    trackedPaths: ["a.cs", "b.cs"],
  };
  f.options.repository = {
    read: async (t) => structuredClone(records.get(t.workspacePath) ?? null),
    write: async (t, r) => {
      recordSchema.parse({ ...r, version: 5, workspaceKey: t.workspacePath });
      records.set(t.workspacePath, structuredClone(r));
    },
  };
  f.options.native.observe = async (input, listener) => {
    listeners.set(input.attemptId, listener);
    return {
      dispose() {
        listeners.delete(input.attemptId);
      },
    };
  };
  f.options.native.inspect = async (input) =>
    retired
      ? {
          kind: "inactive",
          proof: {
            kind: "runtime-retired",
            runtimeIdentity: input.runtimeIdentity!,
            workspaceKey: input.target.workspacePath,
            retiredAt: Date.now(),
          },
        }
      : {
          kind: "active",
          fact: {
            sourceCommandId: input.commandId,
            state: "running",
            foregroundExecutionId: `foreground-${input.attemptId}`,
            seq: ++seq,
            logEpoch: "parallel-fixture",
          },
        };
  const originalPut = f.options.artifacts!.put;
  f.options.artifacts!.put = async (input) => {
    const artifact = await originalPut(input);
    artifact.workspaceKey = input.target.workspaceIdentity?.trim() || input.target.workspacePath;
    f.artifacts.set(artifact.id, { artifact, content: input.content });
    return artifact;
  };
  f.options.recipes!.read = async () => ({
    recipes,
    digest: hash(recipes),
    sourcePath: ".zcode/config.json",
  });
  f.options.parallel = {
    preview: async (t, p) => {
      parallelPlanSchema.parse(p);
      if (!p.enabled) throw new Error("Disabled");
      return {
        base: { ...base, workspacePath: t.workspacePath },
        inventory,
        recipes,
        digest: hash(p),
      };
    },
    prepare: async (preview, ownerId, slot, token) => ({
      ownerId,
      slot,
      token,
      workspacePath: `/owned/${ownerId}/${slot}`,
      base: preview.base,
      configDigest: hash("git"),
    }),
    initialize: async () => inventory,
    inventory: async () => inventory,
    verifyBase: async () => {
      if (drift) throw new Error("Original base changed");
    },
    validate: async (w) => {
      if (w.slot === invalidSlot) throw new Error("Owned directory replaced");
    },
    capture: async (c) => ({
      branchId: c.id,
      digest: hash(c.id),
      sourceDigest: hash(c.id),
      files: [{ path: `${c.id}.cs`, before: "base", after: c.id, kind: "edit" }],
    }),
    cleanup: async (w) => ({ ...w, cleaned: true }),
  };
  const service = f.service,
    parallel = service.parallelService;
  const current = async () => (await parallel.get(target)).runs.at(-1)!;
  async function flush() {
    for (let i = 0; i < 10; i++) {
      for (const child of records.keys()) await service.getWorkspace({ workspacePath: child });
      await parallel.get(target);
    }
  }
  async function emit(
    input: GraphNativeExecution,
    state: GraphNativeFact["state"],
    waiting?: GraphNativeFact["waiting"],
  ) {
    listeners.get(input.attemptId)?.({
      sourceCommandId: input.commandId,
      state,
      waiting,
      foregroundExecutionId: `foreground-${input.attemptId}`,
      seq: ++seq,
      logEpoch: "parallel-fixture",
      turnId: `turn-${input.attemptId}`,
      ...(state === "completedSuccess"
        ? {
            finalOutput: {
              text: "Actual fixture output",
              rowId: 1,
              turnId: `turn-${input.attemptId}`,
            },
          }
        : {}),
    });
    await flush();
  }
  return {
    ...f,
    records,
    parallel,
    current,
    flush,
    emit,
    changeBase: () => {
      drift = true;
    },
    invalidate: (slot: string) => {
      invalidSlot = slot;
    },
    retire: () => {
      retired = true;
    },
    async prepare(overrides: Partial<GraphParallelPlan> = {}) {
      const saved = await parallel.save({
        target,
        plan: { ...plan, ...overrides },
        expectedRevision: 0,
      });
      const preview = await parallel.preview({ target, revision: saved.revision, settings });
      return parallel.prepare({
        target,
        revision: saved.revision,
        settings,
        requestId: "prepare-fixture",
        previewDigest: preview.digest,
        acknowledgedUnknowns: true,
      });
    },
    async approve() {
      const r = await current();
      return parallel.decide({
        target,
        runId: r.id,
        phase: "plan",
        decisionId: "plan-review",
        digest: r.preparedDigest!,
        approved: true,
        acknowledgedUnknowns: true,
        comment: "Reviewed exact fixture",
      });
    },
    child: (id: string) =>
      ([...records.values()].flatMap((r) => r.runs) as GraphSequentialRun[]).find((r) =>
        r.definition.nodes.some((n) => n.id === id),
      ),
    async restart() {
      await service.disposeAndWait();
      return new GraphEngineeringService(f.options);
    },
  };
}
