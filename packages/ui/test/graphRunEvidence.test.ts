import assert from "node:assert/strict";
import test from "node:test";
import { graphRunCheck, graphRunEvidence } from "../src/graph-engineering/graphRunEvidence.js";
import {
  addCheck,
  failCheck,
  nextSummaryIteration,
  summaryRun,
} from "./graphRunSummary.fixture.js";

test("completed agent prose and human approval never imply captured Test acceptance", () => {
  const run = summaryRun(),
    before = structuredClone(run);
  const result = graphRunEvidence(run);
  assert.equal(result.state, "agent-reported");
  assert.equal(result.configuredTestCount, 0);
  assert.deepEqual(result.checks, []);
  assert.deepEqual(run, before);
  delete run.result;
  delete run.nodeAttempts[0]!.finalOutput;
  assert.equal(graphRunEvidence(run).state, "no-tests");
});

test("native Build and command observations stay command-only, even with agent PASS prose", () => {
  for (const kind of ["build", "command"] as const) {
    const run = summaryRun();
    const check = addCheck(run, "check", kind);
    assert.equal(graphRunEvidence(run).state, "command-only");
    assert.equal(graphRunEvidence(run).configuredTestCount, 0);
    check.status = "Failed";
    check.verification!.acceptancePassed = false;
    check.verification!.exitSuccessful = false;
    assert.equal(graphRunEvidence(run).checks[0]!.state, "command-result");
  }
});

test("every configured current Test must pass; invalid observations cannot conceal another genuine failure", () => {
  const run = summaryRun();
  const first = addCheck(run, "one"),
    second = addCheck(run, "two");
  assert.equal(graphRunEvidence(run).state, "tests-passed");
  assert.equal(graphRunEvidence(run).configuredTestCount, 2);
  failCheck(first);
  assert.equal(graphRunEvidence(run).state, "tests-failed");
  second.verification!.observationValid = false;
  const mixed = graphRunEvidence(run);
  assert.equal(mixed.state, "invalid");
  assert.deepEqual(
    mixed.checks.map((check) => check.state),
    ["failed", "invalid"],
  );
});

test("legacy acceptance, stale/unparsed reports, missing proof and skipped attempts remain conservative", () => {
  for (const mutate of [
    (run: ReturnType<typeof summaryRun>) => {
      delete run.toolAttempts![0]!.verification!.observationValid;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.toolAttempts![0]!.verification!.reportFresh = false;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.toolAttempts![0]!.verification!.reportParsed = false;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.toolAttempts![0]!.verification!.processKnown = false;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.toolAttempts![0]!.verification!.acceptancePassed = false;
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.toolAttempts![0]!.status = "Skipped";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.toolAttempts![0]!.status = "Unknown";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.artifacts = [];
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.artifacts![0]!.validation = "incomplete";
    },
    (run: ReturnType<typeof summaryRun>) => {
      run.artifacts![0]!.operationId = "foreign";
    },
  ]) {
    const run = summaryRun();
    addCheck(run);
    mutate(run);
    assert.equal(graphRunEvidence(run).state, "invalid");
    assert.ok(graphRunEvidence(run).checks[0]!.issues.length);
  }
});

test("not-yet-executed Tests show not-run but a missing current attempt is invalid", () => {
  const run = summaryRun(),
    check = addCheck(run);
  for (const status of ["Pending", "Starting", "Running", "WaitingForPermission"] as const) {
    check.status = status;
    delete check.verification;
    delete check.operation;
    assert.equal(graphRunEvidence(run).state, "not-run");
  }
  run.toolAttempts = [];
  const node = run.definition.nodes.find((node) => node.id === "check");
  if (node?.type !== "tool") throw new Error("Missing fixture Tool");
  node.verification = { kind: "test", buildNodeId: "build" };
  assert.equal(graphRunEvidence(run).state, "invalid");
  assert.equal(graphRunEvidence(run).configuredTestCount, 1);
});

