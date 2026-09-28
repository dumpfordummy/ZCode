/**
 * Part A — Sequential Engineering reviewer reproduction.
 *
 * Isolated service-level reproduction of the reported reviewer workflow using
 * the corrected built-in generic template (BUILTIN_TEMPLATE_VERSION = 2).
 *
 * Request: "Modify zz-demo.txt file content to after"
 *
 * Build/Test use Node scripts (build.js / test.js) through the existing
 * recipe/report contract (zcode-json-v1 / zcode-test-v1). The tool port
 * genuinely executes the scripts via child_process; the agent port uses a
 * controlled provider that returns canned responses and is labelled as such.
 *
 * Five reviewer exercises:
 *   1. Genuine passing Test + valid reviewer JSON → final human-review gate.
 *   2. Prose/fenced JSON → reviewer output-validation failure.
 *   3. Unbound report reference → rejected without weakening ownership checks.
 *   4. Valid needs_changes → distinguishable from malformed output.
 *   5. Genuine failing Test → cannot become approved; Test stop prevents reviewer.
 *
 * Plus: reviewer-request content assertion and library v1→v2 fallback check.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { TestContext } from "node:test";

import { builtinTemplates } from "../domain/workflow-samples.js";
import { instantiateTemplate } from "../domain/workflow.js";
import { fingerprintDeclaredFiles, observeDeclaredFiles } from "./artifact-files.js";
import { createGraphArtifactStore } from "./artifacts.js";
import { GraphEngineeringService } from "../app/service.js";
import { runFingerprint } from "../app/attempts.js";
import { recordSchema } from "../domain/record.js";
import type {
  GraphSequentialDefinition,
  GraphSequentialRun,
  GraphRecipe,
  GraphToolOperation,
  GraphToolAttempt,
} from "../contract.js";
import type {
  GraphNativeFact,
  GraphNativeExecution,
  GraphRecord,
} from "../app/ports.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";
import type { GraphWorkspaceTarget } from "../contract.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const BUILTIN_TEMPLATE_VERSION = 2;
const RUN_REQUEST = "Modify zz-demo.txt file content to after";

// ─── Fixture scripts (written into the temp workspace) ─────────────────────

const BUILD_JS = `\
// build.js — produces a declared output file within the operation window.
const fs = require("fs");
const operationId = process.argv[2] || "";
const sourceDigest = process.argv[3] || "";
fs.writeFileSync("build.out", operationId + ":" + sourceDigest + "\\n");
process.exit(0);
`;

const TEST_JS = `\
// test.js — reads zz-demo.txt, evaluates assertion, writes zcode-test-v1 report.
const fs = require("fs");
const operationId = process.argv[2] || "";
const sourceDigest = process.argv[3] || "";
const buildDigest = process.argv[4] || "";
const reportPath = process.argv[5] || "report.json";
const content = fs.readFileSync("zz-demo.txt", "utf8");
const passed = content.includes("after");
const report = {
  format: "zcode-test-v1",
  operationId: operationId,
  sourceDigest: sourceDigest,
  buildDigest: buildDigest,
  tests: [
    {
      name: "contains-after",
      status: passed ? "passed" : "failed",
      message: passed
        ? "zz-demo.txt contains 'after'"
        : "zz-demo.txt does not contain 'after'; content: " + content.trim(),
    },
  ],
};
fs.writeFileSync(reportPath, JSON.stringify(report));
process.exit(passed ? 0 : 1);
`;

// ─── Recipe declarations ────────────────────────────────────────────────────

function nodeRecipes(): GraphRecipe[] {
  return [
    {
      id: "build",
      name: "Node build",
      executable: "node",
      args: ["build.js", "{operationId}", "{sourceDigest}"],
      cwd: ".",
      timeoutMs: 30000,
      sourcePaths: ["zz-demo.txt"],
      expectedOutputs: ["build.out"],
      verifier: { kind: "build" },
    },
    {
      id: "test",
      name: "Node test",
      executable: "node",
      args: [
        "test.js",
        "{operationId}",
        "{sourceDigest}",
        "{buildDigest}",
        "{reportPath}",
      ],
      cwd: ".",
      timeoutMs: 30000,
      sourcePaths: ["zz-demo.txt"],
      expectedOutputs: [],
      verifier: {
        kind: "test",
        format: "zcode-json-v1",
        reportPath: "report.json",
        minimumTests: 1,
        expectedTests: 1,
        requiredTests: ["contains-after"],
        buildNodeId: "build",
      },
    },
  ];
}

// ─── Instantiate the built-in generic template ──────────────────────────────

function instantiateGeneric(request: string): GraphSequentialDefinition {
  const entry = builtinTemplates.find((e) => e.id === "generic")!;
  const selected = {
    version: BUILTIN_TEMPLATE_VERSION,
    digest: sha256(runFingerprint(entry.template)),
    createdAt: 0,
    template: structuredClone(entry.template),
  };
  return instantiateTemplate(
    "generic",
    selected,
    { request },
    {
      references: {},
      recipes: { build: "build", test: "test" },
      sourcePaths: [],
    },
  );
}

// ─── Controlled provider fixture ─────────────────────────────────────────────

interface ReproductionFixture {
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

async function buildReproductionFixture(
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
        return { dispose() { facts.delete(execution.attemptId); } };
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
          setTimeout(() => emit(
            "Analysis: The request asks to modify zz-demo.txt so its content becomes 'after'. " +
            "The file currently contains 'before'. No additional acceptance criteria are stated.",
          ), 0);
        } else if (instructions.startsWith("Workflow task: implement.")) {
          capturedInstructions.set("implement", instructions);
          setTimeout(() => {
            if (provider.modifyFile)
              writeFileSync(join(root, "zz-demo.txt"), "after");
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

        // Genuinely execute the Node script via child_process.
        const exe = attempt.recipe.executable;
        const args = attempt.resolvedArgs ?? attempt.recipe.args;
        const cwd = root;
        const startedAt = Date.now();
        const result = spawnSync(exe, args, {
          cwd,
          encoding: "utf8",
          timeout: 30000,
          windowsHide: true,
        });
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

  return { service, target, capturedInstructions, wait, current, saved: () => structuredClone(saved), dispose: async () => { await service.disposeAndWait(); } };
}

// ─── Helper: extract permitted artifact IDs from reviewer instructions ──────

function extractPermittedIds(instructions: string): string[] {
  const match = instructions.match(
    /Permitted evidence artifact IDs for evidenceReferences: \[([^\]]*)\]/,
  );
  if (!match) return [];
  return match[1]!
    .split(",")
    .map((s) => s.trim().replace(/"/g, ""))
    .filter(Boolean);
}

// ─── Helper: run the generic template through the service ───────────────────

async function runGeneric(f: ReproductionFixture, definition: GraphSequentialDefinition) {
  const preflightDigest = sha256("repro-preflight-" + definition.revision);
  await f.service.run({
    target: f.target,
    requestId: "repro-" + Math.random().toString(36).slice(2),
    revision: definition.revision,
    modelSelection: { providerId: "fixture", modelId: "test-only" },
    mode: "edit",
    planEnabled: false,
    action: "run",
    preflight: { digest: preflightDigest, acknowledgedUnknowns: true },
  } as any);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  "Completed", "Failed", "Cancelled", "NeedsHuman",
  "BudgetExhausted", "NoProgress", "Rejected",
  "Interrupted", "Unknown", "StaleEvidence",
]);
function isTerminal(run: GraphSequentialRun): boolean {
  return TERMINAL_STATUSES.has(run.status);
}
/** The run has reached the final human-review approval gate and is waiting for a decision. */
function isAwaitingGate(run: GraphSequentialRun): boolean {
  return run.status === "WaitingForApproval";
}

