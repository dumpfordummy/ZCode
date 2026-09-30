// UX-M1.4 journey A, second half: a late native-chooser reply, the review, and a required reference.
import assert from "node:assert/strict";
import { openPicker } from "./context-picker-helpers.mjs";
import {
  T,
  assertUnchanged,
  chipValue,
  flush,
  observe,
  shot,
  shotSizes,
  snapshot,
  step,
} from "./ux-m1-native-common.mjs";
import { pickByValue, popoverClosed } from "./ux-m1-native-context-helpers.mjs";

export async function reviewAndRequired({ isolation, window, receipt, dialogControl, abs }) {
  let afterReview;
  await step(
    receipt,
    "A8b",
    "A native chooser reply that arrives after a template switch never writes any draft",
    async () => {
      const value = await chipValue(window, "instructions");
      await dialogControl.set({ open: { pending: true } });
      await openPicker(window);
      await T(window, "graph-context-slot-instructions").check();
      await T(window, "graph-context-native-picker").click();
      // 选择器还挂起时切换工作流：选择器被卸载，晚到的回复必须被丢弃。
      await T(window, "graph-library-entry").click();
      await window.locator('[role="option"][data-value="agent-assisted"]').click();
      await T(window, "graph-template-parameter-request").waitFor();
      const held = await snapshot(isolation);
      await dialogControl.set({ open: { path: abs("docs/Notes.md") } });
      // 有界的静默观察：回复已被释放，之后没有任何草稿被写入。
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        assert.equal(
          await T(window, "graph-context-chip-instructions").count(),
          0,
          "the other workflow's draft was not written",
        );
        await flush(window);
      }
      await dialogControl.set({});
      await T(window, "graph-library-entry").click();
      await window.locator('[role="option"][data-value="generic"]').click();
      await T(window, "graph-template-recipe-build").waitFor();
      assert.equal(
        await chipValue(window, "instructions"),
        value,
        "the first workflow's binding is unchanged",
      );
      assertUnchanged(held, await snapshot(isolation), "late chooser reply");
      observe(receipt, "late native chooser reply dropped", { kept: value });
    },
  );

  await step(
    receipt,
    "A9",
    "Review shows exactly the selected reference; the preflight is fresh and unacknowledged",
    async () => {
      const selected = await chipValue(window, "instructions");
      await T(window, "graph-template-recipe-build").click();
      await window.locator('[role="option"][data-value="reviewer-build"]').click();
      await T(window, "graph-template-recipe-test").click();
      await window.locator('[role="option"][data-value="reviewer-test"]').click();
      await T(window, "graph-review-run").click();
      await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
      const context = await T(window, "graph-workflow-context").innerText();
      assert.match(context, /docs[\\/](Notes|Extra)\.md/);
      assert.doesNotMatch(context, /fixture-guidance/, "the removed skill is not in the review");
      assert.equal(await T(window, "graph-preflight-ack").getAttribute("aria-checked"), "false");
      const after = await snapshot(isolation);
      assert.equal(after.runCount, 0, "Review never starts a run");
      assert.deepEqual(after.ledger, []);
      assert.equal(after.models, 0);
      assert.equal(after.record.definition.template.bindings.references.instructions, selected);
      assert.equal(after.record.definition.template.bindings.references.skill, undefined);
      afterReview = after;
      observe(receipt, "review context text", context);
      await shotSizes(isolation, window, receipt, "a-review-context", () =>
        T(window, "graph-workflow-context").scrollIntoViewIfNeeded(),
      );
      // 离开审阅（不产生任何输入）。
      await T(window, "graph-view-setup").click();
      await T(window, "graph-view-runs").click();
      await T(window, "graph-new-run").click();
    },
  );

  await step(
    receipt,
    "A10",
    "Required reference (Slot workflow): removal blocks Review and is never optional",
    async () => {
      await T(window, "graph-library-entry").click();
      const options = await window
        .locator('[role="option"][data-value]')
        .evaluateAll((items) => items.map((item) => item.getAttribute("data-value")));
      observe(receipt, "workflow choices", options);
      const slot = options.find((value) => /slot/i.test(value ?? ""));
      assert.ok(
        slot,
        `a workflow with a required document role is offered: ${JSON.stringify(options)}`,
      );
      await window.locator(`[role="option"][data-value="${slot}"]`).click();
      await T(window, "graph-template-parameter-request").waitFor();
      await T(window, "graph-context-missing-gameDoc").waitFor();
      assert.equal(await T(window, "graph-review-run").isDisabled(), true);
      const unresolvedMissing = await T(window, "graph-template-unresolved").innerText();
      assert.match(unresolvedMissing, /GameDoc|game/i);
      await pickByValue(window, { slot: "gameDoc", query: "GameDoc", includes: "GameDoc.md" });
      await popoverClosed(window);
      assert.equal(await chipValue(window, "gameDoc"), "GameDoc.md");
      const unresolvedSet = await T(window, "graph-template-unresolved")
        .innerText()
        .catch(() => "");
      assert.doesNotMatch(
        unresolvedSet,
        /GameDoc|game/i,
        "the selected required role leaves the unresolved list",
      );
      await T(window, "graph-context-remove-gameDoc").click();
      await T(window, "graph-context-missing-gameDoc").waitFor();
      assert.equal(
        await T(window, "graph-review-run").isDisabled(),
        true,
        "Review is blocked again",
      );
      assert.match(await T(window, "graph-template-unresolved").innerText(), /GameDoc|game/i);
      assert.equal(
        await window.getByTestId("graph-context-chip-gameDoc").count(),
        0,
        "the required role has no chip: it is missing, not optional",
      );
      await shot(isolation, window, receipt, "a-required-removed-1280x720", [1280, 720]);
      assertUnchanged(afterReview, await snapshot(isolation), "required-reference removal");
    },
  );
}
