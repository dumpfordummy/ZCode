import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareB1Fixture, TEST_SOURCE, FAIL_SOURCE } from "./b1-dotnet-fixture.mjs";
import { verifyB1Result } from "./b1-native-proof.mjs";
import { ensureShellFolders } from "./ux-m2-native-common.mjs";
import { openNewRun, T, shot } from "./ux-m1-native-common.mjs";
import { addByKeyboard } from "./context-picker-helpers.mjs";
import { draftView } from "./ux-m1-native-checks-helpers.mjs";
import { readGraphRecord, modelCount, ledger, showGraph } from "./z5-native-observe.mjs";
import {
  confirmU2Review,
  openU2Permission,
  allowU2Permission,
  waitU2Run,
} from "./pre-z8-u2-boundaries.mjs";
const mode = process.argv.includes("--save-only") ? "save-only" : "native";
assert.ok(process.env.Z1_PACKAGED_EXE, "Only a hash-verified detached package is accepted.");
const isolation = await createIsolation();
const summary = {
  mode,
  home: isolation.home,
  cases: [],
  screenshots: [],
  evidenceDir: isolation.home,
};
let window;
async function noExecution() {
  const record = await readGraphRecord(isolation).catch((e) => {
    if (e.code === "ENOENT") return { runs: [] };
    throw e;
  });
  assert.equal(record.runs.length, 0);
  assert.equal(modelCount(isolation), 0);
  // Runtime startup events are not command admission. Retain the ledger separately.
  return { runs: 0, models: 0, nativeLedger: await ledger(isolation) };
}
async function openQuick() {
  await openNewRun(window);
  await T(window, "graph-library-entry").click();
  await window.locator('[role="option"][data-value="generic"]').click();
  await T(window, "graph-template-parameter-request").fill(
    "B1: preserve this request and verify real arithmetic tests",
  );
  await addByKeyboard(window, "Notes", "instructions");
  const draft = await draftView(window);
  await T(window, "graph-template-setup-checks").click();
  await T(window, "graph-quick-scan").click();
  await T(window, "graph-quick-proposal").waitFor();
  assert.equal(await T(window, "graph-quick-save").isEnabled(), true);
  const proposal = await T(window, "graph-quick-proposal").innerText();
  assert.match(proposal, /B1.sln/);
  assert.match(proposal, /B1.Tests.csproj/);
  summary.proposal = proposal;
  await shot(isolation, window, summary, "b1-quick-proposal", [1600, 900]);
  return draft;
}
async function reviewAndRun(label, fail) {
  const panel = T(window, "graph-check-preview");
  await panel.waitFor();
  const preview = JSON.parse(await T(window, "graph-check-preview-snapshot").textContent());
  assert.equal(preview.recipes.length, 2);
  assert.ok(
    preview.recipes.every((r) => r.executable === "dotnet" && r.args.includes("--no-restore")),
  );
  // 原因：首次 Save 只写检查配置；未执行前没有 Graph 历史文件，缺失只表示零历史，不能伪造记录。
  const baseline = await readGraphRecord(isolation).catch((error) => {
    if (error.code === "ENOENT") return { runs: [] };
    throw error;
  });
  await shot(isolation, window, summary, label + "-review", [1600, 900]);
  const runId = await confirmU2Review(isolation, window, baseline, preview);
  for (const node of preview.definition.nodes.filter((n) => n.type === "tool")) {
    await openU2Permission(
      isolation,
      window,
      summary,
      runId,
      node.id,
      label + "-" + node.id + "-permission",
    );
    await allowU2Permission(window);
  }
  const run = await waitU2Run(isolation, runId, (r) => ["Completed", "Failed"].includes(r.status));
  const proof = await verifyB1Result(isolation, window, run, preview, fail);
  assert.equal(modelCount(isolation), 0);
  await T(window, "graph-run-close-details")
    .click()
    .catch(() => {});
  await shot(isolation, window, summary, label + "-result", [1600, 900]);
  summary.cases.push({ name: label, status: "PASS", ...proof });
  await writeFile(path.join(isolation.home, "b1-summary.json"), JSON.stringify(summary, null, 2));
  return run;
}
try {
  summary.bootstrap = await prepareB1Fixture(isolation);
  await ensureShellFolders(isolation);
  window = await isolation.launch();
  const draft = await openQuick();
  summary.beforeSave = await noExecution();
  if (mode === "save-only") {
    await T(window, "graph-quick-save").click();
    await T(window, "graph-quick-saved").waitFor();
    summary.afterSave = await noExecution();
    const configuration = await readFile(
      path.join(isolation.workspace, ".zcode/config.json"),
      "utf8",
    );
    const recipes = JSON.parse(configuration).graphRecipes;
    assert.equal(recipes.length, 2);
    await T(window, "graph-return-to-workflow").click();
    await window
      .locator('[data-testid="graph-selected-checks-test"] [data-state="resolved"]')
      .waitFor();
    const after = await draftView(window);
    assert.equal(after.request, draft.request);
    assert.equal(after.instructions, draft.instructions);
    assert.deepEqual(
      after.build.map((r) => r.id),
      ["dotnet-build"],
    );
    assert.deepEqual(
      after.test.map((r) => r.id),
      ["dotnet-test-1"],
    );
    await shot(isolation, window, summary, "b1-q1-return-selected", [1600, 900]);
    await isolation.stopApp();
    window = await isolation.launch();
    await showGraph(window);
    await T(window, "graph-view-setup").click();
    // 原因：Quick 将内部读取状态放在折叠的 Advanced 中；等待附着，再独立验证可见的已保存检查行。
    await window
      .locator('[data-testid="graph-recipe-read-state"][data-state="ready"]')
      .waitFor({ state: "attached" });
    assert.equal(
      await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
      configuration,
    );
    await window
      .getByRole("cell", { name: "Tests/B1.Tests.csproj (net8.0)", exact: true })
      .waitFor();
    summary.afterReopen = await noExecution();
    await shot(isolation, window, summary, "b1-q1-reopened", [1600, 900]);
    summary.cases.push({
      name: "B1-Q1",
      status: "PASS",
      draftBefore: draft,
      draftAfter: after,
      recipes,
    });
  } else {
    await T(window, "graph-quick-save-run").click();
    await reviewAndRun("B1-Q2", false);
    const config = await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8");
    for (const [label, source, fail] of [
      ["B1-Q3-fail", FAIL_SOURCE, true],
      ["B1-Q3-recovered", TEST_SOURCE, false],
    ]) {
      await writeFile(path.join(isolation.workspace, "Tests/ArithmeticTests.cs"), source);
      await showGraph(window);
      await T(window, "graph-view-setup").click();
      await T(window, "graph-check-prepare").click();
      await reviewAndRun(label, fail);
      assert.equal(
        await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
        config,
      );
    }
  }
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error.stack ?? String(error);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window) await shot(isolation, window, summary, "b1-failure").catch(() => {});
  process.exitCode = 1;
} finally {
  summary.finalRecord = await readGraphRecord(isolation).catch(() => undefined);
  summary.nativeLedger = await ledger(isolation).catch(() => undefined);
  summary.models = modelCount(isolation);
  await writeFile(path.join(isolation.home, "b1-summary.json"), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify({
      status: summary.status,
      mode,
      home: isolation.home,
      error: summary.error,
      cases: summary.cases.map((c) => ({ name: c.name, status: c.status })),
    }),
  );
  await isolation.close();
}