async function prepareWorkspace(root: string) {
  await writeFile(join(root, "zz-demo.txt"), "before");
  await writeFile(join(root, "build.js"), BUILD_JS);
  await writeFile(join(root, "test.js"), TEST_JS);
}

// ─── Scenario 1: passing Test + valid reviewer JSON → final gate ────────────

test("scenario 1: genuine passing Test + valid reviewer JSON reaches final human-review gate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s1-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" }; // patched after verification artifact is known
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });

  await runGeneric(f, definition);

  // Wait for the reviewer to be dispatched (instructions captured) or terminal.
  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"), "Reviewer must be dispatched");

  // Extract the permitted artifact IDs from the reviewer's resolved instructions.
  const permittedIds = extractPermittedIds(f.capturedInstructions.get("reviewer")!);
  assert.ok(permittedIds.length >= 1, "Permitted list must contain the verification artifact ID");

  // Set valid reviewer output referencing only the permitted artifact.
  reviewerOutput.text = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: permittedIds,
  });

  // Wait for the workflow to reach the final-gate or terminal.
  const final = await f.wait((r) => isAwaitingGate(r) || isTerminal(r));

  assert.ok(
    isAwaitingGate(final),
    "Passing Test + valid reviewer JSON should reach the final human-review gate, " +
      `got ${final.status}: ${final.message ?? ""}`,
  );

  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
  assert.equal(reviewerAttempt.status, "Completed");
  assert.equal(reviewerAttempt.outputValidation?.status, "valid");

  const gate = final.approvalAttempts?.find((a) => a.nodeId === "final-gate");
  assert.ok(gate, "final-gate approval attempt should exist");
});

