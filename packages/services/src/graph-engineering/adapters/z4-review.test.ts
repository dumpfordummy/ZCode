import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import {
  evidenceFixture,
  toolDefinition,
  commandRecipe,
  position,
  hash,
} from "./evidence.fixture.js";
import { fingerprintDeclaredFiles, observeDeclaredFiles } from "./artifact-files.js";
import type { GraphRecipe, GraphSequentialRun, GraphWorkspaceTarget } from "../contract.js";
import { verifyToolReport } from "../domain/tool-verification.js";
import { recordSchema } from "../domain/record.js";
import type { TestContext } from "node:test";
import { GraphEngineeringService } from "../app/service.js";
import { runFingerprint } from "../app/attempts.js";

test("cold gate continuation rejects changed frozen Tool recipe even with its recomputed digest", async (t) => {
  const graph = toolDefinition();
  graph.nodes.splice(1, 0, {
    id: "gate",
    type: "approval",
    position,
    name: "Review",
    reviewInstructions: "Review frozen settings",
    commentPolicy: "optional",
    evidence: [{ alias: "request", source: { kind: "start" } }],
  });
  graph.edges[0] = { source: "start", target: "gate" };
  graph.edges.push({ source: "gate", target: "one" });
  const f = await evidenceFixture(t, graph);
  await f.run();
  await f.service.disposeAndWait();
  const record = f.saved(),
    run = record.runs[0] as GraphSequentialRun;
  run.toolAttempts![0]!.recipe.name = "Changed after review";
  run.toolAttempts![0]!.recipeDigest = hash(runFingerprint(run.toolAttempts![0]!.recipe));
  await f.options.repository.write(f.target, record);
  const cold = new GraphEngineeringService(f.options);
  t.after(() => cold.disposeAndWait());
  const restored = (await cold.getWorkspace(f.target)).runs[0] as GraphSequentialRun;
  assert.equal(restored.status, "AwaitingContinuation");
  const request = restored.approvalAttempts![0]!.request!;
  await assert.rejects(
    cold.continueApproval({
      target: f.target,
      runId: restored.id,
      nodeId: "gate",
      requestId: request.id,
      requestVersion: request.version,
      requestDigest: request.digest,
    }),
    /frozen|changed|identity/i,
  );
  assert.equal((await cold.getWorkspace(f.target)).runs[0]?.status, "StaleEvidence");
  assert.equal(f.starts.length, 0);
});

async function buildAndTestFixture(t: TestContext) {
  const graph = toolDefinition();
  for (const node of graph.nodes)
    if (node.type === "tool") node.recipeId = node.id === "one" ? "build" : "test";
  const f = await evidenceFixture(t, graph);
  const build: GraphRecipe = {
    ...commandRecipe,
    id: "build",
    sourcePaths: ["source.txt"],
    expectedOutputs: ["build.bin"],
    verifier: { kind: "build" },
  };
  const verify: GraphRecipe = {
    ...commandRecipe,
    id: "test",
    sourcePaths: ["source.txt"],
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      reportPath: "report.json",
      minimumTests: 1,
      expectedTests: 1,
      requiredTests: ["known"],
      buildNodeId: "one",
    },
  };
  Object.assign(f.options.recipes, {
    async read() {
      return {
        recipes: [build, verify],
        digest: hash("mixed-observation-recipes"),
        sourcePath: ".zcode/config.json",
      };
    },
    fingerprint: fingerprintDeclaredFiles,
    observeFiles: observeDeclaredFiles,
  });
  await writeFile(join(f.target.workspacePath, "source.txt"), "independent source");
  return f;
}

