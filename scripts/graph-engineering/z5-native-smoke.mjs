import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareZ5Fixture, assertRunnerUnchanged } from "./z5-fixture.mjs";
import { startZ5Fixture } from "./z5-provider-fixture.mjs";
import { REPAIR_QUESTION, REVIEW_QUESTION } from "./z5-provider-responses.mjs";
import { createConditionGraph, createRepairGraph } from "./z5-native-editor.mjs";
import { finishCompanion, startCompanion } from "./z4-native-lifecycle.mjs";
import { decide } from "./z3-native-helpers.mjs";
import {
  assertNativeIdentity,
  independentSuccess,
  proveIterations,
  reopenCompleted,
} from "./z5-native-proof.mjs";
import {
  attemptFor,
  capture,
  currentIteration,
  driveUntil,
  finishEvidence,
  ledger,
  openNativeAttempt,
  selectAttempt,
  showGraph,
  startRun,
  waitRun,
} from "./z5-native-observe.mjs";

const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "complete";
const conditionValues = {
  "condition-true": { ready: true, count: 3 },
  "condition-false": { ready: false, count: 3 },
  "condition-default": { ready: true, count: 1 },
  "condition-missing": { count: 3 },
  "condition-wrong-type": { ready: true, count: "three" },
};
assert.ok(
  [
    "complete",
    "exhausted",
    "admissions",
    "deadline",
    "no-progress",
    "reviewer-pass",
    "invalid-json",
    "old-artifact",
    "cancel",
    "reject",
    "stale-source",
    ...Object.keys(conditionValues),
  ].includes(scenario),
);
const condition = scenario.startsWith("condition-");
const isolation = await createIsolation({
  fixtureFactory: (workspace) =>
    startZ5Fixture(workspace, {
      scenario,
      conditionValue: conditionValues[scenario],
      holdRepair: ["deadline", "cancel"].includes(scenario),
      holdReview: scenario === "stale-source",
    }),
});
const summary = {
  scenario,
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
console.error(`Z5 isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.fixture = await prepareZ5Fixture(isolation);
  window = await isolation.launch();
  if (["cancel", "reject"].includes(scenario)) await startCompanion(window, summary);
  const initialInputs = await ledger(isolation);
  const ids = condition
    ? await createConditionGraph(window, summary, scenario)
    : await createRepairGraph(window, isolation, summary, scenario);
  summary.ids = ids;
  await capture(isolation, window, summary, "z5-saved-native-graph");
  await startRun(isolation, window, summary, ids);

  if (condition) {
    const invalid = ["condition-missing", "condition-wrong-type"].includes(scenario);
    let run = await driveUntil(
      isolation,
      window,
      summary,
      (value) => value.status === (invalid ? "NeedsHuman" : "WaitingForApproval"),
    );
    const iteration = currentIteration(run),
      route = attemptFor(run, iteration, ids.decision);
    await selectAttempt(window, route);
    await capture(isolation, window, summary, "z5-typed-condition-route");
    if (invalid) {
      assert.equal(route.status, "Invalid");
      assert.equal((await ledger(isolation)).length, 1);
      assert.equal(run.nodeAttempts.filter((item) => item.sessionId).length, 1);
    } else {
      const selected = scenario.slice("condition-".length);
      assert.equal(route.selectedExit, selected);
      assert.equal(attemptFor(run, iteration, ids.branches[selected]).status, "Completed");
      for (const [port, id] of Object.entries(ids.branches))
        if (port !== selected) assert.equal(attemptFor(run, iteration, id).status, "Skipped");
      assert.equal(attemptFor(run, iteration, ids.merge).status, "Completed");
      assert.equal((await ledger(isolation)).length, 3);
      await selectAttempt(window, attemptFor(run, iteration, ids.finalGate));
      await decide(window, "approve", "Reviewed the actual selected exclusive route and merge.");
      run = await waitRun(isolation, (value) => value.status === "Completed");
      assert.equal(run.routing.admissions, 3);
    }
    assertNativeIdentity(run, await ledger(isolation));
    summary.assertions.push(
      "Typed actual native output selects one named route; skipped branches never gain sessions or block the merge. Missing/wrong-type operands stop without coercion or repair.",
    );
  } else if (["cancel", "deadline", "stale-source"].includes(scenario)) {
    let run = await driveUntil(
      isolation,
      window,
      summary,
      (value) =>
        value.status === "WaitingForUser" &&
        currentIteration(value).index === (scenario === "stale-source" ? 0 : 1),
    );
    const repair = attemptFor(
      run,
      currentIteration(run),
      scenario === "stale-source" ? ids.reviewer : ids.repair,
    );
    const question = scenario === "stale-source" ? REVIEW_QUESTION : REPAIR_QUESTION;
    await openNativeAttempt(isolation, window, summary, repair);
    await window.getByRole("option", { name: new RegExp(question) }).waitFor();
    await capture(isolation, window, summary, "z5-repair-native-question");
    const count = (await ledger(isolation)).length;
    assert.equal(count - initialInputs.length, scenario === "stale-source" ? 2 : 3);
    if (scenario === "stale-source") {
      await writeFile(
        path.join(isolation.workspace, "NuGet.Config"),
        (await readFile(path.join(isolation.workspace, "NuGet.Config"), "utf8")) +
          "<!-- external synthetic change -->\n",
      );
      await window.getByRole("option", { name: new RegExp(question) }).press("Enter");
      await showGraph(window);
      run = await waitRun(isolation, (value) =>
        ["NeedsHuman", "StaleEvidence", "Failed"].includes(value.status),
      );
      assert.equal(run.routing.iterations.length, 1);
      assert.equal(run.toolAttempts.filter((item) => item.sessionId).length, 2);
    } else {
      await showGraph(window);
      if (scenario === "cancel") await window.getByTestId("graph-cancel").click();
      run = await waitRun(
        isolation,
        (value) => value.status === (scenario === "cancel" ? "Cancelled" : "BudgetExhausted"),
      );
      assert.ok(attemptFor(run, currentIteration(run), ids.repair).terminalProof);
      if (scenario === "deadline") {
        assert.equal(run.routing.stopReason.kind, "BudgetExhausted");
        assert.ok(run.updatedAt >= run.routing.deadlineAt);
      } else await finishCompanion(isolation, window, summary);
    }
    assert.equal((await ledger(isolation)).length, count);
    assert.equal(
      run.nodeAttempts.filter((item) => item.nodeId === ids.repair && item.sessionId).length,
      scenario === "stale-source" ? 0 : 1,
    );
    await capture(isolation, window, summary, `z5-${scenario}-stopped`);
  } else if (scenario === "reject") {
    let run = await driveUntil(
      isolation,
      window,
      summary,
      (value) => value.status === "WaitingForApproval" && currentIteration(value).index === 1,
    );
    const gate = attemptFor(run, currentIteration(run), ids.repairGate);
    assert.equal(gate.status, "WaitingForApproval");
    await selectAttempt(window, gate);
    await decide(
      window,
      "reject",
      "Reject this exact repair; no subsequent Build/Test is authorized.",
    );
    run = await waitRun(isolation, (value) => value.status === "Rejected");
    assert.equal((await ledger(isolation)).length - initialInputs.length, 3);
    assert.equal(run.toolAttempts.filter((item) => item.sessionId).length, 2);
    await finishCompanion(isolation, window, summary);
    await capture(isolation, window, summary, "z5-repair-rejected");
  } else {
    const desired =
      scenario === "complete"
        ? "WaitingForApproval"
        : ["exhausted", "admissions"].includes(scenario)
          ? "BudgetExhausted"
          : scenario === "no-progress"
            ? "NoProgress"
            : "NeedsHuman";
    let run = await driveUntil(isolation, window, summary, (value) => value.status === desired);
    if (["complete", "exhausted", "no-progress"].includes(scenario)) {
      const passes =
        scenario === "complete" ? [0, 2, 3] : scenario === "exhausted" ? [0, 0, 0] : [0, 0];
      const proof = await proveIterations(isolation, window, summary, ids, run, passes);
      assert.equal(proof.agents.length, passes.length * 2);
      assert.equal(proof.tools.length, passes.length * 2);
      assert.equal(run.routing.admissions, passes.length * 4);
      if (scenario === "complete") {
        const gate = attemptFor(run, currentIteration(run), ids.finalGate);
        assert.equal(gate.status, "WaitingForApproval");
        await selectAttempt(window, gate);
        await capture(isolation, window, summary, "z5-final-current-evidence-gate");
        await decide(
          window,
          "approve",
          "Reviewed three native iterations and final three passing assertions; no publication authorized.",
        );
        run = await waitRun(isolation, (value) => value.status === "Completed");
        await independentSuccess(isolation, summary);
        window = await reopenCompleted(isolation, window, summary);
      } else assert.equal(run.routing.stopReason.kind, desired);
    } else {
      const inputs = await ledger(isolation);
      assertNativeIdentity(run, inputs);
      assert.equal(
        inputs.length,
        scenario === "admissions" ? 3 : scenario === "old-artifact" ? 4 : 2,
      );
      if (scenario === "admissions") assert.equal(run.routing.admissions, 5);
      if (scenario === "reviewer-pass")
        assert.equal(
          JSON.parse(run.nodeAttempts.find((item) => item.nodeId === ids.reviewer).finalOutput.text)
            .outcome,
          "pass",
        );
      assert.equal(
        run.approvalAttempts.some(
          (item) => item.nodeId === ids.finalGate && item.status === "Approved",
        ),
        false,
      );
    }
    await window.getByTestId("graph-region-select").click();
    await capture(isolation, window, summary, "z5-region-final-evidence");
    summary.assertions.push(
      "Native inputs, recipe admissions and finite iteration limits agree with exact durable identity and actual evidence; a stop is never promoted to successful verification.",
    );
  }
  await assertRunnerUnchanged(isolation);
  assert.deepEqual(isolation.fixture.errors, []);
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