// ─── Scenario 2: prose/fenced JSON → reviewer output-validation failure ─────

test("scenario 2: prose and fenced JSON output is rejected by strict reviewer validation", async (t) => {
  const badOutputs = [
    'Here is my review:\n{"outcome":"pass","findings":[],"evidenceReferences":[]}',
    "```json\n" +
      JSON.stringify({ outcome: "pass", findings: [], evidenceReferences: [] }) +
      "\n```",
    'I think this looks good. The test passed.',
  ];

  for (const badOutput of badOutputs) {
    const root = await mkdtemp(join(tmpdir(), "zcode-repro-s2-"));
    t.after(async () => { await rm(root, { recursive: true, force: true }); });
    await prepareWorkspace(root);

    const definition = instantiateGeneric(RUN_REQUEST);
    const reviewerOutput = { text: "" };
    const f = await buildReproductionFixture(t, definition, root, {
      reviewerOutput,
      modifyFile: true,
    });

    await runGeneric(f, definition);

    // Wait for reviewer dispatch, then feed the bad output.
    await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
    if (f.capturedInstructions.has("reviewer")) {
      reviewerOutput.text = badOutput;
    }

    const final = await f.wait((r) => isTerminal(r));
    assert.equal(
      final.status,
      "NeedsHuman",
      `Prose/fenced output "${badOutput.slice(0, 40)}..." should stop the workflow, got ${final.status}`,
    );

    const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
    assert.equal(reviewerAttempt.status, "Failed");
    assert.equal(reviewerAttempt.outputValidation?.status, "invalid");
    assert.match(
      reviewerAttempt.outputValidation?.issues.join(" ") ?? "",
      /prose|fence|JSON|invalid|object|property|Unexpected/i,
    );

    // The reviewer never reached the final-gate.
    const gate = final.approvalAttempts?.find((a) => a.nodeId === "final-gate");
    assert.notEqual(gate?.status, "Approved");
  }
});

// ─── Scenario 3: unbound report reference → rejected ────────────────────────

test("scenario 3: unbound evidence reference is rejected without weakening ownership checks", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s3-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });

  await runGeneric(f, definition);

  // Wait for reviewer dispatch, then feed output with an unbound reference.
  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"));

  // The reviewer references an artifact ID that is NOT in the permitted list.
  reviewerOutput.text = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: ["unbound-invented-id-not-in-permitted-list"],
  });

  const final = await f.wait((r) => isTerminal(r));
  assert.equal(
    final.status,
    "NeedsHuman",
    "Unbound evidence reference should stop the workflow, got " + final.status,
  );

  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
  assert.equal(reviewerAttempt.status, "Failed");
  assert.equal(reviewerAttempt.outputValidation?.status, "invalid");
  assert.match(
    reviewerAttempt.outputValidation?.issues.join(" ") ?? "",
    /evidenceReferences|validated artifacts|earlier completed/i,
  );
});

// ─── Scenario 4: valid needs_changes → distinguishable from malformed ───────

