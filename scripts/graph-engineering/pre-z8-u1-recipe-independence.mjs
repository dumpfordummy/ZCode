import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation, root } from "./isolation.mjs";
import { startU1Fixture } from "./pre-z8-u1-provider.mjs";
import { assertNoNativeWork, captureU1 } from "./pre-z8-u1-ui.mjs";
import { ledger, modelCount, readGraphRecord, selectValue } from "./z5-native-observe.mjs";

assert.equal(process.env.Z1_PACKAGED_EXE, undefined, "Refusing an installed executable override.");
const isolation = await createIsolation({ fixtureFactory: startU1Fixture });
const summary = {
  scenario: "pre-z8-u1-recipe-independent-preflight",
  home: isolation.home,
  workspace: isolation.workspace,
  startedAt: Date.now(),
  screenshots: [],
  assertions: [],
  execution: "NOT RUN: preparation-only fixture",
};
let window, failure;
console.error(`Pre-Z8 U1 recipe-independent profile: ${isolation.home}`);
try {
  summary.testedBuild = await Promise.all(
    [
      "apps/zcode-cli/packages/cli/dist/zcode.cjs",
      "packages/desktop/out/main/index.js",
      "packages/desktop/out/host/index.js",
      "packages/desktop/out/renderer/index.html",
    ].map(async (file) => ({
      file,
      sha256: createHash("sha256")
        .update(await readFile(path.join(root, file)))
        .digest("hex"),
    })),
  );
  const configuration = JSON.stringify({ graphRecipes: "invalid unrelated recipes" });
  await mkdir(path.join(isolation.workspace, ".zcode"));
  const configurationPath = path.join(isolation.workspace, ".zcode/config.json");
  await writeFile(configurationPath, configuration);
  window = await isolation.launch();
  await window.getByTestId("graph-engineering-open").click();
  // UX 审计后 Workflows 标签只剩设计画布；旧的“Workflows”页签内容现在是 Runs → New run。
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  await selectValue(window, "graph-library-entry", "agent-assisted");
  await window
    .getByTestId("graph-template-parameter-request")
    .fill("Inspect only this synthetic project when explicitly run; this fixture only prepares.");
  assert.equal(await window.getByTestId("graph-recipe-read-state").count(), 0);
  await window.getByTestId("graph-library-instantiate").click();
  // 第一次创建前记录文件尚不存在；先等待真实 UI 保存回执切回 Design，再读取已持久化记录。
  await window.getByTestId("graph-run-button").waitFor();
  assert.equal((await readGraphRecord(isolation)).definition.template?.id, "agent-assisted");
  await assertNoNativeWork(isolation, "agent-only instantiation with unrelated invalid recipes");
  await window.getByTestId("graph-run-button").click();
  await window.getByTestId("graph-run-confirmation").waitFor();
  const snapshot = JSON.parse(
    await window.getByTestId("graph-confirmation-definition").locator("pre").textContent(),
  );
  assert.equal(snapshot.definition.template.id, "agent-assisted");
  assert.deepEqual(snapshot.provenance.recipes, []);
  assert.equal(await window.getByTestId("graph-preflight-ack").isChecked(), false);
  assert.equal(await window.getByTestId("graph-confirm-run").isDisabled(), true);
  assert.equal(await readFile(configurationPath, "utf8"), configuration);
  assert.deepEqual((await readGraphRecord(isolation)).runs, []);
  await assertNoNativeWork(isolation, "native preflight with unrelated invalid recipes");
  assert.deepEqual(isolation.fixture.errors, []);
  summary.snapshot = snapshot;
  summary.assertions.push(
    "Actual native Agent-only instantiation and preflight accept an unrelated invalid recipe field without reading/mutating it; native configuration inventory remains authoritative, execution acknowledgement remains unchecked and zero work is admitted.",
  );
  await captureU1(isolation, window, summary, "pre-z8-u1-recipe-independent-preflight");
} catch (error) {
  failure = error;
  process.exitCode = 1;
  summary.error = error instanceof Error ? error.stack : String(error);
  summary.body = await window
    ?.locator("body")
    .innerText()
    .catch(() => "Unavailable");
  if (window)
    await captureU1(isolation, window, summary, "pre-z8-u1-recipe-independent-failure").catch(
      () => {},
    );
}
summary.status = failure ? "FAIL" : "PASS";
summary.nativeLedger = await ledger(isolation);
summary.modelRequests = modelCount(isolation);
summary.providerErrors = isolation.fixture.errors;
summary.completedAt = Date.now();
await writeFile(
  path.join(isolation.home, "pre-z8-u1-recipe-independence-summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
await isolation.close();
