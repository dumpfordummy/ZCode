import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareZ5Fixture } from "./z5-fixture.mjs";
import { startZ5Fixture } from "./z5-provider-fixture.mjs";
import { createRepairGraph } from "./z5-native-editor.mjs";
import { finishEvidence, ledger, modelCount, selectNode, showGraph } from "./z5-native-observe.mjs";
import { waitForSaved } from "./z2-native-helpers.mjs";

async function capture(isolation, window, summary, name) {
  const file = path.join(isolation.home, `${name}.png`);
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const handle = await isolation.app.browserWindow(window);
  try {
    const encoded = await handle.evaluate(async (owned) =>
      (await owned.capturePage()).toPNG().toString("base64"),
    );
    await writeFile(file, Buffer.from(encoded, "base64"));
  } finally {
    await handle.dispose();
  }
  summary.screenshots.push(file);
}

async function arrangeByDragging(window, ids) {
  await window.getByRole("button", { name: /^fit view$/i }).click();
  const canvas = await window.getByTestId("graph-canvas").boundingBox();
  const scale = await window
    .locator(".react-flow__viewport")
    .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  assert.ok(canvas && scale > 0);
  const positions = [
    ["start", 0, 0],
    ["task", 240, 0],
    [ids.build, 480, 0],
    [ids.test, 720, 0],
    [ids.repair, 240, 210],
    [ids.decision, 480, 210],
    [ids.reviewer, 720, 210],
    [ids.finalGate, 480, 430],
    ["end", 720, 430],
  ];
  for (const [id, x, y] of positions) {
    const box = await window.locator(`.react-flow__node[data-id="${id}"]`).boundingBox();
    assert.ok(box);
    await window.mouse.move(box.x + box.width / 2, box.y + 10 * scale);
    await window.mouse.down();
    await window.mouse.move(canvas.x + 50 + x * scale, canvas.y + 100 + y * scale, { steps: 12 });
    await window.mouse.up();
  }
  await window.getByRole("button", { name: /^fit view$/i }).click();
}

const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ5Fixture(workspace, {}),
});
const summary = {
  scenario: "presentation",
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window, failure;
try {
  await prepareZ5Fixture(isolation);
  window = await isolation.launch();
  const ids = await createRepairGraph(window, isolation, summary, "complete");
  summary.ids = ids;
  await arrangeByDragging(window, ids);
  await selectNode(window, ids.decision);
  assert.equal(await window.getByTestId("graph-output-mode").count(), 0);
  await window.getByTestId("graph-save").click();
  await waitForSaved(window);
  await capture(isolation, window, summary, "z5-readable-region-condition");
  await window.getByTestId("graph-routing-settings").locator(":scope > summary").click();
  await window.getByTestId("graph-region-max-repairs").scrollIntoViewIfNeeded();
  await capture(isolation, window, summary, "z5-explicit-repair-limits");
  await window.getByTestId("graph-routing-settings").locator(":scope > summary").click();
  await window.getByTestId("login-trigger").click();
  await window.getByRole("menuitem", { name: "App theme", exact: true }).hover();
  await window.getByRole("menuitemradio", { name: "Light theme", exact: true }).click();
  await window.waitForFunction(() => document.documentElement.className.includes("light"));
  await isolation.stopApp();
  // 只修改此脚本新建的隔离配置，重启验证中文布局；绝不读取或写入已安装应用配置。
  const settingPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
  const settings = JSON.parse(await readFile(settingPath, "utf8"));
  await writeFile(
    settingPath,
    JSON.stringify({ ...settings, localePreference: "zh-CN", locale: "zh-CN" }),
  );
  window = await isolation.launch();
  await showGraph(window);
  await window.getByTestId("graph-view-design").click();
  await selectNode(window, ids.decision);
  const handle = await isolation.app.browserWindow(window);
  try {
    await handle.evaluate((owned) => {
      owned.setMinimumSize(0, 0);
      owned.setSize(760, 1000);
    });
  } finally {
    await handle.dispose();
  }
  await window.getByTestId("graph-canvas").scrollIntoViewIfNeeded();
  await window.getByRole("button", { name: /^fit view$/i }).click();
  await capture(isolation, window, summary, "z5-chinese-light-narrow-canvas");
  await window.getByTestId("graph-condition-inputs").scrollIntoViewIfNeeded();
  await capture(isolation, window, summary, "z5-chinese-light-narrow-condition");
  assert.equal(await window.getByTestId("graph-output-mode").count(), 0);
  summary.viewport = await window.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    theme: document.documentElement.className,
    language: document.documentElement.lang,
  }));
  assert.equal(summary.viewport.width, 760);
  assert.ok(summary.viewport.theme.includes("light"));
  assert.ok(summary.viewport.scrollWidth <= summary.viewport.clientWidth);
  assert.equal((await ledger(isolation)).length, 0);
  assert.equal(modelCount(isolation), 0);
  summary.assertions.push(
    "Actual pointer drags arrange the bounded region and named Condition for readable canvas inspection; saving and viewing submit zero native/model inputs.",
    "The newly created private profile restarts in Chinese/light at 760px; Condition controls remain unique and the document has no horizontal overflow.",
  );
  summary.coverageLimit =
    "Desktop editor presentation only; actual mobile Web and user-operated checks are NOT RUN.";
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