test("scenario 4: valid needs_changes outcome is distinguishable from malformed output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s4-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });

  await runGeneric(f, definition);

  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"));

  const permittedIds = extractPermittedIds(f.capturedInstructions.get("reviewer")!);
  reviewerOutput.text = JSON.stringify({
    outcome: "needs_changes",
    findings: [
      {
        code: "REVIEW-001",
        message: "The test verifies content but the request scope may need additional review.",
      },
    ],
    evidenceReferences: permittedIds,
  });

  const final = await f.wait((r) => isAwaitingGate(r) || isTerminal(r));

  // needs_changes is a VALID reviewer outcome (not malformed). Output validation
  // should pass — this is distinguishable from scenario 2 (malformed output).
  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer")!;
  assert.equal(
    reviewerAttempt.outputValidation?.status,
    "valid",
    "needs_changes is valid; output validation should pass, unlike malformed output",
  );
  assert.equal(reviewerAttempt.status, "Completed");

  // The structured output should contain outcome: "needs_changes".
  // selector lives on artifactBindings, not on the artifact itself.
  const structuredBinding = final.artifactBindings?.find(
    (b) => b.nodeId === "reviewer" && b.selector === "structured",
  );
  assert.ok(structuredBinding, "reviewer structured artifact binding should exist");
  const structuredArtifact = final.artifacts?.find(
    (a) => a.id === structuredBinding!.artifactId,
  );
  assert.ok(structuredArtifact, "reviewer structured artifact should exist");
  assert.equal(structuredArtifact!.type, "json");
  assert.equal(structuredArtifact!.validation, "valid");
  // The raw JSON is on the attempt's finalOutput; the artifact store holds the content.
  const parsed = JSON.parse(reviewerAttempt.finalOutput!.text);
  assert.equal(parsed.outcome, "needs_changes");

  // The workflow should reach the final-gate, NOT stop at the reviewer.
  assert.ok(
    isAwaitingGate(final),
    "Valid needs_changes should reach the final-gate for human decision, got " + final.status,
  );
});

// ─── Scenario 5: failing Test → cannot become approved ──────────────────────

test("scenario 5: genuine failing Test stops the workflow before the reviewer runs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-s5-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: false, // zz-demo.txt stays "before" → test fails
  });

  await runGeneric(f, definition);

  const final = await f.wait((r) => isTerminal(r));

  // The test genuinely fails (zz-demo.txt still contains "before").
  // Per the template's routing contract, a failing Test stops with NeedsHuman.
  // The reviewer is NOT forced to execute.
  assert.equal(
    final.status,
    "NeedsHuman",
    "Failing Test should stop the workflow with NeedsHuman, got " + final.status,
  );

  const testAttempt = final.toolAttempts?.find((a) => a.nodeId === "test");
  assert.ok(testAttempt, "test tool attempt should exist");
  assert.equal(testAttempt!.status, "Failed");
  assert.equal(testAttempt!.verification?.acceptancePassed, false);
  assert.equal(testAttempt!.verification?.outcome, "fail");

  // The reviewer node must NOT have been dispatched. When the test fails,
  // skipPending marks remaining nodes as Skipped (not Pending).
  const reviewerAttempt = final.nodeAttempts.find((a) => a.nodeId === "reviewer");
  assert.ok(
    reviewerAttempt?.status === "Pending" || reviewerAttempt?.status === "Skipped",
    "Reviewer must not run when Test failure stops the workflow, got " + reviewerAttempt?.status,
  );
  assert.equal(
    f.capturedInstructions.has("reviewer"),
    false,
    "Reviewer instructions must not be captured when Test stops first",
  );

  // The final-gate must NOT be reached.
  const gate = final.approvalAttempts?.find((a) => a.nodeId === "final-gate");
  assert.notEqual(gate?.status, "Approved");
});

// ─── Reviewer request content assertion ─────────────────────────────────────

