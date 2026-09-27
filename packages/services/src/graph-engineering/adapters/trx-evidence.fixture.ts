import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { TestContext } from "node:test";
import type {
  GraphRecipe,
  GraphSequentialRun,
  GraphToolAttempt,
  GraphToolOperation,
} from "../contract.js";
import { createGraphArtifactStore } from "./artifacts.js";
import {
  assertWorkspaceFilePath,
  fingerprintDeclaredFiles,
  observeDeclaredFiles,
} from "./artifact-files.js";
import { GraphArtifacts } from "../app/artifacts.js";
import type { GraphArtifactOptions } from "../app/ports.js";
import { GraphState, type GraphOptions } from "../app/state.js";
import { GraphToolEvidence } from "../app/tool-evidence.js";

export const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export type TrxCapture = Awaited<
  ReturnType<NonNullable<GraphArtifactOptions["reports"]>["captureTrx"]>
>;
const unused = async (): Promise<never> => {
  throw new Error("No native execution is permitted in this evidence unit fixture.");
};

export function operation(attempt: GraphToolAttempt, exitCode = 0): GraphToolOperation {
  const text = "PASS is only text; token=ONLY_SYNTHETIC_SECRET";
  return {
    operationId: attempt.operationId,
    sessionId: attempt.sessionId!,
    recipeId: attempt.recipe.id,
    requestDigest: hash(attempt.operationId),
    status: exitCode ? "failed" : "completed",
    processStarted: true,
    startedAt: attempt.nodeId === "build" ? 1000 : 3000,
    completedAt: attempt.nodeId === "build" ? 2000 : 4000,
    result: {
      status: exitCode ? "failed" : "completed",
      exitCode,
      processExitObserved: true,
      stdout: { text, bytes: Buffer.byteLength(text), truncated: false },
      stderr: { text: "", bytes: 0, truncated: false },
      durationMs: 1000,
      timedOut: false,
      cancelled: false,
    },
  };
}

