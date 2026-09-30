import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { captureU1 } from "./pre-z8-u1-ui.mjs";
import {
  selectValue,
  selectNode,
  ledger,
  modelCount,
  readGraphRecord,
} from "./z5-native-observe.mjs";
import { REQUEST, recipes } from "./reviewer-native-fixture.mjs";

export async function captureReviewerSizes(isolation, window, summary, name, testId) {
  for (const size of [
    [1280, 720],
    [1920, 1080],
  ]) {
    const nativeWindow = await isolation.app.browserWindow(window);
    try {
      (summary.resizeRequests ??= []).push(
        await nativeWindow.evaluate((browserWindow) => ({
          content: browserWindow.getContentBounds(),
          maximized: browserWindow.isMaximized(),
          minimized: browserWindow.isMinimized(),
        })),
      );
      await nativeWindow.evaluate((browserWindow, [width, height]) => {
        if (browserWindow.isMinimized()) browserWindow.restore();
        if (browserWindow.isMaximized()) browserWindow.unmaximize();
        browserWindow.setContentSize(width, height);
      }, size);
    } finally {
      await nativeWindow.dispose();
    }
    await window.waitForFunction(
      ([width, height]) => innerWidth === width && innerHeight === height,
      size,
    );
    if (testId) await window.getByTestId(testId).scrollIntoViewIfNeeded();
    if (name === "normal-design")
      await window.waitForFunction(() => {
        const canvas = document
          .querySelector('[data-testid="graph-canvas"]')
          ?.getBoundingClientRect();
        const selected = document
          .querySelector('.react-flow__node[data-id="reviewer"]')
          ?.getBoundingClientRect();
        return (
          canvas &&
          selected &&
          selected.left >= canvas.left &&
          selected.right <= canvas.right &&
          selected.top >= canvas.top &&
          selected.bottom <= canvas.bottom
        );
      });
    await captureU1(isolation, window, summary, `${name}-${size.join("x")}`, size, true);
    assert.deepEqual(await window.evaluate(() => [innerWidth, innerHeight]), size);
  }
}

export async function instantiateReviewer(isolation, window, summary, uiAudit) {
  await window.getByTestId("graph-engineering-open").click();
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  await selectValue(window, "graph-library-entry", "generic");
  await window.getByTestId("graph-template-parameter-request").fill(REQUEST);
  await window.getByTestId("graph-template-load-recipes").click();
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  for (const details of await window
    .getByTestId("graph-template-reference-instructions")
    .locator("xpath=ancestor::details")
    .all())
    if ((await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  await window.getByTestId("graph-template-reference-instructions").fill("Context.md");
  await selectValue(window, "graph-template-recipe-build", "reviewer-build");
  await selectValue(window, "graph-template-recipe-test", "reviewer-test");
  if (uiAudit) {
    assert.equal(await window.getByTestId("graph-review-run").innerText(), "Review and run");
    await captureReviewerSizes(isolation, window, summary, "normal-new-run", "graph-review-run");
  }
  // 单一入口：Review and run 使用现有 instantiate + preflight；此时不得有任何原生输入或模型请求。
  await window.getByTestId("graph-review-run").click();
  await window.getByTestId("graph-run-confirmation").waitFor({ timeout: 30000 });
  const record = await readGraphRecord(isolation);
  assert.equal(record.definition.template.id, "generic");
  assert.equal(record.definition.template.version, 2);
  assert.equal(record.definition.template.parameters.request, REQUEST);
  assert.ok(record.definition.nodes.find((item) => item.id === "start").request.includes(REQUEST));
  assert.deepEqual(
    record.definition.nodes.find((item) => item.id === "reviewer").inputs.map((item) => item.alias),
    ["request", "verification"],
  );
  assert.deepEqual(
    record.definition.edges.map((item) => [item.source, item.target]),
    [
      ["start", "analyze"],
      ["analyze", "implement"],
      ["implement", "build"],
      ["build", "test"],
      ["test", "reviewer"],
      ["reviewer", "final-gate"],
      ["final-gate", "end"],
    ],
  );
  summary.instantiatedDefinition = record.definition;
  assert.deepEqual(await ledger(isolation), []);
  assert.equal(modelCount(isolation), 0);
  if (uiAudit) {
    assert.equal(await window.getByTestId("graph-workflow-request").innerText(), REQUEST);
    assert.equal(await window.getByTestId("graph-workflow-context").innerText(), "Context.md");
    assert.match(
      await window.getByTestId("graph-workflow-saved-checks").innerText(),
      /Saved checks only/,
    );
    assert.equal(
      await window.getByTestId("graph-preflight-ack").getAttribute("aria-checked"),
      "false",
    );
    // 确认/Start 区必须在 1280x720 的可见视口内（无需滚动）。
    await captureReviewerSizes(isolation, window, summary, "normal-review", "graph-review-commit");
    await window.evaluate(() => window.scrollTo(0, 0));
    // 离开 Runs 会关闭内联审阅（不创建任何输入）；随后回到 Design 再走 Review。
    await window.getByTestId("graph-view-setup").click();
    await window.getByTestId("graph-recipe-list").waitFor();
    await window.getByTestId("graph-recipe-edit-1").click();
    const name = window.getByTestId("graph-recipe-field-1-name");
    await name.fill("Test demo content edited");
    await window.getByTestId("graph-save-recipes").click();
    await window.getByTestId("graph-recipes-saved").waitFor();
    let saved = JSON.parse(
      await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
    ).graphRecipes;
    assert.deepEqual(saved[0], recipes[0]);
    assert.deepEqual(saved[1], { ...recipes[1], name: "Test demo content edited" });
    await name.fill(recipes[1].name);
    await window.getByTestId("graph-save-recipes").click();
    await window.getByTestId("graph-recipes-saved").waitFor();
    await captureReviewerSizes(
      isolation,
      window,
      summary,
      "normal-project-setup",
      "graph-recipe-list",
    );
    await captureReviewerSizes(
      isolation,
      window,
      summary,
      "normal-project-setup-editor",
      "graph-recipe-field-1-name",
    );
    await window.getByTestId("graph-view-design").click();
    await window.getByTestId("graph-editor-advanced").click();
    await selectNode(window, "reviewer");
    await window.getByTestId("graph-inspector-tab-output").click();
    await selectNode(window, "start");
    await window.getByTestId("graph-start-input").waitFor();
    await selectNode(window, "reviewer");
    await window.getByTestId("graph-inspector-tab-inputs").click();
    await window.getByTestId("graph-editor-guided").click();
    await window.locator('[data-testid="graph-inspector-tab-task"][data-state="active"]').waitFor();
    assert.ok((await window.getByTestId("graph-node-inspector").innerText()).length > 100);
    await window.waitForFunction(() => {
      const viewport = document.querySelector(".react-flow__viewport");
      return viewport && new DOMMatrix(getComputedStyle(viewport).transform).a >= 0.85;
    });
    await captureReviewerSizes(isolation, window, summary, "normal-design", "graph-canvas");
    assert.deepEqual(await ledger(isolation), []);
    assert.equal(modelCount(isolation), 0);
  }
}
