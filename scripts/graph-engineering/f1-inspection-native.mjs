import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createIsolation } from "./isolation.mjs";
import { configureDotnetEnvironment } from "./z4-fixture.mjs";
import { ensureShellFolders } from "./ux-m2-native-common.mjs";
import { openNewRun, T, shot } from "./ux-m1-native-common.mjs";
import { readGraphRecord, modelCount, ledger, showGraph } from "./z5-native-observe.mjs";
import { initializeU2NativeWorkspace } from "./pre-z8-u2-boundaries.mjs";
import { approveNativePermissionOnce } from "./native-permission.mjs";

assert.ok(process.argv.includes("--source") && !process.env.Z1_PACKAGED_EXE);
const isolation = await createIsolation({ extraEnv: { ZCODE_GRAPH_DIAGNOSTICS: "1" } });
const summary = {
  executionPath: "compiled-source-isolated-bootstrap",
  cases: [],
  screenshots: [],
  home: isolation.home,
  evidenceDir: isolation.home,
};
let window;
async function histories() {
  const folder = path.join(isolation.home, "data/.zcode/v2/graph-engineering/graph-inspections-v1");
  try {
    const files = (await readdir(folder)).filter((name) => name.endsWith(".json"));
    assert.ok(files.length <= 1);
    return files.length ? JSON.parse(await readFile(path.join(folder, files[0]), "utf8")) : [];
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}
async function noEvidence() {
  const record = await readGraphRecord(isolation).catch((e) => {
    if (e.code === "ENOENT") return { runs: [] };
    throw e;
  });
  assert.equal(record.runs.length, 0);
  assert.equal(modelCount(isolation), 0);
}
async function until(predicate, label, timeout = 180000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (await predicate()) return;
    await wait(250);
  }
  throw Error("Bounded inspection observer expired: " + label);
}
async function setup() {
  await showGraph(window);
  await T(window, "graph-view-setup").click();
}
async function review() {
  await T(window, "graph-quick-scan").click();
  const panel = T(window, "graph-project-inspection");
  await panel.waitFor();
  await panel.getByRole("combobox").nth(0).click();
  await window.getByRole("option", { name: "8.0.426", exact: true }).click();
  await panel.getByRole("combobox").nth(1).click();
  await window.getByRole("option", { name: "net8.0", exact: true }).click();
  await panel.getByRole("button", { name: "Inspect with installed MSBuild", exact: true }).click();
  await until(
    async () => (await panel.getAttribute("data-status")) === "review-ready",
    "review-ready",
  );
  const row = (await histories()).at(-1);
  assert.ok(row && row.request && !row.reserved);
  assert.equal(row.request.inspection.sdkVersion, "8.0.426");
  await noEvidence();
  await shot(isolation, window, summary, "inspection-review", [1600, 900]);
  return { panel, row };
}
async function openPermission(panel, row) {
  await panel
    .getByRole("button", { name: "Confirm inspection and request native permission", exact: true })
    .click();
  await until(
    async () => (await panel.getAttribute("data-status")) === "awaiting-permission",
    "permission-request",
  );
  await T(window, "graph-inspection-conversation").click();
  await window.getByRole("option", { name: "Allow", exact: true }).waitFor({ timeout: 45000 });
  assert.equal((await histories()).find((r) => r.id === row.id).reserved, true);
  await noEvidence();
}
async function reconcile(id, expected) {
  await setup();
  const recovery = T(window, "graph-inspection-recovery");
  await recovery.locator("summary").click();
  const retained = recovery.locator(`[data-operation-id="${id}"]`);
  await retained.waitFor();
  await until(async () => {
    await retained.getByRole("button", { name: "Check original operation", exact: true }).click();
    return (await retained.getAttribute("data-status")) === expected;
  }, expected);
  const row = (await histories()).find((r) => r.id === id);
  assert.equal(row.reserved, false);
  await noEvidence();
  return row;
}
try {
  await configureDotnetEnvironment(isolation);
  const ws = isolation.workspace;
  await mkdir(path.join(ws, "Api/wwwroot"), { recursive: true });
  for (const [file, text] of Object.entries({
    "Api/Api.csproj":
      '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    "Api/Program.cs":
      "var builder = Microsoft.AspNetCore.Builder.WebApplication.CreateBuilder(args); var app = builder.Build(); app.Run();",
    "Api/appsettings.json": '{"Synthetic":"expected"}',
    "Api/wwwroot/site.txt": "synthetic asset",
    "global.json": JSON.stringify({ sdk: { version: "8.0.426", rollForward: "disable" } }),
  }))
    await writeFile(path.join(ws, file), text);
  await ensureShellFolders(isolation);
  window = await isolation.launch();
  await initializeU2NativeWorkspace(isolation, window, summary);
  await openNewRun(window);
  await T(window, "graph-library-entry").click();
  await window.locator('[role="option"][data-value="generic"]').click();
  await T(window, "graph-template-parameter-request").fill(
    "Synthetic installed MSBuild inspection",
  );
  await T(window, "graph-template-setup-checks").click();
  const first = await review();
  await openPermission(first.panel, first.row);
  const deny = window.getByRole("option", { name: "Deny", exact: true });
  await deny.press("Enter");
  const denied = await reconcile(first.row.id, "denied");
  summary.cases.push({
    name: "ordinary-native-denial",
    status: "PASS",
    id: denied.id,
    sessionId: denied.sessionId,
  });
  await shot(isolation, window, summary, "inspection-denied", [1600, 900]);
  const second = await review();
  await openPermission(second.panel, second.row);
  await approveNativePermissionOnce(window);
  const succeeded = await reconcile(second.row.id, "succeeded");
  assert.equal(succeeded.projection.properties.NETCoreSdkVersion, "8.0.426");
  assert.equal(succeeded.projection.properties.UsingMicrosoftNETSdkWeb, "true");
  assert.equal(succeeded.scopeComplete, false);
  assert.equal(succeeded.projection.scopeComplete, false);
  assert.ok(succeeded.projection.items.some((item) => item.identity.endsWith("site.txt")));
  summary.cases.push({
    name: "owned-native-inspection",
    status: "PASS",
    id: succeeded.id,
    projection: succeeded.projection,
    timings: succeeded.timings,
  });
  await shot(isolation, window, summary, "inspection-observed", [1600, 900]);
  await isolation.stopApp();
  window = await isolation.launch();
  await setup();
  const recovery = T(window, "graph-inspection-recovery");
  await recovery.locator("summary").click();
  await recovery
    .locator(`[data-operation-id="${succeeded.id}"][data-status="succeeded"]`)
    .waitFor();
  await noEvidence();
  assert.equal((await histories()).length, 2);
  summary.cases.push({ name: "inspection-reopen-no-replay", status: "PASS" });
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error.stack ?? String(error);
  process.exitCode = 1;
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "unavailable");
  if (window) await shot(isolation, window, summary, "inspection-failure").catch(() => {});
} finally {
  summary.history = await histories();
  summary.models = modelCount(isolation);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  await writeFile(
    path.join(isolation.home, "f1-inspection-native-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    JSON.stringify({
      status: summary.status,
      home: isolation.home,
      evidenceDir: isolation.home,
      error: summary.error,
      cases: summary.cases.map((c) => ({ name: c.name, status: c.status })),
    }),
  );
  await isolation.close();
}
