import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";

import { fingerprintDeclaredFiles, observeDeclaredFiles } from "./artifact-files.js";
import { createGraphArtifactStore } from "./artifacts.js";
import { GraphEngineeringService } from "../app/service.js";
import { runFingerprint } from "../app/attempts.js";
import { recordSchema } from "../domain/record.js";
import type {
  GraphSequentialDefinition,
  GraphSequentialRun,
  GraphToolOperation,
  GraphToolAttempt,
} from "../contract.js";
import type { GraphNativeFact, GraphNativeExecution, GraphRecord } from "../app/ports.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";
import type { GraphWorkspaceTarget } from "../contract.js";

import { sha256, nodeRecipes } from "./reviewer-reproduction-data.fixture.js";

export interface ReproductionFixture {
  service: GraphEngineeringService;
  target: GraphWorkspaceTarget;
  /** All native execution instructions captured, keyed by node prefix. */
  capturedInstructions: Map<string, string>;
  /** Wait for a run state predicate. */
  wait(predicate: (run: GraphSequentialRun) => boolean): Promise<GraphSequentialRun>;
  /** Current run. */
  current(): Promise<GraphSequentialRun>;
  /** Saved record (for inspection). */
  saved(): GraphRecord;
  dispose(): Promise<void>;
}

export async function buildReproductionFixture(
  t: TestContext,
  definition: GraphSequentialDefinition,
  root: string,
  provider: {
    /** Mutable holder — update .text before the reviewer runs to change output. */
    reviewerOutput: { text: string };
    /** Whether the implement node edits zz-demo.txt to "after". */
    modifyFile: boolean;
  },
): Promise<ReproductionFixture> {
  const target = { workspacePath: root };
  const recipes = nodeRecipes();
  let saved: GraphRecord = { definition, runs: [] };
  let sequence = 0;
  const facts = new Map<string, (fact: GraphNativeFact) => void>();
  const sends: GraphNativeExecution[] = [];
  const capturedInstructions = new Map<string, string>();
  const operations = new Map<string, GraphToolOperation>();

  // Preflight stub — returns a minimal valid provenance whose digest matches
  // what the caller passes in params.preflight.digest.
  const preflightDigest = sha256("repro-preflight-" + definition.revision);
  const preflight = {
    async capture(
      _target: GraphWorkspaceTarget,
      def: GraphSequentialDefinition,
      _settings: unknown,
    ): Promise<GraphRunProvenance> {
      const template = def.template!;
      const provenance: GraphRunProvenance = {
        digest: preflightDigest,
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
          digest: template.digest,
          parameters: template.parameters,
          bindings: template.bindings,
          references: template.references,
          excluded: template.excluded,
        },
        environment: {
          version: 1 as const,
          status: "available" as const,
          configDigest: sha256("env"),
          executables: [],
          instructions: [],
          skills: [],
          plugins: [],
          hooks: [],
          mcp: [],
          unknowns: [],
        },
        models: def.nodes
          .filter((n) => n.type === "task")
          .map((n) => ({
            nodeId: n.id,
            providerId: "fixture",
            modelId: "test-only",
            type: "Unknown",
            destination: "Unknown",
            configurationDigest: sha256("model-" + n.id),
          })),
        auxiliary: [],
        references: [],
        recipes: recipes.map((r) => ({
          nodeId: r.id,
          id: r.id,
          digest: sha256(runFingerprint(r)),
          command: JSON.stringify([r.executable, ...r.args]),
          cwd: r.cwd,
        })),
        permissions: def.nodes
          .filter((n) => n.type === "task")
          .map((n) => ({ nodeId: n.id, mode: "edit", planEnabled: false })),
        unknowns: [],
      };
      return provenance;
    },
  };

  const options = {
    repository: {
      async read() {
        return structuredClone(saved);
      },
      async write(_target: unknown, record: GraphRecord) {
        recordSchema.parse({ version: 5, workspaceKey: root, ...record });
        saved = structuredClone(record);
      },
    },
    evidence: {
      digest: sha256,
      async captureSource() {
        return {
          baseline: sha256("source"),
          scope: "none" as const,
          files: [],
          complete: true,
          issues: [],
        };
      },
    },
    artifacts: createGraphArtifactStore(join(root, "data")),
    recipes: {
      async read() {
        return {
          recipes: recipes.map((r) => structuredClone(r)),
          digest: sha256("repro-recipes"),
          sourcePath: ".zcode/config.json" as const,
        };
      },
      async save() {
        throw new Error("unused");
      },
      fingerprint: fingerprintDeclaredFiles,
      observeFiles: observeDeclaredFiles,
      async validatePaths() {},
    },
    native: {
      async available() {
        return { available: true };
      },
      async validateSelection() {},
      async create() {
        return {
          sessionId: `agent-session-${++sequence}`,
          runtimeIdentity: "controlled-provider",
        };
      },
      async observe(
        execution: GraphNativeExecution,
        callback: (fact: GraphNativeFact) => void,
        _lost: (reason: string) => void,
      ) {
        facts.set(execution.attemptId, callback);
        return {
          dispose() {
            facts.delete(execution.attemptId);
          },
        };
      },
      async send(execution: GraphNativeExecution) {
        sends.push(execution);
        // Controlled provider: detect node by instruction prefix, emit canned
        // fact asynchronously so the serial lock is released first.
        const { attemptId, commandId, instructions } = execution;
        const emit = (text: string) => {
          const cb = facts.get(attemptId);
          if (!cb) return;
          cb({
            sourceCommandId: commandId,
            state: "completedSuccess",
            logEpoch: "epoch",
            seq: ++sequence,
            turnId: `turn-${attemptId}`,
            finalOutput: { text, turnId: `turn-${attemptId}`, rowId: 1 },
          });
        };
        if (instructions.startsWith("Workflow task: analyze.")) {
          capturedInstructions.set("analyze", instructions);
          setTimeout(
            () =>
              emit(
                "Analysis: The request asks to modify zz-demo.txt so its content becomes 'after'. " +
                  "The file currently contains 'before'. No additional acceptance criteria are stated.",
              ),
            0,
          );
        } else if (instructions.startsWith("Workflow task: implement.")) {
          capturedInstructions.set("implement", instructions);
          setTimeout(async () => {
            if (provider.modifyFile) await writeFile(join(root, "zz-demo.txt"), "after");
            emit(
              "Implementation: Modified zz-demo.txt to contain 'after'. No other files were changed.",
            );
          }, 0);
        } else if (instructions.startsWith("Workflow task: reviewer.")) {
          capturedInstructions.set("reviewer", instructions);
          // Poll until the test sets reviewerOutput.text — this lets the test
          // extract the permitted artifact IDs from the captured instructions
          // before the reviewer's canned output is emitted.
          const poll = () => {
            if (provider.reviewerOutput.text === "") {
              setTimeout(poll, 10);
              return;
            }
            emit(provider.reviewerOutput.text);
          };
          setTimeout(poll, 0);
        } else {
          setTimeout(() => emit("Controlled provider: unrecognized node."), 0);
        }
        return { accepted: true };
      },
      async cancel() {
        throw new Error("Must not cancel an agent for a Tool.");
      },
      async reconcile() {
        return "same-runtime" as const;
      },
      async inspect() {
        return { kind: "unknown" as const, reason: "controlled-provider" };
      },
    },
    tools: {
      async available() {
        return { available: true };
      },
      async create() {
        return {
          sessionId: `tool-session-${++sequence}`,
          runtimeIdentity: "controlled-provider",
        };
      },
      async start(
        _target: GraphWorkspaceTarget,
        attempt: GraphToolAttempt,
      ): Promise<GraphToolOperation> {
        const stored = (saved.runs.at(-1) as GraphSequentialRun).toolAttempts!.find(
          (a) => a.operationId === attempt.operationId,
        )!;
        if (stored.dispatchPhase !== "sending")
          throw new Error("Intent was not persisted before native effect");

        // 服务层夹具仅验证产物链路，不代表真实 Graph/native Tool 执行；完整桌面验收另行运行。
        const exe = attempt.recipe.executable;
        const args = attempt.resolvedArgs ?? attempt.recipe.args;
        const cwd = root;
        const startedAt = Date.now();
        let result: { stdout: string; stderr: string; status: number; signal?: string };
        try {
          result = {
            ...(await promisify(execFile)(exe, args, {
              cwd,
              encoding: "utf8",
              timeout: 30000,
              windowsHide: true,
            })),
            status: 0,
          };
        } catch (error) {
          const failed = error as {
            code?: number;
            stdout?: string;
            stderr?: string;
            signal?: string;
          };
          if (typeof failed.code !== "number") throw error;
          result = {
            stdout: failed.stdout ?? "",
            stderr: failed.stderr ?? "",
            status: failed.code,
            signal: failed.signal,
          };
        }
        const completedAt = Date.now();
        const exitCode = result.status ?? -1;
        const stdout = result.stdout ?? "";
        const stderr = result.stderr ?? "";

        const op: GraphToolOperation = {
          operationId: attempt.operationId,
          sessionId: attempt.sessionId!,
          requestDigest: sha256(attempt.operationId),
          recipeId: attempt.recipe.id,
          cwd,
          status: exitCode === 0 ? "completed" : "failed",
          processStarted: true,
          startedAt,
          completedAt,
          result: {
            status: exitCode === 0 ? "completed" : "failed",
            exitCode,
            processExitObserved: true,
            stdout: { text: stdout, bytes: Buffer.byteLength(stdout), truncated: false },
            stderr: { text: stderr, bytes: Buffer.byteLength(stderr), truncated: false },
            durationMs: completedAt - startedAt,
            timedOut: result.signal === "SIGTERM",
            cancelled: false,
            signal: result.signal ?? undefined,
          },
        };
        operations.set(op.operationId, op);
        return structuredClone(op);
      },
      async inspect(_target: GraphWorkspaceTarget, attempt: GraphToolAttempt) {
        return structuredClone(operations.get(attempt.operationId)!);
      },
      async cancel(_target: GraphWorkspaceTarget, attempt: GraphToolAttempt) {
        const op = operations.get(attempt.operationId)!;
        Object.assign(op, { status: "cancelled", completedAt: Date.now() });
        return structuredClone(op);
      },
    },
    preflight,
    id: () => `repro-${++sequence}`,
    now: () => ++sequence,
  };

  const service = new GraphEngineeringService(options as any);

  const current = async () =>
    (await service.getWorkspace(target)).runs.at(-1) as GraphSequentialRun;
  const wait = async (predicate: (run: GraphSequentialRun) => boolean) => {
    for (let i = 0; i < 300; i++) {
      const value = await current();
      if (value && predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Expected state not observed: " + JSON.stringify(await current()));
  };

  t.after(async () => {
    await service.disposeAndWait();
  });

  return {
    service,
    target,
    capturedInstructions,
    wait,
    current,
    saved: () => structuredClone(saved),
    dispose: async () => {
      await service.disposeAndWait();
    },
  };
}
