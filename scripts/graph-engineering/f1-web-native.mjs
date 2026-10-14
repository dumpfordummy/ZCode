import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir, cp } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createHash } from "node:crypto";
import { createIsolation } from "./isolation.mjs";
import { configureDotnetEnvironment, runDotnet } from "./z4-fixture.mjs";
import { webProfileEnvironment } from "../../packages/shared/src/node/webProfileProvenance.ts";
import { WEB_PROFILE_CONTROLS } from "../../packages/shared/src/web-profile.ts";
import { ensureShellFolders } from "./ux-m2-native-common.mjs";
import { openNewRun, T, shot } from "./ux-m1-native-common.mjs";
import { readGraphRecord, modelCount, ledger, showGraph } from "./z5-native-observe.mjs";
import {
  initializeU2NativeWorkspace,
  openU2Permission,
  allowU2Permission,
  waitU2Run,
} from "./pre-z8-u2-boundaries.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";
import { observeFixtureTrx } from "./pre-z8-dotnet-fixture.mjs";

assert.ok(process.argv.includes("--source") && !process.env.Z1_PACKAGED_EXE);
const source = process.env.F1_WEB_ORACLE_WORKSPACE,
  cache = process.env.F1_PUBLIC_PACKAGE_CACHE;
assert.ok(source && cache, "Explicit retained synthetic source and public cache required");
const isolation = await createIsolation({ extraEnv: { ZCODE_GRAPH_DIAGNOSTICS: "1" } });
const start = performance.now(),
  summary = {
    home: isolation.home,
    evidenceDir: isolation.home,
    cases: [],
    screenshots: [],
    phases: [],
    status: "RUNNING",
  };
let window;
const mark = (phase) => {
  const row = { phase, elapsedMs: performance.now() - start };
  summary.phases.push(row);
  console.error(JSON.stringify(row));
};
const record = () =>
  readGraphRecord(isolation).catch((e) => {
    if (e.code === "ENOENT") return { runs: [] };
    throw e;
  });
