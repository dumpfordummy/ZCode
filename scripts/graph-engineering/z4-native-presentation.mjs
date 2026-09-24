import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createIsolation } from "./isolation.mjs";
import { prepareCSharpFixture } from "./z4-fixture.mjs";
import { startZ4Fixture } from "./z4-provider-fixture.mjs";
import { createNativeToolGraph } from "./z4-native-editor.mjs";
import {
  allowTool,
  finishEvidence,
  ledger,
  modelCount,
  openToolPermission,
  readArtifactUi,
  selectNode,
  showGraph,
  waitStatus,
  waitTool,
} from "./z4-native-helpers.mjs";

async function fitNarrowCanvas(window) {
  await window.getByRole("button", { name: /^fit view$/i }).click();
  await window.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]').getBoundingClientRect();
    const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
    return (
      nodes.length > 0 &&
      nodes.every((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.left >= canvas.left &&
          rect.right <= canvas.right &&
          rect.top >= canvas.top &&
          rect.bottom <= canvas.bottom
        );
      })
    );
  });
}

async function captureNarrow(isolation, window, summary, name) {
  const file = path.join(isolation.home, `${name}.png`);
  assert.ok((await window.evaluate(() => innerWidth)) < 1024);
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    const encoded = await nativeWindow.evaluate(async (owned) =>
      (await owned.capturePage()).toPNG().toString("base64"),
    );
    await writeFile(file, Buffer.from(encoded, "base64"));
  } finally {
    await nativeWindow.dispose();
  }
  summary.screenshots.push(file);
}

const isolation = await createIsolation({ noProvider: true, fixtureFactory: startZ4Fixture });
const summary = {
  scenario: "chinese-light-narrow",
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window, failure;
try {
  summary.fixture = await prepareCSharpFixture(isolation);
  window = await isolation.launch();
  const ids = await createNativeToolGraph(window, isolation, summary, "build-only");
  await window.getByTestId("graph-run-button").click();
  await openToolPermission(isolation, window, summary, ids.build, "presentation-build");
  await allowTool(window);
  const built = await waitTool(isolation, ids.build, (attempt) => attempt.status === "Completed");
  const run = await waitStatus(window, isolation, "Completed");
  assert.equal(built.attempt.verification.acceptancePassed, true);
  assert.equal(await window.getByTestId("graph-tool-reportFresh").innerText(), "Not applicable");
  assert.equal(await window.getByTestId("graph-tool-reportParsed").innerText(), "Not applicable");
  assert.equal(modelCount(isolation), 0);
  assert.equal((await ledger(isolation)).length, 0);

  await window.getByTestId("login-trigger").click();
  await window.getByRole("menuitem", { name: "App theme", exact: true }).hover();
  await window.getByRole("menuitemradio", { name: "Light theme", exact: true }).click();
  await window.waitForFunction(() => document.documentElement.className.includes("light"));
  await isolation.stopApp();
  // Only the newly generated private profile is configured for this presentation restart.
  const settingPath = path.join(isolation.home, "home/.zcode/v2/setting.json");
  const settings = JSON.parse(await readFile(settingPath, "utf8"));
  await writeFile(
    settingPath,
    JSON.stringify({ ...settings, localePreference: "zh-CN", locale: "zh-CN" }),
  );
  window = await isolation.launch();
  await showGraph(window);
  await selectNode(window, ids.build);
  assert.equal(await window.getByTestId("graph-tool-reportFresh").innerText(), "不适用");
  assert.equal(await window.getByTestId("graph-tool-reportParsed").innerText(), "不适用");
  const nativeWindow = await isolation.app.browserWindow(window);
  try {
    await nativeWindow.evaluate((owned) => {
      owned.setMinimumSize(0, 0);
      owned.setSize(760, 1000);
    });
  } finally {
    await nativeWindow.dispose();
  }
  await window.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await window.getByTestId("graph-canvas").scrollIntoViewIfNeeded();
  await fitNarrowCanvas(window);
  summary.layout = await window.evaluate(() => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]');
    const region = canvas.parentElement.parentElement;
    const inspector = document
      .querySelector('[data-testid="graph-node-inspector"]')
      .closest("aside");
    return {
      mainBottom: region.getBoundingClientRect().bottom,
      childrenBottom: Math.max(
        ...Array.from(region.children, (item) => item.getBoundingClientRect().bottom),
      ),
      inspectorTop: inspector.getBoundingClientRect().top,
    };
  });
  assert.ok(summary.layout.childrenBottom <= summary.layout.mainBottom + 1);
  assert.ok(summary.layout.inspectorTop >= summary.layout.mainBottom - 1);
  await captureNarrow(isolation, window, summary, "z4-chinese-light-narrow-canvas");
  await window.getByTestId("graph-tool-inspector").scrollIntoViewIfNeeded();
  await captureNarrow(isolation, window, summary, "z4-chinese-light-narrow-tool-inspector");
  const artifact = run.artifacts.find((item) => item.type === "command");
  await readArtifactUi(window, run, artifact);
  await captureNarrow(isolation, window, summary, "z4-chinese-light-narrow-artifact");
  await window.getByTestId("graph-view-design").click();
  await selectNode(window, ids.build);
  await fitNarrowCanvas(window);
  await window.getByTestId("graph-tool-node-id").scrollIntoViewIfNeeded();
  assert.equal(await window.getByTestId("graph-tool-node-id").inputValue(), ids.build);
  assert.equal(await window.getByTestId("graph-delete-node").innerText(), "删除工具节点及关联边");
  assert.ok((await window.locator("body").innerText()).includes("工具节点 ID"));
  await window.getByTestId("graph-delete-node").scrollIntoViewIfNeeded();
  await window.waitForFunction(() => {
    const rect = document
      .querySelector('[data-testid="graph-delete-node"]')
      .getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  });
  await captureNarrow(isolation, window, summary, "z4-chinese-light-narrow-tool-editor");
  summary.viewport = await window.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    theme: document.documentElement.className,
    language: document.documentElement.lang,
  }));
  assert.ok(summary.viewport.width < 1024);
  assert.ok(summary.viewport.theme.includes("light"));
  assert.ok(summary.viewport.scrollWidth <= summary.viewport.clientWidth);
  assert.equal(modelCount(isolation), 0);
  assert.equal((await ledger(isolation)).length, 0);
  summary.assertions.push(
    "The actual profile menu selected light theme; the newly generated private profile alone was set to Chinese before a completed-history restart.",
    "Actual completed native C# Build retained zero model requests; presentation and artifact reads dispatched no further work.",
    "Build report freshness/parsing is explicitly Not applicable in English and Chinese; Tool deletion names a Tool.",
    "At 760px the canvas allocation and inspector do not overlap, document width does not overflow, and Tool identity remains selectable.",
  );
  summary.coverageLimit =
    "Desktop narrow layout and Chinese/light Tool editor/inspection only. Actual mobile Web is NOT RUN.";
} catch (error) {
  failure = error;
} finally {
  await finishEvidence(isolation, summary, window, failure);
}
