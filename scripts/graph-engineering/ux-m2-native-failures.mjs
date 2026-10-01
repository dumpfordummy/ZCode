// UX-M2.3 native acceptance: failure framing with the REAL Windows file dialog (driven through UI
// Automation, no controlled-dialog intent) plus real Host failures: a file outside the workspace, an
// empty slot, a cancelled dialog, a chooser error through the repository's existing test seam, a
// real instantiate failure beside Review and a Start refused by the Host after Review.
import assert from "node:assert/strict";
import { rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { openPicker } from "./context-picker-helpers.mjs";
import { popoverClosed } from "./ux-m1-native-context-helpers.mjs";
import {
  T,
  chipValue,
  driveOsDialog,
  finishReceipt,
  launchUx,
  observe,
  prepareNewRun,
  readGraphRecord,
  shot,
  snapshot,
  step,
} from "./ux-m2-native-common.mjs";
import { configPath, readConfig } from "./ux-m1-native-checks-helpers.mjs";

const HOST_UNSAFE = "Unsafe workspace-relative path segment.";
const ERROR = "graph-context-validation-error";
const errorText = (window) =>
  T(window, ERROR)
    .innerText()
    .catch(() => "");

/** Open the picker on `instructions` (replace when a value exists) and press the native chooser. */
async function pressChooser(window, { keepOpen = false } = {}) {
  if (keepOpen && (await T(window, "graph-context-popover").isVisible())) {
    await T(window, "graph-context-native-picker").click();
    return;
  }
  await closePicker(window);
  const replace = T(window, "graph-context-replace-instructions");
  if (await replace.count()) await replace.click();
  else {
    await openPicker(window);
    const slot = T(window, "graph-context-slot-instructions");
    if (await slot.count()) await slot.check();
  }
  await T(window, "graph-context-native-picker").click();
}

/** Escape only closes the picker while its search field has focus (a known harness quirk, UX-M2 report). */
async function closePicker(window) {
  if (await T(window, "graph-context-popover").isVisible()) {
    await T(window, "graph-context-search").focus();
    await window.keyboard.press("Escape");
    await popoverClosed(window);
  }
}

export async function failuresJourney() {
  const { isolation, window, receipt, files, dialogControl } = await launchUx("failures", {
    dialog: true,
    scenario: "pass",
  });
  const ws = isolation.workspace;
  const notes = path.join(ws, "docs", "Notes.md");
  let error;
  try {
    await step(
      receipt,
      "F0",
      "Real Windows dialog: choose a valid workspace file first",
      async () => {
        await prepareNewRun(window);
        await pressChooser(window);
        const opened = await driveOsDialog(isolation, "select", notes);
        observe(receipt, "the real OS dialog", opened);
        assert.equal(opened.ok, true);
        assert.match(opened.className, /#32770/);
        await popoverClosed(window);
        assert.equal(await chipValue(window, "instructions"), "docs/Notes.md");
      },
    );

    await step(
      receipt,
      "F1",
      "Real dialog, file OUTSIDE the workspace: named, previous kept, Host text unchanged",
      async () => {
        await pressChooser(window);
        assert.equal((await driveOsDialog(isolation, "select", files.outside)).ok, true);
        await T(window, ERROR).waitFor({ timeout: 20000 });
        const framing = await T(window, "graph-context-attempt").innerText();
        const full = await T(window, ERROR).innerText();
        observe(receipt, "picker failure text", full);
        assert.match(
          framing,
          /Could not use outside-secret\.md\. The previous selection docs\/Notes\.md was kept\./,
        );
        assert.equal(
          await T(window, "graph-context-attempt").getAttribute("title"),
          files.outside,
          "the full chosen path is the title",
        );
        const diagnostic = await T(window, ERROR).locator("p.text-destructive").innerText();
        assert.equal(diagnostic, HOST_UNSAFE, "the Host diagnostic is byte-identical underneath");
        assert.equal(
          await chipValue(window, "instructions"),
          "docs/Notes.md",
          "the previous binding is unchanged",
        );
        await shot(isolation, window, receipt, "f-context-failure-kept", [1280, 720]);
        await shot(isolation, window, receipt, "f-context-failure-kept", [1920, 1080]);
      },
    );

    await step(
      receipt,
      "F2",
      "Real dialog, EMPTY slot: says nothing is selected and never claims a previous selection",
      async () => {
        await closePicker(window);
        await T(window, "graph-context-remove-instructions").click();
        assert.equal(
          await T(window, "graph-context-chip-instructions").count(),
          0,
          "the slot is empty",
        );
        await pressChooser(window);
        assert.equal((await driveOsDialog(isolation, "select", files.outside)).ok, true);
        await T(window, ERROR).waitFor({ timeout: 20000 });
        const text = await errorText(window);
        observe(receipt, "empty-slot failure text", text);
        assert.match(
          text,
          /Could not use outside-secret\.md\. Nothing is selected for this slot\./,
        );
        assert.doesNotMatch(text, /previous selection|was kept/i);
        assert.ok(text.includes(HOST_UNSAFE));
        assert.equal(await T(window, "graph-context-chip-instructions").count(), 0);
        await shot(isolation, window, receipt, "f-context-failure-empty", [1280, 720]);
      },
    );

    await step(
      receipt,
      "F3",
      "Cancel the real Windows dialog: no new failure, the earlier failure does not linger",
      async () => {
        const before = await snapshot(isolation);
        assert.ok(
          (await errorText(window)).includes(HOST_UNSAFE),
          "the earlier failure is on screen",
        );
        await pressChooser(window, { keepOpen: true });
        const cancelled = await driveOsDialog(isolation, "cancel");
        assert.equal(cancelled.ok, true);
        await window.waitForFunction(
          () => !document.querySelector('[data-testid="graph-context-validation-error"]'),
          undefined,
          { timeout: 10000 },
        );
        assert.equal(
          await T(window, "graph-context-chooser-error").count(),
          0,
          "a cancel is not a chooser failure",
        );
        assert.equal(
          await T(window, "graph-context-chip-instructions").count(),
          0,
          "nothing was selected",
        );
        // 有原选择时：先选中，再失败，再取消——原选择仍在，失败说明被清除
        await pressChooser(window);
        assert.equal((await driveOsDialog(isolation, "select", notes)).ok, true);
        await popoverClosed(window);
        await pressChooser(window);
        assert.equal((await driveOsDialog(isolation, "select", files.outside)).ok, true);
        await T(window, ERROR).waitFor({ timeout: 20000 });
        await pressChooser(window, { keepOpen: true });
        assert.equal((await driveOsDialog(isolation, "cancel")).ok, true);
        await window.waitForFunction(
          () => !document.querySelector('[data-testid="graph-context-validation-error"]'),
          undefined,
          { timeout: 10000 },
        );
        assert.equal(await chipValue(window, "instructions"), "docs/Notes.md");
        assert.equal((await snapshot(isolation)).runCount, before.runCount);
      },
    );

    await step(
      receipt,
      "F4",
      "A chooser error through the existing test seam is framed with the previous selection named",
      async () => {
        // 真实对话框无法造出对话框服务本身的错误；使用仓库既有的受控对话框缝（ZCODE_GRAPH_DIALOG_CONTROL），
        // 没有为此新增任何生产路径。之后立即恢复为真实对话框。
        await dialogControl.set({ open: { fail: "Dialog service unavailable (acceptance seam)" } });
        try {
          await pressChooser(window);
          await T(window, "graph-context-chooser-error").waitFor({ timeout: 20000 });
          const text = await T(window, "graph-context-chooser-error").innerText();
          observe(receipt, "chooser error text", text);
          assert.match(
            text,
            /The file chooser did not return a file\. The previous selection docs\/Notes\.md was kept\./,
          );
          assert.match(
            text,
            /Dialog service unavailable \(acceptance seam\)/,
            "diagnostic verbatim",
          );
          assert.equal(await chipValue(window, "instructions"), "docs/Notes.md");
          await shot(isolation, window, receipt, "f-chooser-error", [1280, 720]);
        } finally {
          await dialogControl.set({});
        }
      },
    );

    await step(
      receipt,
      "F5",
      "A real instantiate failure is framed beside Review; nothing started; the draft is kept",
      async () => {
        const away = `${notes}.away`;
        await rename(notes, away);
        try {
          await T(window, "graph-review-run").click();
          await window.waitForFunction(
            () =>
              /Notes\.md/i.test(
                document.querySelector('[data-testid="graph-new-run-error"]')?.textContent ?? "",
              ),
            undefined,
            { timeout: 30000 },
          );
          const text = await T(window, "graph-new-run-error").innerText();
          observe(receipt, "Review failure text", text);
          assert.match(
            text,
            /Review could not be prepared\. Nothing was started; your request, context and check choices are kept\./,
          );
          assert.doesNotMatch(text, /Start did not complete/);
          assert.equal(await chipValue(window, "instructions"), "docs/Notes.md");
          assert.equal((await snapshot(isolation)).runCount, 0);
          await shot(isolation, window, receipt, "f-review-failure", [1280, 720]);
          await shot(isolation, window, receipt, "f-review-failure", [1920, 1080]);
        } finally {
          await rename(away, notes);
        }
      },
    );

    await step(
      receipt,
      "F6",
      "A Start the Host refuses after Review is framed without claiming nothing started",
      async () => {
        await T(window, "graph-review-run").click();
        await T(window, "graph-run-confirmation").waitFor({ timeout: 30000 });
        await T(window, "graph-preflight-ack").click();
        // 真实的 Host 拒绝：Review 之后工作区里的检查配置被外部改动。
        const config = await readConfig(ws);
        config.graphRecipes.find((recipe) => recipe.id === "reviewer-build").timeoutMs = 12345;
        await writeFile(configPath(ws), JSON.stringify(config));
        const before = (await snapshot(isolation)).runCount;
        await T(window, "graph-confirm-run").click();
        const outcome = await Promise.race([
          T(window, "graph-run-confirmation-error")
            .waitFor({ timeout: 20000 })
            .then(() => "error"),
          T(window, "graph-run-summary")
            .waitFor({ timeout: 20000 })
            .then(() => "started"),
        ]).catch(() => "neither");
        observe(receipt, "Start after an external check change", outcome);
        if (outcome === "error") {
          const text = await T(window, "graph-run-confirmation-error").innerText();
          observe(receipt, "Start failure text", text);
          assert.match(
            text,
            /Start did not complete\. Check the run list to see whether a run was admitted before you start again\./,
          );
          assert.doesNotMatch(text, /Nothing was started/);
          assert.equal((await readGraphRecord(isolation)).runs.length, before);
          await shot(isolation, window, receipt, "f-start-failure", [1280, 720]);
        } else {
          receipt.notRun.push(
            `Start refusal: the Host admitted the run after an external check change (${outcome}); no Start error could be produced by a real Host refusal`,
          );
        }
      },
    );
  } catch (caught) {
    error = caught;
  } finally {
    await finishReceipt(receipt, isolation, window, error);
  }
}
