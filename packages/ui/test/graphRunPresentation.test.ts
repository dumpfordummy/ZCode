import assert from "node:assert/strict";
import test from "node:test";
import type { GraphRun } from "@zcode/services";
import { addCheck, nextSummaryIteration, summaryRun } from "./graphRunSummary.fixture.js";
import { graphRunEvidence } from "../src/graph-engineering/graphRunEvidence.js";
import { graphSelectedAttempt } from "../src/graph-engineering/graphRoutingView.js";
import {
  graphEvidenceActionLabels,
  graphEvidenceLabels,
  graphInspectionArtifacts,
} from "../src/graph-engineering/graphRunPresentation.js";
import { graphRunClarityEn } from "../src/i18n/locales/graphRunClarity.js";
import { graphHistoryPage } from "../src/graph-engineering/graphRunHistoryView.js";
import {
  readGraphInspection,
  type GraphInspectionState,
} from "../src/graph-engineering/graphInspectionRead.js";

const runs: GraphRun[] = Array.from({ length: 500 }, (_, index) => ({
  id: `run-${index}`,
  attemptId: `attempt-${index}`,
  requestId: `request-${index}`,
  commandId: `command-${index}`,
  inputId: `input-${index}`,
  target: { workspacePath: "C:/isolated-graph-history-fixture" },
  definition: {
    revision: 1,
    name: `History ${index}`,
    taskName: "Task",
    instructions: "Synthetic summary only",
    nodes: [],
    edges: [],
  },
  modelSelection: { providerId: "fixture", modelId: "fixture" },
  mode: "build",
  status: "Completed",
  createdAt: index,
  updatedAt: index,
}));

test("500-history pagination bounds rendering while retaining selected identity and all canonical records", () => {
  const before = JSON.stringify(runs);
  const first = graphHistoryPage(runs, 0, "run-499");
  assert.equal(first.items.length, 25);
  assert.equal(first.total, 500);
  assert.equal(first.pages, 20);
  assert.equal(first.selectedPage, 19);
  const last = graphHistoryPage(runs, 900, "run-0");
  assert.equal(last.page, 19);
  assert.equal(last.items.at(-1)?.id, "run-499");
  assert.equal(last.selectedPage, 0);
  assert.equal(graphHistoryPage(runs, -20).page, 0);
  assert.deepEqual(graphHistoryPage([], 2).items, []);
  assert.equal(JSON.stringify(runs), before);
});

test("newer evidence read owns the view and failure clears prior content rather than silently retaining it", async () => {
  const scope = { sequence: 0 },
    states: GraphInspectionState<string>[] = [];
  let finish!: (value: string) => void;
  const first = readGraphInspection({
    scope,
    key: "old",
    isCurrent: () => true,
    read: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    publish: (state) => states.push(state),
    missingMessage: "Unavailable",
  });
  await readGraphInspection({
    scope,
    key: "new",
    isCurrent: () => true,
    read: async () => "new evidence",
    publish: (state) => states.push(state),
    missingMessage: "Unavailable",
  });
  finish("old evidence");
  await first;
  assert.deepEqual(states.at(-1), { status: "ready", key: "new", value: "new evidence" });
  await readGraphInspection({
    scope,
    key: "broken",
    isCurrent: () => true,
    read: async () => {
      throw new Error("Digest mismatch");
    },
    publish: (state) => states.push(state),
    missingMessage: "Unavailable",
  });
  assert.deepEqual(states.at(-2), { status: "loading", key: "broken" });
  assert.deepEqual(states.at(-1), { status: "error", key: "broken", error: "Digest mismatch" });
});

test("old-run results and failures are suppressed while a current missing result stays explicit", async () => {
  const scope = { sequence: 0 },
    states: GraphInspectionState<string>[] = [];
  let current = true,
    fail!: (cause: Error) => void;
  const pending = readGraphInspection({
    scope,
    key: "old-run",
    isCurrent: () => current,
    read: () =>
      new Promise<string>((_, reject) => {
        fail = reject;
      }),
    publish: (state) => states.push(state),
    missingMessage: "Unavailable",
  });
  current = false;
  fail(new Error("Old failure"));
  await pending;
  assert.deepEqual(states, [{ status: "loading", key: "old-run" }]);
  await readGraphInspection({
    scope,
    key: "missing",
    isCurrent: () => true,
    read: async () => undefined,
    publish: (state) => states.push(state),
    missingMessage: "Unavailable",
  });
  assert.deepEqual(states.at(-1), { status: "error", key: "missing", error: "Unavailable" });
});

test("pending Build and command-only runs explicitly say no Tests instead of inventing a required Test", () => {
  for (const kind of ["build", "command"] as const) {
    const run = summaryRun(),
      check = addCheck(run, "check", kind);
    delete run.result;
    delete run.nodeAttempts[0]!.finalOutput;
    check.status = "Pending";
    delete check.verification;
    delete check.operation;
    const evidence = graphRunEvidence(run),
      labels = graphEvidenceLabels(evidence);
    assert.equal(evidence.state, "not-run");
    assert.equal(
      graphRunClarityEn[`graph.run.${labels.primary}`],
      "Configured checks have not run",
    );
    assert.equal(graphRunClarityEn[`graph.run.${labels.note}`], "No configured Tests");
  }
  const commandRun = summaryRun();
  addCheck(commandRun, "command", "command");
  const commandLabels = graphEvidenceLabels(graphRunEvidence(commandRun));
  assert.equal(commandLabels.primary, "evidence.command-only");
  assert.equal(commandLabels.note, "evidence.no-tests");
  const agentLabels = graphEvidenceLabels(graphRunEvidence(summaryRun()));
  assert.equal(agentLabels.primary, "evidence.agent-reported");
  assert.equal(agentLabels.note, "evidence.no-tests");
});

test("a missing current repair attempt exposes no old artifact, while explicit history and End retain exact evidence", () => {
  const run = summaryRun(),
    check = addCheck(run);
  const originalArtifacts = structuredClone(run.artifacts);
  nextSummaryIteration(run);
  assert.equal(graphSelectedAttempt(run, check.nodeId), undefined);
  assert.deepEqual(graphInspectionArtifacts(run, check.nodeId), []);
  assert.deepEqual(graphInspectionArtifacts(run, check.nodeId, check.attemptId), originalArtifacts);
  run.resultArtifactId = originalArtifacts![0]!.id;
  assert.deepEqual(graphInspectionArtifacts(run, "end"), originalArtifacts);
  const foreign = { ...originalArtifacts![0]!, id: "foreign", runId: "different-run" };
  run.artifacts!.push(foreign);
  assert.deepEqual(graphInspectionArtifacts(run, check.nodeId, check.attemptId), originalArtifacts);
  assert.equal(run.artifacts!.length, 2);
});

test("accepted failing assertions and invalid evidence keep different next-action guidance, including mixed checks", () => {
  const run = summaryRun(),
    failed = addCheck(run, "failed");
  failed.status = "Failed";
  Object.assign(failed.verification!, {
    outcome: "fail",
    passed: 0,
    failed: 1,
    acceptancePassed: false,
    exitSuccessful: false,
  });
  assert.deepEqual(graphEvidenceActionLabels(graphRunEvidence(run)), ["inspectFailure"]);
  const invalid = addCheck(run, "invalid");
  delete invalid.verification!.observationValid;
  assert.deepEqual(graphEvidenceActionLabels(graphRunEvidence(run)), [
    "inspectFailure",
    "inspectEvidence",
  ]);
});
