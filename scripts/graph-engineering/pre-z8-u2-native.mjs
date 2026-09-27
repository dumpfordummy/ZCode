import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { BAD_SOURCE, GOOD_SOURCE } from "./pre-z8-dotnet-source.mjs";
import {
  ledger,
  modelCount,
  nativeSessions,
  readGraphRecord,
  showGraph,
} from "./z5-native-observe.mjs";
import {
  prepareU2Fixture,
  prepareU2OfflineAssets,
  u2OwnedFile,
  u2Sha256,
} from "./pre-z8-u2-fixture.mjs";
import { withU2OwnedMutation } from "./pre-z8-u2-fault.mjs";
import { assertU2Preserved, verifyU2BuildBoundary, verifyU2Result } from "./pre-z8-u2-proof.mjs";
import { verifyU2ScanSelection } from "./pre-z8-u2-scan-workspace.mjs";
import { verifyU2TemplateGroup } from "./pre-z8-u2-template.mjs";
import {
  allowU2Permission,
  confirmU2Review,
  initializeU2NativeWorkspace,
  openU2Permission,
  runU2Probe,
  waitU2Run,
} from "./pre-z8-u2-boundaries.mjs";
import {
  captureNativeCheckpoint,
  configureU2Checks,
  preserveU2Design,
  prepareU2Review,
  rejectU2StaleReview,
  selectU2Checks,
  U2_CONFIG,
  U2_DIRTY_DESIGN,
} from "./pre-z8-u2-ui.mjs";

const scenario =
  process.argv.find((value) => value.startsWith("--scenario="))?.split("=")[1] ?? "pass";