/** Injected observations test owner policy, not native execution or XML validity. */
export async function trxEvidenceFixture(t: TestContext) {
  const parent = await realpath(tmpdir()),
    root = await mkdtemp(join(parent, "pre-z8-trx-evidence-"));
  assert.equal(dirname(root), parent);
  assert.match(basename(root), /^pre-z8-trx-evidence-/);
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { workspacePath: join(root, "workspace") },
    directory = join(root, "store");
  await mkdir(join(target.workspacePath, "bin"), { recursive: true });
  await mkdir(join(target.workspacePath, "reports"));
  await writeFile(join(target.workspacePath, "MathOps.cs"), "Synthetic source bytes");
  await writeFile(join(target.workspacePath, "bin/Fixture.Tests.dll"), Buffer.from([0, 255, 1]));
  await utimes(join(target.workspacePath, "bin/Fixture.Tests.dll"), 1.5, 1.5);
  const store = createGraphArtifactStore(directory);
  const buildRecipe: GraphRecipe = {
    id: "build",
    name: "Unit Build",
    executable: "dotnet",
    args: ["build", "Fixture.Tests.csproj", "--no-restore"],
    cwd: ".",
    timeoutMs: 10000,
    sourcePaths: ["MathOps.cs"],
    expectedOutputs: ["bin/Fixture.Tests.dll"],
    verifier: {
      kind: "build",
      dotnet: {
        project: "Fixture.Tests.csproj",
        configuration: "Release",
        framework: "net8.0",
        restore: "disabled",
      },
    },
  };
  const recipe: GraphRecipe = {
    id: "test",
    name: "Unit Test",
    executable: "dotnet",
    args: [
      "test",
      "Fixture.Tests.csproj",
      "--no-build",
      "--no-restore",
      "--results-directory",
      "reports/{operationId}",
    ],
    cwd: ".",
    timeoutMs: 10000,
    sourcePaths: ["MathOps.cs"],
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "dotnet-vstest-trx-v1",
      buildNodeId: "build",
      reportPath: "reports/{operationId}/results.trx",
      target: {
        project: "Fixture.Tests.csproj",
        configuration: "Release",
        framework: "net8.0",
        assembly: "bin/Fixture.Tests.dll",
      },
      minimumTests: 2,
      expectedTests: 2,
      requiredTests: ["synthetic.alpha", "synthetic.beta"],
    },
  };
  const attempt = (nodeId: string, recipe: GraphRecipe): GraphToolAttempt => ({
    nodeId,
    attemptId: `${nodeId}-attempt`,
    operationId: `${nodeId}-operation`,
    recipe,
    recipeDigest: hash(JSON.stringify(recipe)),
    status: "Running",
    dispatchPhase: "accepted",
    createdAt: 500,
    updatedAt: 500,
    sessionId: `${nodeId}-session`,
    runtimeIdentity: "unit-runtime",
    iterationId: "iteration",
    iteration: 0,
  });
  const build = attempt("build", buildRecipe),
    check = attempt("test", recipe);
  build.sourceDigest = (await fingerprintDeclaredFiles(target, buildRecipe.sourcePaths)).digest;
  build.outputDigest = (await fingerprintDeclaredFiles(target, buildRecipe.expectedOutputs)).digest;
  build.outputsBefore = [{ path: "bin/Fixture.Tests.dll", exists: false }];
  build.status = "Completed";
  build.operation = operation(build);
  check.operation = operation(check);
  const run: GraphSequentialRun = {
    version: 5,
    id: "unit-run",
    requestId: "unit-request",
    requestFingerprint: hash("unit-request"),
    target,
    definition: {
      version: 5,
      revision: 0,
      name: "Unit evidence owner",
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 0 }, request: "Evidence unit fixture" },
        { id: "build", type: "tool", position: { x: 0, y: 0 }, name: "Build", recipeId: "build" },
        { id: "test", type: "tool", position: { x: 0, y: 0 }, name: "Test", recipeId: "test" },
        {
          id: "gate",
          type: "approval",
          position: { x: 0, y: 0 },
          name: "Review",
          reviewInstructions: "Review retained evidence",
          commentPolicy: "optional",
          evidence: [
            {
              alias: "tests",
              source: { kind: "artifact", nodeId: "test", selector: "verification" },
            },
          ],
        },
        { id: "end", type: "end", position: { x: 0, y: 0 }, outputNodeId: null },
      ],
      edges: [
        { source: "start", target: "build" },
        { source: "build", target: "test" },
        { source: "test", target: "gate" },
        { source: "gate", target: "end" },
      ],
      routing: { finalGateId: "gate", limits: { maxNodeAdmissions: 8, deadlineMs: 10000 } },
    },
    defaults: {
      modelSelection: { providerId: "fixture", modelId: "unused" },
      mode: "build",
      planEnabled: false,
    },
    plannedPath: ["build", "test"],
    startInput: "Unit component fixture only",
    nodeAttempts: [],
    toolAttempts: [build, check],
    status: "Running",
    createdAt: 500,
    updatedAt: 500,
    routing: {
      configurationDigest: hash("configuration"),
      recipeConfigurationDigest: hash("recipes"),
      currentIterationId: "iteration",
      cursorNodeId: "test",
      iterations: [
        {
          id: "iteration",
          index: 0,
          createdAt: 500,
          attemptIds: { build: build.attemptId, test: check.attemptId },
          visitedNodeIds: ["build", "test"],
        },
      ],
      conditionAttempts: [],
      admissions: 2,
      deadlineAt: 20000,
      checkpoints: [],
      continuations: [],
    },
  };
  const content = "\uFEFFUnit-injected capture; token=ONLY_SYNTHETIC_SECRET\r\n";
  let captured: TrxCapture = {
    content,
    original: { digest: hash(content), bytes: Buffer.byteLength(content), modifiedAt: 3500 },
    report: {
      parserVersion: "dotnet-vstest-trx-v1",
      reportId: "11111111-1111-4111-8111-111111111111",
      startedAt: 3100,
      finishedAt: 3900,
      tests: [
        { name: "synthetic.alpha", status: "passed" },
        { name: "synthetic.beta", status: "passed" },
      ],
    },
  };
  let counter = 0,
    captures = 0;
  let duringCapture: (() => Promise<void>) | undefined;
  const options: GraphOptions = {
    id: () => `artifact-${++counter}`,
    now: () => 5000,
    artifacts: store,
    repository: { read: async () => null, write: unused },
    native: {
      available: async () => ({ available: false }),
      validateSelection: unused,
      create: unused,
      observe: unused,
      send: unused,
      cancel: unused,
      reconcile: unused,
      inspect: unused,
    },
    recipes: {
      read: async () => ({
        recipes: [buildRecipe, recipe],
        sourcePath: ".zcode/config.json",
        digest: hash("recipes"),
      }),
      save: unused,
      fingerprint: fingerprintDeclaredFiles,
      observeFiles: observeDeclaredFiles,
      validatePaths: async (target, paths) => {
        for (const path of paths) await assertWorkspaceFilePath(target, path, true);
      },
    },
    reports: {
      captureTrx: async () => {
        captures++;
        await duringCapture?.();
        return structuredClone(captured);
      },
    },
  };
  const state = new GraphState(options),
    artifacts = new GraphArtifacts(state),
    evidence = new GraphToolEvidence(state, artifacts);
  const selector = (name: string, nodeId = "test") =>
    run.artifactBindings?.find((binding) => binding.nodeId === nodeId && binding.selector === name)
      ?.artifactId;
  const file = (artifactId: string) =>
    join(
      directory,
      "artifacts",
      hash(target.workspacePath),
      hash(run.id),
      `${hash(artifactId)}.json`,
    );
  const cold = () =>
    new GraphArtifacts(new GraphState({ ...options, reports: { captureTrx: unused } }));
  return {
    root,
    target,
    store,
    options,
    state,
    artifacts,
    evidence,
    run,
    build,
    check,
    selector,
    file,
    cold,
    capture: () => captured,
    setCapture: (value: TrxCapture) => {
      captured = value;
    },
    captures: () => captures,
    duringCapture: (fn: () => Promise<void>) => {
      duringCapture = fn;
    },
    prepare: () => evidence.prepare(run, check),
    finish: () => evidence.finish(run, check),
    retained: async (name: string, nodeId = "test") => artifacts.read(run, selector(name, nodeId)!),
    mutate: async (name: string, value: string) =>
      writeFile(join(target.workspacePath, name), value),
    tamper: async (
      artifactId: string,
      mutate: (value: { artifact: Record<string, unknown>; content: string }) => void,
    ) => {
      const path = file(artifactId),
        value = JSON.parse(await readFile(path, "utf8"));
      mutate(value);
      await writeFile(path, JSON.stringify(value));
    },
  };
}
