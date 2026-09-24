import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createIsolation, instruction } from "./isolation.mjs";
import {
  captureNative,
  readGraphRecord,
  readNativeLedger,
  waitForSaved,
} from "./z2-native-helpers.mjs";

const isolation = await createIsolation();
const summary = {
  scenario: "z1-literal-compatibility",
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
  window = await isolation.launch();
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-name").fill("Z1 literal compatibility under Z2");
  const literal = `${instruction}\nLiteral compatibility token remains unchanged: {{inputs.unbound}}`;
  await window.getByTestId("graph-instructions").fill(literal);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  assert.equal((await readGraphRecord(isolation)).definition.version, undefined);
  await window.getByTestId("graph-run-button").click();
  await window.getByTestId("graph-view-runs").click();
  await window
    .locator('[data-testid="graph-run"][data-status="WaitingForPermission"]')
    .waitFor({ timeout: 45000 });
  const waiting = (await readGraphRecord(isolation)).runs.at(-1);
  await window.getByTestId("graph-open-conversation").click();
  assert.equal(
    await window
      .locator('[data-testid^="v4-session-pane"]:visible')
      .first()
      .getAttribute("data-session-id"),
    waiting.sessionId,
  );
  await window.getByTestId("graph-input-owned").waitFor();
  await window.getByRole("option", { name: "Allow", exact: true }).press("Enter");
  await window.waitForFunction(
    () =>
      document.body.innerText.includes("Controlled provider finished") ||
      document.querySelector('[data-permission-option-kind="allowOnce"]'),
    null,
    { timeout: 45000 },
  );
  const allow = window.getByRole("option", { name: "Allow", exact: true });
  if (await allow.isVisible()) await allow.press("Enter");
  await window
    .getByText("Controlled provider finished the native Read, Edit, and Bash sequence.", {
      exact: false,
    })
    .waitFor({ timeout: 45000 });
  assert.match(await isolation.readFixture(), /Z1_AFTER_7391/);
  summary.testOutput = (
    await promisify(execFile)(process.execPath, ["--test", "fixture.test.mjs"], {
      cwd: isolation.workspace,
      env: isolation.env,
    })
  ).stdout;
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  await window.locator('[data-testid="graph-run"][data-status="Completed"]').waitFor();
  const completed = (await readGraphRecord(isolation)).runs.at(-1);
  const ledger = readNativeLedger(isolation);
  assert.equal(completed.version, undefined);
  assert.equal(completed.sessionId, waiting.sessionId);
  assert.equal(completed.definition.instructions, literal);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].payload.text, literal);
  summary.completedRun = completed;
  summary.nativeLedger = ledger;
  summary.assertions.push(
    "Unversioned Z1 runs through unchanged native Read/Edit/Bash with its literal template preserved, one exact session/input, and independent fixture test",
  );
  await capture("z1-compatible-completed");
  await isolation.stopApp();
  const beforeRequests = isolation.fixture.requests.filter((request) => request.model).length;
  window = await isolation.launch();
  if (!(await window.getByTestId("graph-engineering-panel").isVisible()))
    await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  await window.locator('[data-testid="graph-run"][data-status="Completed"]').waitFor();
  assert.deepEqual((await readGraphRecord(isolation)).runs.at(-1), completed);
  assert.deepEqual(readNativeLedger(isolation), ledger);
  assert.equal(
    isolation.fixture.requests.filter((request) => request.model).length,
    beforeRequests,
  );
  summary.assertions.push(
    "Completed Z1 history reopens in Z2 Runs without migration, semantic reinterpretation, new session or new native/provider input",
  );
  await capture("z1-compatible-reopened");
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error instanceof Error ? error.stack : String(error);
  if (window) {
    summary.body = await window
      .locator("body")
      .innerText()
      .catch(() => "Unavailable");
    await capture("z1-compatible-failure").catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await writeFile(path.join(isolation.home, "z2-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await isolation.close();
}