async function history() {
  const folder = path.join(isolation.home, "data/.zcode/v2/graph-engineering/graph-inspections-v1");
  try {
    const files = (await readdir(folder)).filter((n) => n.endsWith(".json"));
    return files.length ? JSON.parse(await readFile(path.join(folder, files[0]), "utf8")) : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
// One bounded external observer, used serially. Never restarts or overlaps native operations.
async function until(predicate, label) {
  const deadline = performance.now() + 900000;
  let lastObservation = 0;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    if (window && performance.now() - lastObservation > 10000) {
      lastObservation = performance.now();
      const alerts = await window.getByRole("alert").allTextContents();
      await writeFile(
        path.join(isolation.home, "f1-web-native-live.json"),
        JSON.stringify(
          {
            label,
            elapsedMs: performance.now() - start,
            alerts,
            body: (await window.locator("body").innerText()).slice(-20000),
          },
          null,
          2,
        ),
      );
      if (label === "Save complete" && alerts.length)
        throw Error("Save failed: " + alerts.join("; "));
    }
    await wait(250);
  }
  throw Error("Bounded Web observer expired: " + label);
}
async function noEvidence() {
  assert.equal((await record()).runs.length, 0);
  assert.equal(modelCount(isolation), 0);
}
async function setup() {
  await showGraph(window);
  await T(window, "graph-view-setup").click();
}
async function findProfile() {
  await T(window, "graph-quick-scan").click();
  await T(window, "graph-quick-build").waitFor();
  if ((await T(window, "graph-quick-build").textContent()) !== "Web/Web.csproj") {
    await T(window, "graph-quick-build").click();
    await window.locator('[role="option"][data-value="Web/Web.csproj"]').click();
  }
  const panel = T(window, "graph-web-profile");
  await panel.waitFor();
  await panel.getByTestId("graph-web-find").click();
  await until(
    async () => await panel.getByTestId("graph-web-role-web").count(),
    "matching test closure",
  );
  const select = panel.getByRole("combobox").first();
  assert.match(await select.textContent(), /Tests\/Tests.csproj/);
  await select.click();
  assert.equal(await window.locator('[role="option"][data-value="Other/Other.csproj"]').count(), 0);
  await window.locator('[role="option"][data-value="Tests/Tests.csproj"]').click();
  return panel;
}
async function inspectProfile(role) {
  const panel = await findProfile();
  await panel.getByTestId(`graph-web-role-${role}`).click();
  const inspection = panel.getByTestId("graph-project-inspection");
  await inspection
    .getByRole("button", { name: "Inspect with installed MSBuild", exact: true })
    .click();
  await until(
    async () => (await inspection.getAttribute("data-status")) === "review-ready",
    role + " review",
  );
  const row = (await history()).at(-1);
  assert.equal(row.request.inspection.purpose, "project-web-profile-inspection-v1");
  mark(role + "-review-ready");
  await shot(isolation, window, summary, role + "-review", [1600, 1000]);
  await noEvidence();
  await inspection
    .getByRole("button", { name: "Confirm inspection and request native permission", exact: true })
    .click();
  await until(
    async () => (await inspection.getAttribute("data-status")) === "awaiting-permission",
    role + " permission request",
  );
  await inspection.getByTestId("graph-inspection-conversation").click();
  await window.getByRole("option", { name: "Allow", exact: true }).waitFor();
  await approveNativePermissionOnce(window);
  mark(role + "-permission-allowed");
  await setup();
  const recovery = T(window, "graph-inspection-recovery");
  await recovery.locator("summary").click();
  const retained = recovery.locator(`[data-operation-id="${row.id}"]`);
  await retained.waitFor();
  await until(async () => {
    await retained.getByRole("button", { name: "Check original operation", exact: true }).click();
    const status = await retained.getAttribute("data-status");
    if (
      ["failed", "expired", "source-changed", "invalid-output", "executor-lost", "denied"].includes(
        status,
      )
    )
      throw Error(role + " inspection ended " + status);
    return status === "succeeded";
  }, role + " success");
  const complete = (await history()).find((r) => r.id === row.id);
  assert.equal(complete.reserved, false);
  await noEvidence();
  summary.cases.push({
    name: role + "-owned-inspection",
    id: row.id,
    status: "PASS",
    projection: complete.projection,
    timings: complete.timings,
  });
  mark(role + "-inspection-complete");
}
try {
  await configureDotnetEnvironment(isolation);
  for (const name of ["Web", "Tests"])
    await cp(path.join(source, name), path.join(isolation.workspace, name), {
      recursive: true,
      filter: (file) =>
        !file.split(path.sep).some((part) => ["bin", "obj", ".zcode", ".git"].includes(part)),
    });
  for (const name of ["global.json", "NuGet.Config", "Directory.Build.props"])
    await cp(path.join(source, name), path.join(isolation.workspace, name));
  await mkdir(path.join(isolation.workspace, "Other"));
  await writeFile(
    path.join(isolation.workspace, "Other/Other.csproj"),
    '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><IsTestProject>true</IsTestProject></PropertyGroup></Project>',
  );
  for (let i = 0; i < 40; i++)
    await writeFile(
      path.join(isolation.workspace, `Web/Source${String(i).padStart(2, "0")}.cs`),
      "// synthetic source " + i,
    );
  const env = webProfileEnvironment(isolation.workspace, {
    executable: "C:\\Program Files\\dotnet\\dotnet.exe",
    packageRoot: cache,
    systemRoot: process.env.SystemRoot,
  });
  for (const key of [
    "HOME",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "DOTNET_CLI_HOME",
    "MSBuildUserExtensionsPath",
    "PROGRAMFILES",
    "PROGRAMDATA",
  ])
    await mkdir(env[key], { recursive: true });
  const bootstrap = await runDotnet({ ...isolation, env }, [
    "restore",
    "Tests/Tests.csproj",
    "--configfile",
    "NuGet.Config",
    "--packages",
    cache,
    "-p:NuGetAudit=false",
    "--disable-parallel",
    ...WEB_PROFILE_CONTROLS,
  ]);
  assert.equal(bootstrap.exitCode, 0, bootstrap.stdout + bootstrap.stderr);
  summary.bootstrap = { ...bootstrap, productSetupRestore: false, offlineCachedFixtureOnly: true };
  mark("fixture-ready");
  await ensureShellFolders(isolation);
  window = await isolation.launch();
  window.setDefaultTimeout(900000);
  await initializeU2NativeWorkspace(isolation, window, summary);
  await openNewRun(window);
  await T(window, "graph-library-entry").click();
  await window.locator('[role="option"][data-value="generic"]').click();
  await T(window, "graph-template-parameter-request").fill("Synthetic Web profile checks");
  await T(window, "graph-template-setup-checks").click();
  await inspectProfile("web");
  await inspectProfile("test");
  const panel = await findProfile();
  await panel.getByTestId("graph-web-prepare").click();
  await until(async () => {
    const alerts = await panel.getByRole("alert").allTextContents();
    if (alerts.length) throw Error(alerts.join("\n"));
    return await panel.getByTestId("graph-web-proposal").count();
  }, "complete profile proposal");
  await shot(isolation, window, summary, "web-proposal", [1600, 1000]);
  await noEvidence();
  mark("proposal-ready");
  await panel.getByTestId("graph-web-save").click();
  const configPath = path.join(isolation.workspace, ".zcode/config.json");
  await until(async () => {
    try {
      return JSON.parse(await readFile(configPath, "utf8")).graphRecipes?.length === 2;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  }, "Save complete");
  const configuration = await readFile(configPath, "utf8"),
    recipes = JSON.parse(configuration).graphRecipes;
  assert.ok(recipes.every((r) => r.sourceScope.version === 3));
  assert.ok(
    recipes.every(
      (r) => r.verifier.kind !== "build" || r.verifier.dotnet.project === "Tests/Tests.csproj",
    ),
  );
  assert.ok(recipes[0].sourceScope.sourceCount > 40);
  await noEvidence();
  summary.cases.push({
    name: "profile-save",
    status: "PASS",
    sourceCount: recipes[0].sourceScope.sourceCount,
    scope: recipes[0].sourceScope,
  });
  mark("configuration-saved");
  await isolation.stopApp();
  window = await isolation.launch();
  window.setDefaultTimeout(900000);
  await setup();
  assert.equal(await readFile(configPath, "utf8"), configuration);
  await noEvidence();
  await shot(isolation, window, summary, "web-reopened", [1600, 1000]);
  mark("reopened-no-replay");
  await T(window, "graph-check-prepare").click();
  await T(window, "graph-check-preview").waitFor();
  const preview = JSON.parse(await T(window, "graph-check-preview-snapshot").textContent());
  const before = await record();
  await T(window, "graph-check-ack").setChecked(true);
  await T(window, "graph-check-confirm").click();
  await T(window, "graph-check-preview").waitFor({ state: "hidden" });
  await showGraph(window);
  let runId;
  await until(async () => {
    const added = (await record()).runs.filter((r) => !before.runs.some((p) => p.id === r.id));
    assert.ok(added.length <= 1);
    runId = added[0]?.id;
    return !!runId;
  }, "run admission");
  for (const node of preview.definition.nodes.filter((n) => n.type === "tool")) {
    await openU2Permission(isolation, window, summary, runId, node.id, "web-" + node.id, 900000);
    await allowU2Permission(window);
    mark(node.id + "-allowed");
  }
  const run = await waitU2Run(
    isolation,
    runId,
    (r) => ["Completed", "Failed"].includes(r.status),
    900000,
  );
  const build = run.toolAttempts.find((a) => a.recipe.verifier.kind === "build"),
    test = run.toolAttempts.find((a) => a.recipe.verifier.kind === "test");
  assert.equal(run.status, "Completed");
  assert.equal(build.verification.acceptancePassed, true);
  assert.equal(test.verification.observationValid, true);
  assert.equal(test.verification.acceptancePassed, true);
  assert.equal(test.buildDigest, build.outputDigest);
  const bytes = await readFile(path.join(isolation.workspace, test.resolvedReportPath));
  const trx = observeFixtureTrx(bytes.toString("utf8"));
  assert.equal(trx.counters.total, 3);
  assert.equal(trx.counters.passed, 3);
  assert.equal(trx.counters.failed, 0);
  assert.deepEqual(trx.results.map((t) => t.testName).sort(), [
    "WebTests.ApplicationResult",
    "WebTests.ImplicitConfiguration",
    "WebTests.StaticContentManifest",
  ]);
  summary.cases.push({
    name: "saved-reopened-real-build-test",
    status: "PASS",
    runId,
    buildOperation: build.operationId,
    testOperation: test.operationId,
    verification: test.verification,
    reportSha256: createHash("sha256").update(bytes).digest("hex"),
    trx,
  });
  mark("real-test-passed");
  assert.equal(modelCount(isolation), 0);
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error.stack ?? String(error);
  process.exitCode = 1;
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "unavailable");
  if (window) await shot(isolation, window, summary, "web-failure").catch(() => {});
} finally {
  summary.history = await history();
  summary.record = await record();
  summary.models = modelCount(isolation);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  await writeFile(
    path.join(isolation.home, "f1-web-native-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    JSON.stringify({
      status: summary.status,
      home: isolation.home,
      error: summary.error,
      cases: summary.cases.map((c) => ({ name: c.name, status: c.status })),
    }),
  );
  await isolation.close();
}