test("Build cannot combine one output digest with freshness observed from changed bytes", async (t) => {
  const f = await buildAndTestFixture(t);
  let observations = 0;
  Object.assign(f.options.recipes, {
    async observeFiles(target: GraphWorkspaceTarget, paths: string[]) {
      if (++observations === 2)
        await writeFile(
          join(target.workspacePath, "build.bin"),
          "changed between fingerprint and observation",
        );
      return observeDeclaredFiles(target, paths);
    },
  });
  await f.run();
  await writeFile(join(f.target.workspacePath, "build.bin"), "first build bytes");
  f.finishTool();
  const run = await f.wait((r) => r.toolAttempts?.[0]?.verification !== undefined);
  assert.equal(run.toolAttempts?.[0]?.verification?.acceptancePassed, false);
  assert.equal(f.starts.length, 1);
  assert.match(run.toolAttempts?.[0]?.message ?? "", /observation|changed|digest/i);
});

test("Test freshness fingerprint must describe the exact retained report bytes", async (t) => {
  const f = await buildAndTestFixture(t);
  await f.run();
  await writeFile(join(f.target.workspacePath, "build.bin"), "real bounded build bytes");
  f.finishTool();
  const running = await f.wait((r) => r.toolAttempts?.[1]?.status === "WaitingForPermission");
  const attempt = running.toolAttempts![1]!;
  const report = {
    format: "zcode-test-v1",
    operationId: attempt.operationId,
    sourceDigest: attempt.sourceDigest,
    buildDigest: attempt.buildDigest,
    tests: [{ name: "known", status: "passed" }],
  };
  await writeFile(join(f.target.workspacePath, "report.json"), JSON.stringify(report));
  const capture = f.options.artifacts.captureFile;
  f.options.artifacts.captureFile = async (input) => {
    const result = await capture(input);
    if (input.path === "report.json")
      await writeFile(join(f.target.workspacePath, "report.json"), "different file after capture");
    return result;
  };
  f.finishTool(1);
  const run = await f.wait((r) => r.toolAttempts?.[1]?.verification !== undefined);
  assert.equal(run.toolAttempts?.[1]?.verification?.acceptancePassed, false);
  assert.match(run.toolAttempts?.[1]?.message ?? "", /observation|changed|digest/i);
});

test("all-skipped discovered tests do not count as executed passing tests", () => {
  const expected = {
    operationId: "op",
    sourceDigest: "source",
    buildDigest: "build",
    minimumTests: 1,
    requiredTests: [],
  };
  const result = verifyToolReport(
    JSON.stringify({
      format: "zcode-test-v1",
      ...expected,
      minimumTests: undefined,
      requiredTests: undefined,
      tests: [{ name: "optional", status: "skipped" }],
    }),
    expected,
  );
  assert.equal(result.reportParsed, true);
  assert.equal(result.passed, 0);
  assert.match(result.issues.join(" "), /executed|passed|no.*test/i);
});

test("persisted Agent artifact native input and command identities match its exact attempt", async (t) => {
  const graph = toolDefinition();
  graph.nodes[1] = {
    id: "one",
    type: "task",
    position,
    name: "Author",
    instructionMode: "literal",
    instructions: "Return synthetic text",
    inputs: [],
    configuration: { kind: "inherit" },
  };
  const f = await evidenceFixture(t, graph);
  await f.run();
  f.finishAgent("Independent synthetic final text");
  await f.wait((r) => Boolean(r.artifacts?.length));
  for (const field of ["inputId", "commandId"] as const) {
    const record = f.saved();
    const run = record.runs[0] as GraphSequentialRun;
    run.artifacts![0]![field] = "foreign-native-identity";
    assert.equal(
      recordSchema.safeParse({ version: 4, workspaceKey: f.target.workspacePath, ...record })
        .success,
      false,
      field,
    );
  }
});

test("native owner failure cannot become Graph success merely because child process exited zero", async (t) => {
  const f = await evidenceFixture(t);
  await f.run();
  f.finishTool();
  f.operations.get(f.starts[0]!)!.status = "failed";
  const run = await f.wait((r) => r.toolAttempts?.[0]?.verification !== undefined);
  assert.equal(run.status, "Failed");
  assert.equal(run.toolAttempts?.[0]?.verification?.acceptancePassed, false);
  assert.equal(f.starts.length, 1);
});

