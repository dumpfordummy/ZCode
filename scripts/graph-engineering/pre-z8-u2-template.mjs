import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { selectValue, readGraphRecord } from "./z2-native-helpers.mjs";
import { assertU2NoExecution } from "./pre-z8-u2-proof.mjs";
import { captureNativeCheckpoint, openU2Details, U2_DIRTY_DESIGN } from "./pre-z8-u2-ui.mjs";

export async function verifyU2TemplateGroup(isolation, window, summary, baseline, configuration) {
  const request =
    "Retain this synthetic multi-scope workflow draft; calibration alone is authorized to execute.";
  // UX 审计后 Workflows 标签只剩设计画布；旧的“Workflows”页签内容现在是 Runs → New run。
  await window.getByTestId("graph-view-runs").click();
  await window.getByTestId("graph-new-run").click();
  await selectValue(window, "graph-library-entry", "generic");
  await window.locator('[data-testid="graph-recipe-read-state"][data-state="ready"]').waitFor();
  await window.getByTestId("graph-template-parameter-request").fill(request);
  await selectValue(window, "graph-template-recipe-build", "native-u2-build");
  await selectValue(window, "graph-template-recipe-test", "native-u2-test-1");
  await selectValue(window, "graph-template-build-test", "build");
  await openU2Details(window.getByTestId("graph-template-tests-test"));
  await window.getByTestId("graph-template-test-test-native-u2-test-2").setChecked(true);
  const order = window.getByTestId("graph-template-test-order-test");
  assert.equal(await order.innerText(), "native-u2-test-1 → native-u2-test-2");
  await selectValue(window, "graph-template-recipe-test", "native-u2-test-2");
  assert.equal(await order.innerText(), "native-u2-test-2 → native-u2-test-1");
  await selectValue(window, "graph-template-recipe-test", "native-u2-test-1");
  assert.equal(await order.innerText(), "native-u2-test-1 → native-u2-test-2");
  assert.equal(
    await window.getByTestId("graph-template-test-test-native-u2-test-2").isChecked(),
    true,
  );
  assert.equal(await window.getByTestId("graph-library-instantiate").isEnabled(), true);
  await assertU2NoExecution(
    isolation,
    baseline,
    "template multi-Test ordering and explicit Build mapping",
  );
  await captureNativeCheckpoint(
    isolation,
    window,
    summary,
    "pre-z8-u2-template-test-group",
    [1920, 1080],
  );
  await window.getByTestId("graph-library-instantiate").click();
  await window.getByTestId("graph-replace-dialog").waitFor();
  await window.getByTestId("graph-replace-cancel").click();
  await window.getByTestId("graph-replace-dialog").waitFor({ state: "hidden" });
  assert.equal(await order.innerText(), "native-u2-test-1 → native-u2-test-2");
  await window.getByTestId("graph-template-setup-checks").click();
  await window.getByTestId("graph-return-to-workflow").click();
  assert.equal(await window.getByTestId("graph-template-parameter-request").inputValue(), request);
  await openU2Details(window.getByTestId("graph-template-tests-test"));
  assert.equal(await order.innerText(), "native-u2-test-1 → native-u2-test-2");
  await window.getByTestId("graph-view-design").click();
  assert.equal(await window.getByTestId("graph-name").inputValue(), U2_DIRTY_DESIGN);
  assert.deepEqual(await readGraphRecord(isolation), baseline);
  assert.equal(
    await readFile(path.join(isolation.workspace, ".zcode/config.json"), "utf8"),
    configuration,
  );
  await assertU2NoExecution(isolation, baseline, "cancelled template replacement and Setup return");
  summary.assertions.push(
    "Template primary-first Test group ordering, explicit Build-slot selection, Setup/back retention and replacement Cancel preserve the exact saved/dirty design, configuration and empty run history.",
  );
  await window.getByTestId("graph-view-setup").click();
}
