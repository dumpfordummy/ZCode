import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { prepareSourceFixture, AFTER_SOURCE } from "./z3-fixture.mjs";
import { prepareU3Fixture, U3_REQUEST, u3Sha256 } from "./pre-z8-u3-fixture.mjs";
import { startU3Fixture } from "./pre-z8-u3-provider.mjs";
import {
  assertU3FixturePreserved,
  assertU3Idle,
  captureU3,
  initializeU3Workspace,
  instantiateU3Draft,
  ledger,
  modelCount,
  readGraphRecord,
  selectValue,
  showGraph,
  U3_STATIC_RECIPES,
} from "./pre-z8-u3-common.mjs";
import { prepareU3SecondaryWorkspace } from "./pre-z8-u3-workspace.mjs";
import { selectU3NativeInstructions, verifyU3References } from "./pre-z8-u3-references.mjs";
import { verifyU3Context } from "./pre-z8-u3-context.mjs";
import {
  instantiateU3Repair,
  verifyU3InvalidBuffers,
  verifyU3LosslessTask,
  verifyU3RepairPolicy,
} from "./pre-z8-u3-editor.mjs";
import { verifyU3Canvas } from "./pre-z8-u3-canvas.mjs";
import {
  assertU3CapturedPrompts,
  driveU3ToGate,
  finishU3Graph,
  verifyU3LaterChat,
} from "./pre-z8-u3-native-proof.mjs";

const scenario =
  process.argv.find((value) => value.startsWith("--scenario="))?.split("=")[1] ?? "editor";
assert.ok(["editor", "handoff"].includes(scenario));
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Refusing inherited installed executable override.",
);
const isolation = await createIsolation({ fixtureFactory: startU3Fixture });
const summary = {
  scenario: `pre-z8-u3-${scenario}`,
  home: isolation.home,
  workspace: isolation.workspace,
  startedAt: Date.now(),
  assertions: [],
  screenshots: [],
  notRun: [
    "Actual operating-system file dialog interaction (controlled owned platform response seam only)",
    "Human novice/live-provider/company-project pilot",
    "Installed artifact, OS scaling and cross-platform qualification",
    "fixture.test.mjs is intentionally not executed",
    "Z8",
  ],
};
console.error(`Pre-Z8 U3 isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.testedBuild = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/renderer/index.html",
    ].map(async (file) => ({ file, sha256: u3Sha256(await readFile(path.join(root, file))) })),
  );
  summary.fixture = { references: await prepareU3Fixture(isolation) };
  summary.fixture.source = await prepareSourceFixture(isolation);
  const originalTest = await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8");
  const originalSource = await isolation.readFixture();
  let configuration;
  if (scenario === "editor") {
    await mkdir(path.join(isolation.workspace, ".zcode"));
    configuration = JSON.stringify({ graphRecipes: U3_STATIC_RECIPES }, null, 2);
    await writeFile(path.join(isolation.workspace, ".zcode/config.json"), configuration, {
      flag: "wx",
    });
    summary.staticRecipePreparation = { recipes: U3_STATIC_RECIPES, executed: false };
  }
  window = await isolation.launch();
  await initializeU3Workspace(isolation, window, summary);
  const secondary =
    scenario === "editor"
      ? await prepareU3SecondaryWorkspace(isolation, window, summary)
      : undefined;
  await window.getByTestId("graph-view-workflows").click();
  await selectValue(window, "graph-library-entry", "agent-assisted");
  await window.getByTestId("graph-template-parameter-request").fill(U3_REQUEST);
  if (scenario === "editor") await verifyU3References(isolation, window, summary, secondary);
  else await selectU3NativeInstructions(isolation, window, summary);
  const instantiated = await instantiateU3Draft(isolation, window, "agent-assisted");
  assert.equal(instantiated.definition.template.bindings.referencePolicy, "native-aware-v1");
  assert.equal(instantiated.definition.template.bindings.references.instructions, "AGENTS.md");
  await verifyU3Context(isolation, window, summary);
  if (scenario === "editor") {
    await verifyU3LosslessTask(isolation, window, summary);
    await instantiateU3Repair(isolation, window, summary);
    await verifyU3InvalidBuffers(isolation, window, summary, secondary);
    await verifyU3RepairPolicy(isolation, window, summary);
    await verifyU3Canvas(isolation, window, summary);
    assert.equal(
      await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
      configuration,
    );
    await assertU3FixturePreserved(isolation, originalTest, originalSource);
    await assertU3Idle(isolation, "entire editor journey");
  } else {
    await window.getByTestId("graph-run-button").click();
    await window.getByTestId("graph-run-confirmation").waitFor();
    const snapshot = JSON.parse(
      await window.getByTestId("graph-confirmation-definition").locator("pre").textContent(),
    );
    assert.equal(snapshot.definition.template.id, "agent-assisted");
    assert.equal(
      snapshot.provenance.references.find((item) => item.id === "instructions").delivery,
      "native-instructions",
    );
    assert.equal(await window.getByTestId("graph-confirm-run").isDisabled(), true);
    await assertU3Idle(isolation, "frozen preflight before explicit confirmation");
    await captureU3(isolation, window, summary, "pre-z8-u3-native-aware-preflight");
    summary.confirmedSnapshot = snapshot;
    await window.getByTestId("graph-preflight-ack").setChecked(true);
    await window.getByTestId("graph-confirm-run").click();
    await showGraph(window);
    const gate = await driveU3ToGate(isolation, window, summary);
    assert.deepEqual(gate.definition, snapshot.definition);
    const inputs = await assertU3CapturedPrompts(isolation, summary, gate);
    await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
    const completed = await finishU3Graph(isolation, window, summary, gate);
    summary.runId = completed.id;
    summary.completedRun = completed;
    await verifyU3LaterChat(isolation, window, summary, completed, inputs);
    await assertU3FixturePreserved(isolation, originalTest, AFTER_SOURCE);
    assert.deepEqual(isolation.fixture.errors, []);
    summary.assertions.push(
      "Existing native question, Edit permission and required final approval retain exact native ownership. Only fixture.mjs changes; the independent test file remains byte-identical and no configured checks are claimed.",
    );
  }
} catch (error) {
  failure = error;
}
summary.status = failure ? "FAIL" : "PASS";
if (failure) {
  process.exitCode = 1;
  summary.error = failure instanceof Error ? failure.stack : String(failure);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window)
    await captureU3(isolation, window, summary, "pre-z8-u3-failure").catch((error) => {
      summary.screenshotFailure = String(error);
    });
}
summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
summary.nativeLedger = await ledger(isolation).catch(() => undefined);
summary.modelRequests = modelCount(isolation);
summary.nativeToolCalls = isolation.fixture.toolCalls;
summary.nativeToolResults = isolation.fixture.toolResults;
summary.fixtureErrors = isolation.fixture.errors;
summary.completedAt = Date.now();
const receipt = path.join(isolation.home, "pre-z8-u3-summary.json");
await writeFile(receipt, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify(
    {
      status: summary.status,
      scenario: summary.scenario,
      home: summary.home,
      receipt,
      error: summary.error,
      runId: summary.runId,
      assertions: summary.assertions,
      screenshots: summary.screenshots,
      modelRequests: summary.modelRequests,
    },
    null,
    2,
  ),
);
await isolation.close();