test("successful-looking result with unobserved process exit never advances the graph", async (t) => {
  const f = await evidenceFixture(t);
  await f.run();
  f.finishTool();
  f.operations.get(f.starts[0]!)!.result!.processExitObserved = false;
  const run = await f.wait((r) => r.status === "Unknown");
  assert.equal(run.toolAttempts?.[0]?.verification, undefined);
  assert.equal(run.toolAttempts?.[0]?.operation?.status, "unknown");
  await assert.rejects(
    f.service.releaseInterrupted({
      target: f.target,
      runId: run.id,
      reason: "Unobserved exit",
      confirmed: true,
    }),
    /unproven|unknown|inactivity/i,
  );
  assert.equal(f.starts.length, 1);
});

test("source evidence changed while native Tool session is created makes the gate stale before process start", async (t) => {
  const graph = toolDefinition();
  graph.nodes.splice(1, 0, {
    id: "gate",
    type: "approval",
    position,
    name: "Source review",
    reviewInstructions: "Inspect source",
    commentPolicy: "optional",
    evidence: [{ alias: "source", source: { kind: "source" } }],
  });
  graph.edges[0] = { source: "start", target: "gate" };
  graph.edges.push({ source: "gate", target: "one" });
  const f = await evidenceFixture(t, graph);
  let baseline = "before-review";
  f.options.evidence.captureSource = async () => ({
    baseline,
    scope: "none",
    files: [],
    complete: true,
    issues: [],
  });
  const create = f.options.tools.create;
  f.options.tools.create = async () => {
    const result = await create();
    baseline = "changed-during-create";
    return result;
  };
  const run = (await f.run()) as GraphSequentialRun;
  const request = run.approvalAttempts![0]!.request!;
  await f.service.decideApproval({
    target: f.target,
    runId: run.id,
    nodeId: "gate",
    requestId: request.id,
    requestVersion: request.version,
    requestDigest: request.digest,
    decisionId: "reviewed",
    value: "approve",
    comment: "Reviewed before native create",
  });
  const stale = await f.current();
  assert.equal(stale.status, "StaleEvidence");
  assert.equal(stale.approvalAttempts?.[0]?.status, "StaleEvidence");
  assert.equal(stale.toolAttempts?.[0]?.dispatchPhase, "created");
  assert.equal(f.starts.length, 0);
});

test("real file observations reject a no-op Build reusing stale output and accept refreshed identical bytes", async (t) => {
  for (const refresh of [false, true]) {
    const graph = toolDefinition();
    const buildNode = graph.nodes.find((n) => n.id === "one")!;
    if (buildNode.type !== "tool") throw new Error("Fixture Tool missing");
    buildNode.recipeId = "build";
    const f = await evidenceFixture(t, graph);
    const build: GraphRecipe = {
      ...commandRecipe,
      id: "build",
      sourcePaths: ["source.txt"],
      expectedOutputs: ["output.bin"],
      verifier: { kind: "build" },
    };
    Object.assign(f.options.recipes, {
      async read() {
        return {
          recipes: [build, commandRecipe],
          digest: hash("build-recipes"),
          sourcePath: ".zcode/config.json",
        };
      },
      fingerprint: fingerprintDeclaredFiles,
      observeFiles: observeDeclaredFiles,
      async validatePaths(_target: GraphWorkspaceTarget, _paths: string[]) {},
    });
    await writeFile(join(f.target.workspacePath, "source.txt"), "fixed source");
    const path = join(f.target.workspacePath, "output.bin");
    await writeFile(path, "fixed output");
    await utimes(path, 1000, 1000);
    await f.run();
    if (refresh) await utimes(path, 2000, 2000);
    f.finishTool();
    const run = await f.wait((r) => r.toolAttempts?.[0]?.verification !== undefined);
    assert.equal(run.toolAttempts?.[0]?.verification?.acceptancePassed, refresh);
    if (refresh) await f.wait((r) => r.toolAttempts?.[1]?.status === "WaitingForPermission");
    else assert.match(run.toolAttempts?.[0]?.message ?? "", /freshly produced/);
    assert.equal(f.starts.length, refresh ? 2 : 1);
  }
});
