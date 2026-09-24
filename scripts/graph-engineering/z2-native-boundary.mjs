import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { startZ2Fixture } from "./z2-provider-fixture.mjs";
import {
  captureNative,
  createSequentialGraph,
  readGraphRecord,
  readNativeLedger,
} from "./z2-native-helpers.mjs";

const isolation = await createIsolation({ fixtureFactory: startZ2Fixture });
isolation.env.Z2_GRAPH_BOUNDARY_PROFILE = isolation.home;
const summary = {
  scenario: "restart-dispatch-boundary",
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window;
const capture = async (name) => {
  const file = path.join(isolation.home, `${name}.png`);
  await captureNative(isolation, window, file);
  summary.screenshots.push(file);
};
try {
  window = await isolation.launch({
    bootstrapEntry: path.join(root, "scripts/graph-engineering/z2-boundary-bootstrap.cjs"),
  });
  await createSequentialGraph(window, summary);
  await window.getByTestId("graph-run-button").click();
  const checkpointFile = path.join(isolation.home, "z2-boundary-checkpoint.json");
  const deadline = Date.now() + 45000;
  while (!summary.checkpoint) {
    try {
      summary.checkpoint = JSON.parse(await readFile(checkpointFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (Date.now() > deadline)
      throw new Error("The actual persisted predecessor boundary was not reached.");
    if (!summary.checkpoint) await wait(25);
  }
  const before = summary.checkpoint.persisted.runs.at(-1);
  assert.equal(before.nodeAttempts[0].status, "Completed");
  assert.equal(before.nodeAttempts[1].status, "Pending");
  assert.equal(before.nodeAttempts[1].sessionId, undefined);
  const ledger = readNativeLedger(isolation);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].payload.intent.sourceCommandId, before.nodeAttempts[0].commandId);
  assert.equal(before.nodeAttempts[0].finalOutput.text, isolation.fixture.outputs.analyze);
  assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
  summary.assertions.push(
    "Actual native Analyze Read/Read input finished and exact proof/output was persisted; intercepted next metadata write remains blocked before successor session creation",
  );
  await capture("z2-persisted-boundary");
  await isolation.stopApp();
  delete isolation.env.Z2_GRAPH_BOUNDARY_PROFILE;
  const requests = isolation.fixture.requests.filter((request) => request.model).length;
  window = await isolation.launch();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  await window
    .locator('[data-testid="graph-run"][data-status="Interrupted"]')
    .waitFor({ timeout: 30000 });
  const interrupted = (await readGraphRecord(isolation)).runs.at(-1);
  assert.equal(interrupted.id, before.id);
  assert.deepEqual(interrupted.nodeAttempts, before.nodeAttempts);
  assert.deepEqual(readNativeLedger(isolation), ledger);
  assert.equal(isolation.fixture.requests.filter((request) => request.model).length, requests);
  assert.match(await isolation.readFixture(), /Z1_BEFORE_7391/);
  summary.interruptedRun = interrupted;
  summary.nativeLedger = ledger;
  summary.assertions.push(
    "Actual app restart at that persisted boundary preserves completed predecessor evidence and pending successors without new session, initial input or provider traffic",
  );
  await capture("z2-boundary-reopened");
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error instanceof Error ? error.stack : String(error);
  if (window) {
    summary.body = await window
      .locator("body")
      .innerText()
      .catch(() => "Unavailable");
    await capture("z2-boundary-failure").catch((error) => {
      summary.screenshotError = String(error);
    });
  }
  process.exitCode = 1;
} finally {
  await writeFile(path.join(isolation.home, "z2-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
