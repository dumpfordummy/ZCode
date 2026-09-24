import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createIsolation, root } from "./isolation.mjs";
import { prepareZ5Fixture } from "./z5-fixture.mjs";
import { startZ5Fixture } from "./z5-provider-fixture.mjs";
import { REPAIR_QUESTION } from "./z5-provider-responses.mjs";
import { createRepairGraph } from "./z5-native-editor.mjs";
import {
  attemptFor,
  capture,
  currentIteration,
  driveUntil,
  finishEvidence,
  ledger,
  modelCount,
  showGraph,
  startRun,
  waitRun,
} from "./z5-native-observe.mjs";

const scenario =
  process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "decision-restart";
assert.ok(["decision-restart", "unknown-repair", "stale-continue"].includes(scenario));
const kind = scenario === "unknown-repair" ? "accepted" : "planned";
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ5Fixture(workspace, { scenario, holdRepair: true }),
});
isolation.env.Z5_GRAPH_BOUNDARY_PROFILE = isolation.home;
isolation.env.Z5_GRAPH_BOUNDARY_KIND = kind;
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
  await prepareZ5Fixture(isolation);
  window = await isolation.launch({
    bootstrapEntry: path.join(root, "scripts/graph-engineering/z5-boundary-bootstrap.cjs"),
  });
  const ids = await createRepairGraph(window, isolation, summary, scenario);
  summary.ids = ids;
  await startRun(isolation, window, summary, ids);
  await driveUntil(isolation, window, summary, (run) => {
    const iteration = currentIteration(run);
    return (
      iteration.index === 1 &&
      attemptFor(run, iteration, ids.repair).dispatchPhase ===
        (kind === "planned" ? "planned" : "sending")
    );
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      summary.checkpoint = JSON.parse(
        await readFile(path.join(isolation.home, "z5-boundary-checkpoint.json"), "utf8"),
      );
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await wait(75);
  }
  assert.ok(summary.checkpoint);
  const before = summary.checkpoint.persisted.runs.at(-1),
    iteration = currentIteration(before),
    repair = attemptFor(before, iteration, ids.repair),
    checkpoint = before.routing.checkpoints.at(-1);
  if (kind === "accepted") {
    // 原始 accepted 写入尚未发布时，使用面板既有导航回调打开真实会话，方法与已审计的 Z4 边界一致。
    await window.getByTestId("graph-engineering-panel").evaluate(
      (element, target) => {
        const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
        for (let fiber = element[key]; fiber; fiber = fiber.return)
          if (typeof fiber.memoizedProps?.onOpenConversation === "function") {
            fiber.memoizedProps.onOpenConversation(
              target.workspacePath,
              target.sessionId,
              target.workspaceIdentity,
            );
            return;
          }
        throw new Error("Existing native navigation callback unavailable.");
      },
      { ...before.target, sessionId: repair.sessionId },
    );
    await window
      .locator(`[data-testid^="v4-session-pane"][data-session-id="${repair.sessionId}"]:visible`)
      .waitFor();
    await window
      .getByRole("option", { name: new RegExp(REPAIR_QUESTION) })
      .waitFor({ timeout: 30000 });
    await capture(isolation, window, summary, "z5-accepted-uncertain-native-question");
    summary.navigation =
      "Mounted existing Graph onOpenConversation callback; exact native pane/session and actual pending question verified. No native/Graph state written.";
  }
  const inputs = await ledger(isolation),
    requests = modelCount(isolation);
  assert.equal(inputs.length, kind === "planned" ? 2 : 3);
  assert.equal(before.routing.admissions, kind === "planned" ? 4 : 5);
  if (kind === "accepted")
    assert.equal(
      inputs.find((row) => row.payload.intent.sourceCommandId === repair.inputId).session_id,
      repair.sessionId,
    );
  else assert.equal(repair.sessionId, undefined);
  summary.beforeRestart = before;
  await isolation.stopApp();
  delete isolation.env.Z5_GRAPH_BOUNDARY_PROFILE;
  delete isolation.env.Z5_GRAPH_BOUNDARY_KIND;
  window = await isolation.launch();
  await showGraph(window);
  let run = await waitRun(
    isolation,
    (value) => value.status === (kind === "planned" ? "AwaitingContinuation" : "Interrupted"),
  );
  assert.deepEqual(await ledger(isolation), inputs);
  assert.equal(modelCount(isolation), requests);
  assert.equal(run.routing.admissions, before.routing.admissions);
  assert.equal(run.routing.deadlineAt, before.routing.deadlineAt);
  assert.equal(run.routing.checkpoints.at(-1).id, checkpoint.id);
  await window.getByTestId("graph-region-select").click();
  await capture(isolation, window, summary, "z5-reopened-decision-boundary");
  if (kind === "planned") {
    if (scenario === "stale-continue")
      await writeFile(
        path.join(isolation.workspace, "NuGet.Config"),
        (await readFile(path.join(isolation.workspace, "NuGet.Config"), "utf8")) +
          "<!-- changed after original decision -->\n",
      );
    const button = window.getByTestId("graph-route-continue");
    assert.equal(await button.getAttribute("data-checkpoint-id"), checkpoint.id);
    assert.equal(await button.getAttribute("data-checkpoint-digest"), checkpoint.digest);
    await button.focus();
    await window.keyboard.press("Enter");
    await window.keyboard.press("Enter");
    run = await waitRun(
      isolation,
      (value) => value.status === (scenario === "stale-continue" ? "NeedsHuman" : "WaitingForUser"),
    );
    assert.equal((await ledger(isolation)).length, scenario === "stale-continue" ? 2 : 3);
    assert.equal(run.routing.admissions, scenario === "stale-continue" ? 4 : 5);
    assert.equal(run.routing.iterations.length, 2);
    if (scenario === "decision-restart") {
      assert.equal(run.routing.continuations.length, 1);
      summary.afterExplicitContinue = run;
      await window.getByTestId("graph-cancel").click();
      await waitRun(isolation, (value) => value.status === "Cancelled");
      assert.equal((await ledger(isolation)).length, 3);
    }
    await capture(isolation, window, summary, "z5-explicit-continuation-result");
  } else {
    const after = attemptFor(run, currentIteration(run), ids.repair);
    assert.equal(after.sessionId, repair.sessionId);
    assert.equal(after.inputId, repair.inputId);
    assert.equal(after.dispatchPhase, "sending");
    assert.equal(await window.getByTestId("graph-route-continue").count(), 0);
  }
  assert.deepEqual(isolation.fixture.errors, []);
  summary.assertions.push(
    "Original decision, selected route, budget and successor identity survive actual app restart. Reopening admits nothing; an explicit safe continuation admits at most one original successor, while unknown native input or changed source cannot replay.",
  );
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
