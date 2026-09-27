import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { readGraphRecord, waitForRecord, selectValue, selectNode } from "./z2-native-helpers.mjs";
import { ledger, modelCount, showGraph } from "./z3-native-helpers.mjs";
import { captureU1 as captureU3 } from "./pre-z8-u1-ui.mjs";

export { readGraphRecord, selectValue, selectNode, showGraph, captureU3, ledger, modelCount };
export const U3_STATIC_RECIPES = [
  {
    id: "u3-build",
    name: "Inert editor Build binding",
    executable: "dotnet",
    args: ["--version"],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["fixture.mjs"],
    expectedOutputs: ["never-executed-output.txt"],
    verifier: { kind: "build" },
  },
  ...[1, 2].map((index) => ({
    id: `u3-test-${index}`,
    name: `Inert editor Test ${index} binding`,
    executable: "dotnet",
    args: ["--version"],
    cwd: ".",
    timeoutMs: 1000,
    sourcePaths: ["fixture.mjs"],
    expectedOutputs: [],
    verifier: {
      kind: "test",
      format: "zcode-json-v1",
      reportPath: `never-executed-report-${index}.json`,
      minimumTests: 1,
      requiredTests: [`inert-test-${index}`],
      buildNodeId: "build",
    },
  })),
];

export async function u3Wait(read, predicate, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(`${label} was not observed: ${JSON.stringify(value)}`);
}

export async function assertU3Idle(isolation, label, record) {
  assert.deepEqual(await ledger(isolation), [], `${label}: native Agent input was admitted.`);
  assert.equal(modelCount(isolation), 0, `${label}: model execution is forbidden.`);
  assert.deepEqual(isolation.fixture.toolResults, []);
  const current = await readU3OptionalRecord(isolation);
  assert.deepEqual(current?.runs ?? [], [], `${label}: no Graph run is permitted while editing.`);
  if (record !== undefined)
    assert.deepEqual(current, record, `${label}: persisted design changed.`);
  return current;
}

export async function readU3OptionalRecord(isolation) {
  try {
    return await readGraphRecord(isolation);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function initializeU3Workspace(isolation, window, summary) {
  await window.getByTestId("task-new-button").click();
  const composer = window.getByTestId("v4-composer-input");
  await composer.waitFor();
  assert.equal((await composer.textContent()).trim(), "");
  await window.waitForFunction(
    () =>
      [
        ...document.querySelectorAll('[data-testid^="v4-session-pane"][data-session-id="draft"]'),
      ].some(
        (pane) =>
          pane.getBoundingClientRect().width > 0 &&
          Boolean(pane.getAttribute("data-projection-seq")),
      ),
    undefined,
    { timeout: 45000 },
  );
  assert.deepEqual(await ledger(isolation), []);
  assert.equal(modelCount(isolation), 0);
  summary.nativeInitialization = {
    publicEntry: "task-new-button",
    promptSubmitted: false,
    nativeDraftProjectionObserved: true,
  };
  await showGraph(window);
}

export async function openU3Details(locator) {
  if ((await locator.getAttribute("open")) === null)
    await locator.locator(":scope > summary").click();
}

export async function revealU3Field(locator) {
  const parents = locator.locator("xpath=ancestor::details");
  for (let index = 0; index < (await parents.count()); index++) {
    const disclosure = parents.nth(index);
    if ((await disclosure.getAttribute("open")) === null)
      await disclosure.locator(":scope > summary").click();
  }
}

export async function instantiateU3Draft(isolation, window, templateId) {
  const before = await readU3OptionalRecord(isolation);
  const revision = before?.definition.revision ?? -1;
  await window.getByTestId("graph-library-instantiate").click();
  await u3Wait(
    async () => ({
      dialog: await window.getByTestId("graph-replace-dialog").isVisible(),
      record: await readU3OptionalRecord(isolation),
    }),
    (value) => value.dialog || (value.record?.definition.revision ?? -1) > revision,
    "explicit template instantiation or replacement review",
  );
  if (await window.getByTestId("graph-replace-dialog").isVisible())
    await window.getByTestId("graph-replace-discard").click();
  return u3Wait(
    () => readU3OptionalRecord(isolation),
    (record) =>
      (record?.definition.revision ?? -1) > revision &&
      record.definition.template?.id === templateId,
    "persisted explicit template instantiation",
  );
}

export async function saveU3Draft(isolation, window) {
  const before = await readGraphRecord(isolation);
  if (await window.getByTestId("graph-save").isDisabled()) return before;
  await window.getByTestId("graph-save").click();
  return waitForRecord(
    isolation,
    (record) => record.definition.revision > before.definition.revision,
  );
}

export function u3DefinitionContent(definition) {
  const { revision: _revision, ...content } = definition;
  return content;
}

export async function assertU3FixturePreserved(isolation, originalTest, expectedSource) {
  assert.equal(
    await readFile(path.join(isolation.workspace, "fixture.test.mjs"), "utf8"),
    originalTest,
  );
  assert.equal(await isolation.readFixture(), expectedSource);
}