assert.ok(
  [
    "pass",
    "fail",
    "zero",
    "skipped",
    "missing-required",
    "source-drift",
    "build-drift",
    "multi",
  ].includes(scenario),
  "Unknown isolated U2 scenario.",
);
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Refusing an inherited installed executable override.",
);
const isolation = await createIsolation();
const summary = {
  scenario: `pre-z8-u2-${scenario}`,
  home: isolation.home,
  workspace: isolation.workspace,
  startedAt: Date.now(),
  assertions: [],
  screenshots: [],
  notRun: [
    "Human/live-provider/company-project pilot",
    "Installed artifact, OS scaling and cross-platform qualification",
    "Z8",
  ],
};
console.error(`Pre-Z8 U2 ${scenario} isolated profile: ${isolation.home}`);
let window, failure;
try {
  summary.testedBuild = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/renderer/index.html",
    ].map(async (file) => ({ file, sha256: u2Sha256(await readFile(path.join(root, file))) })),
  );
  summary.fixture = await prepareU2Fixture(isolation);
  await prepareU2OfflineAssets(isolation, summary.fixture);
  await mkdir(path.join(isolation.workspace, ".zcode"));
  await writeFile(
    path.join(isolation.workspace, ".zcode/config.json"),
    `${JSON.stringify(U2_CONFIG, null, 2)}\n`,
    { flag: "wx" },
  );
  if (scenario === "fail") {
    const source = await u2OwnedFile(isolation, "MathOps.cs");
    assert.equal(await readFile(source, "utf8"), GOOD_SOURCE);
    await writeFile(source, BAD_SOURCE);
    summary.intentionalFailingSource = {
      file: "MathOps.cs",
      before: u2Sha256(GOOD_SOURCE),
      after: u2Sha256(BAD_SOURCE),
      timing: "after offline assets, before any UI review or Build",
    };
  }
  window = await isolation.launch();
  await initializeU2NativeWorkspace(isolation, window, summary);
  const saved = await preserveU2Design(isolation, window);
  if (scenario === "pass") await verifyU2ScanSelection(isolation, window, summary);
  const { configuration } = await configureU2Checks(isolation, window, summary, saved, scenario);
  if (scenario === "multi")
    await verifyU2TemplateGroup(isolation, window, summary, saved, configuration);
  let baseline = saved;
  if (scenario === "pass")
    baseline = await runU2Probe(isolation, window, summary, baseline, configuration);
  await selectU2Checks(window, "recipes", scenario);
  let preview = await prepareU2Review(
    isolation,
    window,
    summary,
    baseline,
    "pre-z8-u2-build-test-review",
  );
  if (scenario === "pass") {
    await rejectU2StaleReview(isolation, window, summary, baseline);
    preview = await prepareU2Review(
      isolation,
      window,
      summary,
      baseline,
      "pre-z8-u2-refreshed-build-test-review",
    );
  }
  summary.confirmedPreview = preview;
  const runId = await confirmU2Review(isolation, window, baseline, preview);
  summary.runId = runId;
  const buildNode = preview.definition.nodes.find(
    (node) => node.type === "tool" && node.recipeId === "native-u2-build",
  );
  const testNodes = preview.definition.nodes.filter(
    (node) => node.type === "tool" && node.recipeId.startsWith("native-u2-test-"),
  );
  assert.ok(
    buildNode && testNodes.length === (scenario === "multi" ? 2 : 1),
    "Reviewed transient checks must retain explicit recipe/node mappings.",
  );
  await openU2Permission(
    isolation,
    window,
    summary,
    runId,
    buildNode.id,
    "pre-z8-u2-build-native-permission",
  );
  await allowU2Permission(window);
  for (const [index, testNode] of testNodes.entries()) {
    await openU2Permission(
      isolation,
      window,
      summary,
      runId,
      testNode.id,
      `pre-z8-u2-test-${index + 1}-native-permission`,
    );
    if (index === 0)
      await verifyU2BuildBoundary(
        isolation,
        summary,
        (await readGraphRecord(isolation)).runs.find((run) => run.id === runId),
      );
    if (index < testNodes.length - 1) await allowU2Permission(window);
  }
  const inspectResult = async () => {
    await allowU2Permission(window);
    const run = await waitU2Run(isolation, runId, (value) =>
      ["Completed", "Failed"].includes(value.status),
    );
    await verifyU2Result(isolation, window, summary, run, preview, scenario);
    return run;
  };
  let run;
  if (scenario === "source-drift" || scenario === "build-drift") {
    const fault = await withU2OwnedMutation(
      isolation,
      scenario === "source-drift" ? "source" : "build",
      inspectResult,
    );
    summary.permissionBoundaryRestoration = fault.receipt;
    run = fault.value;
  } else run = await inspectResult();
  await assertU2Preserved(isolation, baseline, configuration);
  assert.equal(
    await readFile(await u2OwnedFile(isolation, "MathOps.cs"), "utf8"),
    scenario === "fail" ? BAD_SOURCE : GOOD_SOURCE,
  );
  await showGraph(window);
  await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-result-1280");
  await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-result-1920", [1920, 1080]);
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), U2_DIRTY_DESIGN);
  summary.assertions.push(
    "Transient checks append exact new native history while saved revision, dirty design, prior history, configuration and independent assertion/adapter bytes remain unchanged.",
  );
  if (scenario === "pass") {
    const before = await readGraphRecord(isolation);
    await isolation.stopApp();
    window = await isolation.launch();
    await showGraph(window);
    await window.getByTestId("graph-view-runs").click();
    await window.locator(`[data-testid="graph-run"][data-run-id="${runId}"]`).click();
    assert.deepEqual(await readGraphRecord(isolation), before);
    await assertU2Preserved(isolation, baseline, configuration);
    await verifyU2Result(isolation, window, { assertions: [] }, run, preview, scenario, {
      reopened: true,
    });
    await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-reopened-no-replay");
    summary.assertions.push(
      "Owned-profile restart retained the exact completed checks run and original evidence identities without replay or model admission.",
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
    await captureNativeCheckpoint(isolation, window, summary, "pre-z8-u2-failure").catch(
      (error) => {
        summary.screenshotFailure = String(error);
      },
    );
}
summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
summary.nativeLedger = await ledger(isolation).catch(() => undefined);
try {
  summary.nativeSessions = nativeSessions(isolation, summary.finalRecord?.runs?.at(-1));
} catch (error) {
  summary.ledgerReadError = String(error);
  summary.status = "FAIL";
  process.exitCode = 1;
}
summary.nativeToolResults = isolation.fixture.toolResults;
summary.modelRequests = modelCount(isolation);
summary.completedAt = Date.now();
const receipt = path.join(isolation.home, "pre-z8-u2-summary.json");
await writeFile(receipt, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify(
    {
      status: summary.status,
      scenario: summary.scenario,
      home: summary.home,
      receipt,
      error: summary.error,
      assertions: summary.assertions,
      screenshots: summary.screenshots,
      runId: summary.runId,
      modelRequests: summary.modelRequests,
    },
    null,
    2,
  ),
);
await isolation.close();
