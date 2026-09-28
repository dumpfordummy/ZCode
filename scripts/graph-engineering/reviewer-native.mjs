import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { startZ6Fixture } from "./z6-provider-fixture.mjs";
import { startNativeTemplate } from "./z6-native-ui.mjs";
import {
  driveUntil,
  ledger,
  nativeSessions,
  readGraphRecord,
  selectAttempt,
  showGraph,
} from "./z5-native-observe.mjs";
import { prepareReviewerFixture, REQUEST } from "./reviewer-native-fixture.mjs";
import { reviewerNativeResponse, SCENARIOS } from "./reviewer-native-responses.mjs";
import { instantiateReviewer, captureReviewerSizes } from "./reviewer-native-ui.mjs";
import { proveReviewerNative } from "./reviewer-native-proof.mjs";

const scenario = process.argv.find((arg) => arg.startsWith("--scenario="))?.slice(11) ?? "pass";
assert.ok(SCENARIOS.includes(scenario));
assert.equal(
  process.env.Z1_PACKAGED_EXE,
  undefined,
  "Use only the newly built isolated application.",
);
const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ6Fixture(workspace, scenario, reviewerNativeResponse),
});
const summary = {
  scenario,
  home: isolation.home,
  workspace: isolation.workspace,
  startedAt: Date.now(),
  screenshots: [],
  assertions: [],
  notRun: ["Live model adherence", "Final human approval", "Publication", "Z8"],
};
const evidence = path.join(
  root,
  "docs/graph-engineering/next-iteration/evidence",
  `${scenario}-${path.basename(isolation.home)}`,
);
await mkdir(evidence, { recursive: true });
console.error(`Reviewer ${scenario}: ${isolation.home}`);
let window, failure;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  const renderer = (await readdir(path.join(root, "packages/desktop/out/renderer/assets"))).filter(
    (file) => file.endsWith(".js"),
  );
  summary.testedBuild = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/preload/index.cjs",
      ...renderer.map((file) => `packages/desktop/out/renderer/assets/${file}`),
    ].map(async (file) => ({ file, sha256: hash(await readFile(path.join(root, file))) })),
  );
  const files = await prepareReviewerFixture(isolation);
  window = await isolation.launch();
  await instantiateReviewer(isolation, window, summary, scenario === "pass");
  await startNativeTemplate(isolation, window, summary);
  const run = await driveUntil(isolation, window, summary, (value) =>
    ["Failed", "WaitingForApproval", "NeedsHuman"].includes(value.status),
  );
  summary.executionReached = { runId: run.id, status: run.status };
  await proveReviewerNative(isolation, window, summary, run, files);
  await showGraph(window);
  const row = window.locator(`[data-testid="graph-run"][data-run-id="${run.id}"]`);
  await row.focus();
  await row.press("Enter");
  assert.equal(await row.getAttribute("aria-current"), "true");
  assert.ok((await row.innerText()).includes(run.definition.name));
  assert.equal(await window.getByTestId("graph-run-request-preview").innerText(), REQUEST);
  assert.equal(await window.getByTestId("graph-run-no-action").count(), 0);
  const invalidOutput = ["prose-fence", "unbound-report"].includes(scenario);
  assert.equal(
    await window.getByTestId("graph-run-output-validation-failed").count(),
    invalidOutput ? 1 : 0,
  );
  const output = window.getByTestId("graph-run-structured-output");
  if (scenario === "test-failure") assert.equal(await output.count(), 0);
  else assert.equal(await output.getAttribute("data-state"), invalidOutput ? "invalid" : scenario);
  if (scenario !== "test-failure")
    await selectAttempt(
      window,
      run.nodeAttempts.find((item) => item.nodeId === "reviewer"),
    );
  if (["pass", "prose-fence", "unbound-report"].includes(scenario))
    await captureReviewerSizes(
      isolation,
      window,
      summary,
      scenario === "pass"
        ? "normal-runs-reviewer-pass-pending-human"
        : `negative-${scenario}-output-validation`,
      "graph-run-summary",
    );
  summary.uiText = await window.locator("body").innerText();
} catch (error) {
  failure = error;
  summary.error = error.stack ?? String(error);
  if (window) {
    summary.uiText = await window
      .locator("body")
      .innerText()
      .catch(() => "Unavailable");
    await captureReviewerSizes(isolation, window, summary, `failed-attempt-${scenario}`).catch(
      () => {},
    );
  }
} finally {
  summary.status = failure ? "FAIL" : "PASS";
  summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  summary.nativeSessions = nativeSessions(isolation, summary.finalRecord?.runs.at(-1));
  summary.providerRequests = isolation.fixture.requests;
  summary.nativeToolResults = isolation.fixture.toolResults;
  summary.providerErrors = isolation.fixture.errors;
  summary.finishedAt = Date.now();
  for (const file of summary.screenshots)
    await copyFile(file, path.join(evidence, path.basename(file)));
  if (summary.machineEvidence) {
    for (const name of ["verification", "report"]) {
      const retained = summary.machineEvidence[name];
      await writeFile(
        path.join(evidence, `${name}-${retained.artifact.id}.json`),
        retained.content,
      );
    }
  }
  await writeFile(
    path.join(isolation.home, "reviewer-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  await writeFile(path.join(evidence, "summary.json"), JSON.stringify(summary, null, 2));
  await isolation.close();
  await copyFile(path.join(isolation.home, "native.log"), path.join(evidence, "native.log"));
  console.log(
    JSON.stringify(
      {
        status: summary.status,
        scenario,
        evidence,
        runId: summary.executionReached?.runId,
        error: summary.error,
      },
      null,
      2,
    ),
  );
  if (failure) process.exitCode = 1;
}
