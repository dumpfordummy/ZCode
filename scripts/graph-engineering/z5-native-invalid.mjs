import assert from "node:assert/strict";
import { createIsolation } from "./isolation.mjs";
import { prepareZ5Fixture } from "./z5-fixture.mjs";
import { startZ5Fixture } from "./z5-provider-fixture.mjs";
import { createConditionGraph, connect } from "./z5-native-editor.mjs";
import { waitForSaved } from "./z2-native-helpers.mjs";
import { capture, finishEvidence, ledger, modelCount } from "./z5-native-observe.mjs";

const isolation = await createIsolation({
  fixtureFactory: (workspace) => startZ5Fixture(workspace, {}),
});
const summary = {
  scenario: "invalid-topology",
  home: isolation.home,
  workspace: isolation.workspace,
  assertions: [],
  screenshots: [],
};
let window, failure;
try {
  summary.fixture = await prepareZ5Fixture(isolation);
  window = await isolation.launch();
  const ids = await createConditionGraph(window, summary, "condition-true");
  summary.ids = ids;
  for (const [kind, target] of [
    ["final-gate-bypass", "end"],
    ["off-region-cycle", ids.decision],
  ]) {
    await connect(window, ids.branches.true, target);
    await window.getByTestId("graph-save").click();
    await waitForSaved(window);
    assert.equal(await window.getByTestId("graph-run-button").isDisabled(), true);
    const text = await window.locator("body").innerText();
    assert.match(text, kind === "final-gate-bypass" ? /final|gate|approval/i : /cycle|region/i);
    (summary.invalidDefinitions ??= []).push({ kind, visibleExplanation: text });
    await capture(isolation, window, summary, `z5-invalid-${kind}`);
    assert.equal((await ledger(isolation)).length, 0);
    assert.equal(modelCount(isolation), 0);
  }
  summary.assertions.push(
    "The actual editor preserves invalid drafts but blocks Run for a final gate bypass and an undeclared cycle; zero native inputs or controlled model requests occur.",
  );
} catch (error) {
  failure = error;
}
await finishEvidence(isolation, summary, window, failure);