test("reviewer request contains original task, current verification, permitted artifact refs, and strict output contract", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "zcode-repro-req-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await prepareWorkspace(root);

  const definition = instantiateGeneric(RUN_REQUEST);
  const reviewerOutput = { text: "" };
  const f = await buildReproductionFixture(t, definition, root, {
    reviewerOutput,
    modifyFile: true,
  });

  await runGeneric(f, definition);

  await f.wait((r) => f.capturedInstructions.has("reviewer") || isTerminal(r));
  assert.ok(f.capturedInstructions.has("reviewer"), "Reviewer must be dispatched");

  const instructions = f.capturedInstructions.get("reviewer")!;

  // 1. The original task.
  assert.ok(instructions.includes(RUN_REQUEST), "Must contain the original task text");

  // 2. The current verification (test verification artifact content).
  assert.ok(instructions.includes("verification"), "Must include the verification input");
  assert.ok(
    instructions.includes('"outcome"') || instructions.includes("outcome"),
    "Must contain the verification outcome",
  );

  // 3. The exact permitted artifact references.
  const permittedIds = extractPermittedIds(instructions);
  assert.ok(permittedIds.length >= 1, "Permitted list must contain at least the verification artifact ID");

  const run = await f.current();
  // selector lives on artifactBindings, not on the artifact itself.
  const verificationBinding = run.artifactBindings?.find(
    (b) => b.nodeId === "test" && b.selector === "verification",
  );
  assert.ok(verificationBinding, "Verification artifact binding must exist");
  const verificationArtifact = run.artifacts?.find(
    (a) => a.id === verificationBinding!.artifactId,
  );
  assert.ok(verificationArtifact, "Verification artifact must exist");
  assert.equal(verificationArtifact!.validation, "valid");
  assert.ok(
    permittedIds.includes(verificationArtifact!.id),
    "Permitted list must contain the actual verification artifact ID",
  );

  // 4. The declared strict output contract.
  assert.ok(instructions.includes("no prose before or after"), "Must prohibit prose");
  assert.ok(instructions.includes("no Markdown fence"), "Must prohibit fences");
  assert.ok(instructions.includes("no additional properties"), "Must prohibit extra properties");
  assert.ok(instructions.includes("A failed Test can never be pass"), "Must state failed-Test rule");
  assert.ok(
    /do not require Git-tracked or committed source/i.test(instructions),
    "Must not require Git tracking",
  );

  // Clean up: set valid output and let it finish.
  reviewerOutput.text = JSON.stringify({
    outcome: "pass",
    findings: [],
    evidenceReferences: permittedIds,
  });
});

// ─── Library v1→v2 fallback is explicit ─────────────────────────────────────

test("library version selection is exact — no silent fallback from v1 to v2", async () => {
  // The built-in library only publishes version 2 (BUILTIN_TEMPLATE_VERSION).
  // Requesting version 1 (an old pin that no longer exists) must throw —
  // the service does NOT silently fall back to version 2.
  const { GraphWorkflowService } = await import("../app/workflow-service.js");
  const entry = builtinTemplates.find((e) => e.id === "generic")!;
  const v2Digest = sha256(runFingerprint(entry.template));

  const store = {
    async read() {
      return { revision: 0, entries: [] };
    },
    async change() {
      throw new Error("unused");
    },
  };
  const svc = new GraphWorkflowService({
    store: store as any,
    graph: {} as any, // not reached when selected() throws
    preflight: {} as any,
    digest: sha256,
    id: () => "lib-test",
    now: () => 1,
  });

  // Version 1 does not exist in the builtin library (only version 2).
  await assert.rejects(
    svc.instantiate({
      target: { workspacePath: "/tmp" },
      id: "generic",
      version: 1,
      expectedRevision: 0,
      parameters: { request: RUN_REQUEST },
      bindings: {
        references: {},
        recipes: { build: "build", test: "test" },
        sourcePaths: [],
      },
    }),
    /existing immutable workflow version/i,
    "Requesting old v1 must not silently fall back to v2",
  );

  // Version 2 with the correct digest is accepted by selected().
  // (We cannot fully exercise instantiate without a real graph service,
  // but we can verify selected() accepts v2 and rejects a wrong digest.)
  const list = await svc.list();
  const genericEntry = list.entries.find((e) => e.id === "generic")!;
  assert.ok(genericEntry, "generic template must be in the library");
  const v2 = genericEntry.versions.find((v) => v.version === BUILTIN_TEMPLATE_VERSION);
  assert.ok(v2, "version 2 must exist");
  assert.equal(v2!.digest, v2Digest);

  // Only version 2 exists — no v1.
  assert.equal(
    genericEntry.versions.length,
    1,
    "Builtin library must publish exactly one version (v2)",
  );
  assert.equal(genericEntry.versions[0]!.version, BUILTIN_TEMPLATE_VERSION);
});