test("prior repair pass and receipt cannot replace missing or invalid current iteration evidence", () => {
  const run = summaryRun();
  const old = addCheck(run);
  nextSummaryIteration(run);
  assert.equal(graphRunEvidence(run).state, "invalid");
  const current = structuredClone(old);
  current.attemptId = "check-1";
  current.iterationId = "iteration-1";
  current.iteration = 1;
  run.toolAttempts!.unshift(current);
  assert.equal(graphRunEvidence(run).checks[0]!.attemptId, "check-1");
  assert.equal(graphRunEvidence(run).state, "invalid");
  assert.equal(old.status, "Completed");
});

test("explicit Test roles cannot be satisfied by a frozen command recipe or a display name", () => {
  const run = summaryRun();
  addCheck(run, "custom", "command");
  const node = run.definition.nodes.find((item) => item.id === "custom");
  if (node?.type !== "tool") throw new Error("Missing Tool");
  node.name = "Tests passed";
  assert.equal(graphRunEvidence(run).state, "command-only");
  node.verification = { kind: "test", buildNodeId: "build" };
  assert.equal(graphRunEvidence(run).state, "invalid");
  assert.equal(graphRunEvidence(run).configuredTestCount, 1);
});

test("TRX captured pass requires retained normalization metadata, while redacted raw previews do not disprove it", () => {
  const run = summaryRun(),
    check = addCheck(run);
  check.recipe.verifier = {
    kind: "test",
    format: "dotnet-vstest-trx-v1",
    reportPath: "{operationId}.trx",
    minimumTests: 1,
    requiredTests: [],
    buildNodeId: "build",
    target: {
      project: "Tests.csproj",
      framework: "net8.0",
      configuration: "Debug",
      assembly: "Tests.dll",
    },
  };
  assert.equal(graphRunEvidence(run).state, "invalid");
  const artifact = run.artifacts![0]!;
  for (const selector of ["normalization", "normalized-report"]) {
    const artifactId = `artifact-${selector}`;
    run.artifacts!.push({ ...artifact, id: artifactId });
    run.artifactBindings!.push({
      nodeId: check.nodeId,
      attemptId: check.attemptId,
      selector,
      artifactId,
    });
    if (selector === "normalization") check.normalizationReceiptId = artifactId;
  }
  run.artifacts!.push({
    ...artifact,
    id: "preview",
    type: "file",
    provenance: "workspace-file",
    validation: "incomplete",
    redacted: true,
  });
  assert.equal(graphRunEvidence(run).state, "tests-passed");
  run.artifacts!.find((item) => item.id === check.normalizationReceiptId)!.redacted = true;
  assert.equal(graphRunEvidence(run).state, "invalid");
});

test("metadata summaries perform no content read and cannot declare current retained-file availability", () => {
  const run = summaryRun();
  addCheck(run);
  const result = graphRunEvidence(run);
  assert.equal(result.state, "tests-passed");
  assert.equal("liveFreshness" in result, false);
  assert.equal("available" in result, false);
  assert.deepEqual(result.checks[0]!.artifactIds, ["artifact-check"]);
});

test("explicit historical Tool inspection keeps old evidence separate and ignores caller-supplied substitute facts", () => {
  const run = summaryRun(),
    old = addCheck(run);
  nextSummaryIteration(run);
  assert.equal(graphRunEvidence(run).state, "invalid");
  assert.equal(graphRunCheck(run, old).state, "passed");
  const supplied = structuredClone(old);
  failCheck(supplied);
  assert.equal(graphRunCheck(run, supplied).state, "passed");
  supplied.attemptId = "unretained";
  assert.equal(graphRunCheck(run, supplied).state, "invalid");
  assert.equal(old.verification!.outcome, "pass");
});

test("all frozen Test roles stay required even if a contradictory current recipe claims command-only", () => {
  const run = summaryRun(),
    old = addCheck(run, "custom");
  nextSummaryIteration(run);
  const current = structuredClone(old);
  current.attemptId = "custom-1";
  current.iterationId = "iteration-1";
  current.recipe.verifier = { kind: "command" };
  current.verification!.classification = "command";
  run.toolAttempts!.push(current);
  const result = graphRunEvidence(run);
  assert.equal(result.configuredTestCount, 1);
  assert.equal(result.state, "invalid");
  assert.ok(result.checks[0]!.issues.includes("mismatched-check-kind"));
});
