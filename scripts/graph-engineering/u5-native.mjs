import assert from "node:assert/strict";
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareU5Fixture } from "./u5-native-fixture.mjs";
import { TEST_SOURCE, FAIL_SOURCE } from "./u4-native-fixture.mjs";
import { verifyB1Result } from "./b1-native-proof.mjs";
import { ensureShellFolders } from "./ux-m2-native-common.mjs";
import { openNewRun, T } from "./ux-m1-native-common.mjs";
import { readGraphRecord, modelCount, ledger, showGraph } from "./z5-native-observe.mjs";
import {
  confirmU2Review,
  openU2Permission,
  allowU2Permission,
  waitU2Run,
  initializeU2NativeWorkspace,
} from "./pre-z8-u2-boundaries.mjs";

// 独立的中等规模原生证明；不替代或放宽 U4 的 5,013 输入断言。
assert.ok(process.argv.includes("--source") && !process.env.Z1_PACKAGED_EXE);
const isolation = await createIsolation();
const summary = { kind: "u5-moderate-source-native", sourceCount: 53, cases: [], screenshots: [] };
let window;
const record = () =>
  readGraphRecord(isolation).catch((error) => {
    if (error.code === "ENOENT") return { runs: [] };
    throw error;
  });
async function runCase(name, fail) {
  const panel = T(window, "graph-check-preview");
  await panel.waitFor();
  const preview = JSON.parse(await T(window, "graph-check-preview-snapshot").textContent());
  assert.equal(preview.recipes.length, 2);
  assert.ok(preview.recipes.every((recipe) => recipe.sourceScope.sourceCount === 53));
  assert.ok(preview.recipes.every((recipe) => recipe.args.includes("--no-restore")));
  const before = await record();
  const runId = await confirmU2Review(isolation, window, before, preview);
  for (const node of preview.definition.nodes.filter((node) => node.type === "tool")) {
    await openU2Permission(isolation, window, summary, runId, node.id, `${name}-${node.id}`);
    await allowU2Permission(window);
  }
  const run = await waitU2Run(isolation, runId, (value) =>
    ["Completed", "Failed"].includes(value.status),
  );
  const proof = await verifyB1Result(isolation, window, run, preview, fail);
  assert.deepEqual((await record()).runs.slice(0, before.runs.length), before.runs);
  assert.equal(modelCount(isolation), 0);
  summary.cases.push({ name, status: "PASS", ...proof });
  await writeFile(
    path.join(isolation.home, "u5-native-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  if (await T(window, "graph-run-close-details").count())
    await T(window, "graph-run-close-details").click();
}
try {
  summary.bootstrap = await prepareU5Fixture(isolation);
  const scale = path.join(isolation.workspace, "Library", "Scale");
  const files = await readdir(scale);
  assert.equal(files.length, 5000);
  assert.ok(files.every((file) => /^Input\d{5}\.cs$/.test(file)));
  // 只删除本次夹具创建的精确文件；没有递归路径删除。
  for (const file of files)
    if (Number(file.slice(5, 10)) >= 40) await unlink(path.join(scale, file));
  summary.bootstrap = { ...summary.bootstrap, sourceCount: 53, addedSourceFiles: 40 };
  await ensureShellFolders(isolation);
  window = await isolation.launch();
  await initializeU2NativeWorkspace(isolation, window, summary);
  await openNewRun(window);
  await T(window, "graph-library-entry").click();
  await window.locator('[role="option"][data-value="generic"]').click();
  await T(window, "graph-template-parameter-request").fill("Synthetic U5 root compatibility proof");
  await T(window, "graph-template-setup-checks").click();
  await T(window, "graph-quick-scan").click();
  await window.waitForFunction(
    () => !document.querySelector('[data-testid="graph-quick-save"]')?.disabled,
  );
  assert.equal((await record()).runs.length, 0);
  assert.equal(modelCount(isolation), 0);
  await T(window, "graph-quick-save-run").click();
  await runCase("U5-moderate-pass", false);
  const configuration = await readFile(
    path.join(isolation.workspace, ".zcode/config.json"),
    "utf8",
  );
  for (const [name, source, fail] of [
    ["U5-moderate-assertion-fail", FAIL_SOURCE, true],
    ["U5-moderate-recovered", TEST_SOURCE, false],
  ]) {
    await writeFile(path.join(isolation.workspace, "Tests/ArithmeticTests.cs"), source);
    await showGraph(window);
    await T(window, "graph-view-setup").click();
    await T(window, "graph-check-prepare").click();
    await runCase(name, fail);
    assert.equal(
      await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
      configuration,
    );
  }
  await showGraph(window);
  await T(window, "graph-view-setup").click();
  for (const file of ["Tests/data/content.txt", "Tests/data/later.txt"]) {
    await T(window, "graph-check-prepare").click();
    const panel = T(window, "graph-check-preview");
    await panel.waitFor();
    const before = await record();
    const target = path.join(isolation.workspace, file);
    const original = await readFile(target, "utf8").catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    try {
      await writeFile(
        target,
        original === undefined ? "new default member\n" : original + "changed\n",
      );
      await T(window, "graph-check-ack").setChecked(true);
      await T(window, "graph-check-confirm").click();
      await T(window, "graph-check-preview-error").waitFor();
      assert.deepEqual((await record()).runs, before.runs);
      assert.equal(modelCount(isolation), 0);
      summary.cases.push({ name: `stale-${file}`, status: "PASS", sourceCount: 53, newRuns: 0 });
    } finally {
      if (original === undefined) await unlink(target);
      else await writeFile(target, original);
    }
    await panel.getByRole("button", { name: "Close", exact: true }).first().click();
  }
  summary.status = "PASS";
} catch (error) {
  summary.status = "FAIL";
  summary.error = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  summary.finalRecord = await record();
  summary.nativeLedger = await ledger(isolation);
  summary.models = modelCount(isolation);
  await writeFile(
    path.join(isolation.home, "u5-native-summary.json"),
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
