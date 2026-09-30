import assert from "node:assert/strict";
import path from "node:path";
import { withU3DialogFixture } from "./pre-z8-u3-dialog.mjs";
import { selectU3Workspace } from "./pre-z8-u3-workspace.mjs";
import {
  assertU3Idle,
  captureU3,
  openU3Details,
  readU3OptionalRecord,
  revealU3Field,
  selectValue,
  u3Wait,
} from "./pre-z8-u3-common.mjs";

const role = "instructions";
const selected = (window) => window.getByTestId(`graph-template-reference-${role}`).inputValue();
const selectedReady = (window, path) =>
  u3Wait(
    () => selected(window),
    (value) => value === path,
    `selected reference ${path}`,
  );

async function validation(window, state) {
  const status = window.getByTestId(`graph-reference-status-${role}`);
  await u3Wait(
    () => status.getAttribute("data-state"),
    (value) => value === state,
    `reference validation ${state}`,
  );
  return status.innerText();
}

export async function selectU3NativeInstructions(isolation, window, summary) {
  await openU3Details(window.getByTestId("graph-reference-bindings"));
  await window.getByTestId("graph-reference-catalog-load").click();
  await window.getByTestId("graph-reference-catalog").waitFor();
  assert.equal(
    await window.getByTestId("graph-reference-catalog").getAttribute("data-status"),
    "available",
  );
  const buttons = window.locator(
    '[data-testid^="graph-reference-native-instruction-instructions-"]',
  );
  const native = buttons.filter({ hasText: /AGENTS\.md/ });
  assert.equal(await native.count(), 1);
  await native.click();
  assert.match(await validation(window, "ready"), /already|native/i);
  await selectedReady(window, "AGENTS.md");
  const skill = window.getByTestId("graph-reference-skill-skill");
  await skill.click();
  const options = await window.getByRole("option").evaluateAll((elements) =>
    elements.map((element) => ({
      value: element.getAttribute("data-value"),
      disabled: element.getAttribute("data-disabled") !== null,
      text: element.textContent,
    })),
  );
  await window.keyboard.press("Escape");
  summary.referenceCatalog = {
    status: "available",
    instructions: await native.innerText(),
    skills: options,
  };
  await assertU3Idle(isolation, "explicit catalog and native instructions selection");
}

export async function verifyU3References(isolation, window, summary, secondary) {
  const record = await readU3OptionalRecord(isolation);
  await selectU3NativeInstructions(isolation, window, summary);
  const rawSkill = window.getByTestId("graph-template-reference-skill");
  await revealU3Field(rawSkill);
  assert.equal(await rawSkill.inputValue(), "");
  await rawSkill.fill("pre-z8-u3-missing-native-skill");
  await window.getByTestId("graph-reference-skill-skill").click();
  const missingSkill = window.locator(
    '[role="option"][data-value="pre-z8-u3-missing-native-skill"]',
  );
  await missingSkill.waitFor();
  assert.equal(await missingSkill.getAttribute("aria-disabled"), "true");
  assert.match(await missingSkill.innerText(), /unknown|unavailable/i);
  await window.keyboard.press("Escape");
  await captureU3(isolation, window, summary, "pre-z8-u3-missing-skill-visible");
  await rawSkill.fill("");
  await window.getByTestId(`graph-reference-file-query-${role}`).fill("same-content.md");
  await window.getByTestId(`graph-reference-file-search-${role}`).click();
  const result = window
    .locator('[data-testid^="graph-reference-file-result-instructions-"]')
    .filter({ hasText: "docs/same-content.md" });
  await result.waitFor();
  await result.click();
  await selectedReady(window, "docs/same-content.md");
  assert.match(await validation(window, "ready"), /explicit|read/i);
  await captureU3(isolation, window, summary, "pre-z8-u3-identical-content-explicit-reference");
  await window.getByTestId("graph-reference-native-instruction-instructions-0").click();
  await selectedReady(window, "AGENTS.md");
  await validation(window, "ready");
  await withU3DialogFixture(isolation, async (dialog) => {
    let calls = 0;
    const invoke = async (response, options) => {
      const count = ++calls;
      await dialog.queue(response, options);
      await window.getByTestId(`graph-reference-native-picker-${role}`).click();
      await u3Wait(
        () => dialog.calls(),
        (value) => value.length === count,
        "controlled platform picker call",
      );
      summary.controlledDialogCalls = await dialog.calls();
    };
    await invoke({ canceled: true, filePaths: [] });
    assert.equal(await selected(window), "AGENTS.md");
    await invoke({
      canceled: false,
      filePaths: [path.join(isolation.workspace, "missing-reference.md")],
    });
    assert.match(await validation(window, "error"), /missing|ENOENT|exist|unavailable/i);
    assert.equal(await selected(window), "AGENTS.md");
    await captureU3(isolation, window, summary, "pre-z8-u3-missing-reference-preserved");
    await invoke({
      canceled: false,
      filePaths: [path.join(isolation.home, "outside-reference.md")],
    });
    await u3Wait(
      () => validation(window, "error"),
      (text) =>
        /relative|traversal|outside|bounded/i.test(text) && !text.includes("missing-reference.md"),
      "outside-workspace reference rejection",
    );
    assert.equal(await selected(window), "AGENTS.md");
    await invoke(
      { canceled: false, filePaths: [path.join(isolation.workspace, "docs/context-note.md")] },
      { hold: true },
    );
    await selectValue(window, "graph-library-entry", "generic");
    await dialog.release();
    await selectValue(window, "graph-library-entry", "agent-assisted");
    await openU3Details(window.getByTestId("graph-reference-bindings"));
    assert.equal(await selected(window), "AGENTS.md");
    await invoke(
      { canceled: false, filePaths: [path.join(isolation.workspace, "docs/context-note.md")] },
      { hold: true },
    );
    await selectU3Workspace(window, secondary);
    await dialog.release();
    await window.getByTestId("graph-view-design").click();
    assert.equal(
      await window.getByTestId("graph-name").inputValue(),
      "PRE_Z8_U3_SECONDARY_UNSAVED_DRAFT",
    );
    await selectU3Workspace(window, isolation.workspace);
    // UX 审计后 Workflows 标签只剩设计画布；旧的“Workflows”页签内容现在是 Runs → New run。
    await window.getByTestId("graph-view-runs").click();
    await window.getByTestId("graph-new-run").click();
    await openU3Details(window.getByTestId("graph-reference-bindings"));
    assert.equal(await selected(window), "AGENTS.md");
    summary.controlledDialogCalls = await dialog.calls();
    assert.equal(summary.controlledDialogCalls.length, 5);
    assert.ok(summary.controlledDialogCalls.every((call) => call.controlled));
  });
  await assertU3Idle(
    isolation,
    "reference cancellation, validation and stale template/workspace selection",
    record,
  );
  await captureU3(isolation, window, summary, "pre-z8-u3-reference-cancel-stale-preservation");
  summary.assertions.push(
    "Actual reference catalog/search/validation distinguishes exact native instructions from an identical ordinary file. Controlled platform Cancel, missing/outside paths and held late template/workspace responses preserve the existing binding and admit no work; OS dialog operation remains NOT RUN.",
  );
}
